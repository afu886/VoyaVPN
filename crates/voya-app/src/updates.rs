use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;
use voya_core::{AppConfig, DnsItem, RoutingItem};
use voya_db::{Database, DbError};
use voya_net::ruleset::{
    collect_singbox_ruleset_assets, discover_local_singbox_ruleset_paths, geo_assets,
    AcquiredRulesetGeoAsset, AssetAcquisitionOptions, RulesetGeoClient, RulesetGeoError, SrsAsset,
};
use voya_platform::paths::AppPaths;

pub type Result<T> = std::result::Result<T, UpdateManagerError>;

#[derive(Debug, Error)]
pub enum UpdateManagerError {
    #[error(transparent)]
    Database(#[from] DbError),
    #[error(transparent)]
    RulesetGeo(#[from] RulesetGeoError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUpdateFile {
    pub name: String,
    pub bytes: u32,
    pub used_proxy: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSourceSettings {
    pub geo_source_url: Option<String>,
    pub srs_source_url: Option<String>,
    pub route_rules_template_source_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UpdateManager<'db> {
    database: &'db Database,
    paths: AppPaths,
    ruleset_geo: RulesetGeoClient,
}

impl<'db> UpdateManager<'db> {
    #[must_use]
    pub fn new(database: &'db Database, paths: AppPaths) -> Self {
        Self {
            database,
            paths,
            ruleset_geo: RulesetGeoClient::new(),
        }
    }

    #[must_use]
    pub fn source_settings(&self, config: &AppConfig) -> ConfigSourceSettings {
        source_settings(config)
    }

    pub fn save_source_settings(
        &self,
        config: &mut AppConfig,
        settings: ConfigSourceSettings,
    ) -> ConfigSourceSettings {
        apply_source_settings(config, settings)
    }

    pub async fn update_geo_assets(
        &self,
        config: &AppConfig,
        proxy_url: Option<String>,
    ) -> Result<Vec<ResourceUpdateFile>> {
        let assets = geo_assets(config.const_item.geo_source_url.as_deref());
        let acquired = self
            .ruleset_geo
            .acquire_geo_assets(
                &assets,
                self.paths.bin_dir(),
                &asset_acquisition_options(proxy_url),
            )
            .await?;

        Ok(acquired.into_iter().map(resource_update_file).collect())
    }

    pub async fn update_srs_assets(
        &self,
        config: &AppConfig,
        proxy_url: Option<String>,
    ) -> Result<Vec<ResourceUpdateFile>> {
        let routings = self.database.routings().list().await?;
        let dns_items = self.database.dns().list().await?;
        let assets = collect_srs_assets(config, &routings, &dns_items);
        let srs_dir = self.paths.bin_dir().join("srss");
        let acquired = self
            .ruleset_geo
            .acquire_srs_assets(&assets, srs_dir, &asset_acquisition_options(proxy_url))
            .await?;

        Ok(acquired.into_iter().map(resource_update_file).collect())
    }
}

#[must_use]
pub fn source_settings(config: &AppConfig) -> ConfigSourceSettings {
    ConfigSourceSettings {
        geo_source_url: config.const_item.geo_source_url.clone(),
        srs_source_url: config.const_item.srs_source_url.clone(),
        route_rules_template_source_url: config.const_item.route_rules_template_source_url.clone(),
    }
}

pub(crate) fn apply_source_settings(
    config: &mut AppConfig,
    settings: ConfigSourceSettings,
) -> ConfigSourceSettings {
    config.const_item.geo_source_url = normalize_optional_url(settings.geo_source_url);
    config.const_item.srs_source_url = normalize_optional_url(settings.srs_source_url);
    config.const_item.route_rules_template_source_url =
        normalize_optional_url(settings.route_rules_template_source_url);
    source_settings(config)
}

#[must_use]
pub fn local_singbox_ruleset_paths(paths: &AppPaths) -> BTreeMap<String, String> {
    discover_local_singbox_ruleset_paths(paths.bin_dir().join("srss"))
}

#[must_use]
pub fn collect_srs_assets(
    config: &AppConfig,
    routings: &[RoutingItem],
    dns_items: &[DnsItem],
) -> Vec<SrsAsset> {
    collect_singbox_ruleset_assets(
        config.const_item.srs_source_url.as_deref(),
        routings,
        dns_items,
    )
}

fn asset_acquisition_options(proxy_url: Option<String>) -> AssetAcquisitionOptions {
    AssetAcquisitionOptions {
        prefer_proxy: true,
        proxy_url,
    }
}

fn resource_update_file(asset: AcquiredRulesetGeoAsset) -> ResourceUpdateFile {
    ResourceUpdateFile {
        name: asset.file_name,
        bytes: u32::try_from(asset.bytes).unwrap_or(u32::MAX),
        used_proxy: asset.used_proxy,
    }
}

fn normalize_optional_url(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_settings_trim_optional_urls() {
        let mut config = AppConfig::default();
        let saved = apply_source_settings(
            &mut config,
            ConfigSourceSettings {
                geo_source_url: Some(" https://example.com/geo.zip ".to_string()),
                srs_source_url: Some("  ".to_string()),
                route_rules_template_source_url: Some(
                    "https://example.com/routing.json".to_string(),
                ),
            },
        );

        assert_eq!(
            saved.geo_source_url.as_deref(),
            Some("https://example.com/geo.zip")
        );
        assert_eq!(saved.srs_source_url, None);
        assert_eq!(
            saved.route_rules_template_source_url.as_deref(),
            Some("https://example.com/routing.json")
        );
    }

    #[test]
    fn resource_updates_always_prefer_the_runtime_proxy() {
        let options = asset_acquisition_options(Some("http://127.0.0.1:10808".to_string()));

        assert!(options.prefer_proxy);
        assert_eq!(options.proxy_url.as_deref(), Some("http://127.0.0.1:10808"));
    }

    #[test]
    fn resource_update_result_keeps_file_and_proxy_metadata() {
        let result = resource_update_file(AcquiredRulesetGeoAsset {
            kind: voya_net::ruleset::AcquiredAssetKind::Geo,
            name: "geoip".to_string(),
            file_name: "geoip.dat".to_string(),
            url: "https://example.com/geoip.dat".to_string(),
            path: "bin/geoip.dat".into(),
            bytes: u64::MAX,
            used_proxy: true,
            attempts: Vec::new(),
        });

        assert_eq!(result.name, "geoip.dat");
        assert_eq!(result.bytes, u32::MAX);
        assert!(result.used_proxy);
    }
}
