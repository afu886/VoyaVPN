use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;
use voya_core::{AppConfig, SimpleDnsDefaults, SimpleDnsItem};
use voya_db::{Database, DbError};
use voya_net::{
    PresetDnsTemplateClient, PresetDnsTemplateFetchOptions, RegionalPreset, RegionalPresetCatalog,
    RegionalPresetSources,
};

use crate::{
    routing::{manager::PreparedRoutingTemplate, RoutingManager, RoutingManagerError},
    updates::{apply_source_settings, ConfigSourceSettings},
};

pub type Result<T> = std::result::Result<T, PresetManagerError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigTemplateImportOptions {
    pub prefer_proxy: bool,
    pub proxy_url: Option<String>,
}

impl Default for ConfigTemplateImportOptions {
    fn default() -> Self {
        Self {
            prefer_proxy: true,
            proxy_url: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ConfigTemplateSelection {
    Default,
    Russia,
    Iran,
    Custom { sources: ConfigSourceSettings },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigTemplateImportResult {
    pub sources: ConfigSourceSettings,
    pub routing_ids: Vec<String>,
    pub active_routing_id: Option<String>,
    pub reused_existing_routing: bool,
    pub simple_dns_fetched: bool,
}

#[derive(Debug, Error)]
pub enum PresetManagerError {
    #[error(transparent)]
    Database(#[from] DbError),
    #[error(transparent)]
    Routing(#[from] RoutingManagerError),
    #[error("custom configuration template requires a routing template source URL")]
    MissingRoutingTemplateSource,
}

#[derive(Debug, Clone)]
pub struct PresetManager<'db> {
    database: &'db Database,
    sources: RegionalPresetCatalog,
}

impl<'db> PresetManager<'db> {
    #[must_use]
    pub fn new(database: &'db Database) -> Self {
        Self {
            database,
            sources: RegionalPresetCatalog::default(),
        }
    }

    pub async fn import_config_template(
        &self,
        config: &mut AppConfig,
        selection: ConfigTemplateSelection,
        options: ConfigTemplateImportOptions,
    ) -> Result<ConfigTemplateImportResult> {
        let routing_manager = RoutingManager::new(self.database);
        let prepared = self
            .prepare_import(&routing_manager, selection, &options)
            .await?;
        let mut next_config = config.clone();
        let normalized_sources = apply_source_settings(&mut next_config, prepared.sources.clone());
        if let Some(simple_dns) = prepared.simple_dns {
            next_config.simple_dns_item = simple_dns;
        }

        let routing_result = routing_manager
            .apply_prepared_config_template(&mut next_config, prepared.routing)
            .await?;

        *config = next_config;
        Ok(ConfigTemplateImportResult {
            sources: normalized_sources,
            routing_ids: routing_result.routing_ids,
            active_routing_id: routing_result.active_routing_id,
            reused_existing_routing: routing_result.reused_existing_routing,
            simple_dns_fetched: prepared.simple_dns_fetched,
        })
    }

    async fn prepare_import(
        &self,
        routing: &RoutingManager<'_>,
        selection: ConfigTemplateSelection,
        options: &ConfigTemplateImportOptions,
    ) -> Result<PreparedConfigTemplateImport> {
        match selection {
            ConfigTemplateSelection::Default => Ok(PreparedConfigTemplateImport {
                sources: ConfigSourceSettings::default(),
                routing: routing.prepare_builtin_config_template(),
                simple_dns: Some(SimpleDnsDefaults::builtin()),
                simple_dns_fetched: false,
            }),
            ConfigTemplateSelection::Russia => {
                self.prepare_region(
                    routing,
                    self.sources.sources(RegionalPreset::Russia).clone(),
                    options,
                )
                .await
            }
            ConfigTemplateSelection::Iran => {
                self.prepare_region(
                    routing,
                    self.sources.sources(RegionalPreset::Iran).clone(),
                    options,
                )
                .await
            }
            ConfigTemplateSelection::Custom { sources } => {
                let mut normalized_config = AppConfig::default();
                let sources = apply_source_settings(&mut normalized_config, sources);
                let source_url = sources
                    .route_rules_template_source_url
                    .as_deref()
                    .ok_or(PresetManagerError::MissingRoutingTemplateSource)?;
                let routing = routing
                    .prepare_external_config_template(
                        source_url,
                        options.prefer_proxy,
                        options.proxy_url.as_deref(),
                    )
                    .await?;
                Ok(PreparedConfigTemplateImport {
                    sources,
                    routing,
                    simple_dns: None,
                    simple_dns_fetched: false,
                })
            }
        }
    }

    async fn prepare_region(
        &self,
        routing: &RoutingManager<'_>,
        sources: RegionalPresetSources,
        options: &ConfigTemplateImportOptions,
    ) -> Result<PreparedConfigTemplateImport> {
        let source_settings = ConfigSourceSettings {
            geo_source_url: nonempty(sources.geo_source_url),
            srs_source_url: nonempty(sources.srs_source_url),
            route_rules_template_source_url: nonempty(sources.route_rules_template_source_url),
        };
        let route_source_url = source_settings
            .route_rules_template_source_url
            .as_deref()
            .ok_or(PresetManagerError::MissingRoutingTemplateSource)?;
        let routing = routing
            .prepare_external_config_template(
                route_source_url,
                options.prefer_proxy,
                options.proxy_url.as_deref(),
            )
            .await?;

        let fetch_options = PresetDnsTemplateFetchOptions {
            prefer_proxy: options.prefer_proxy,
            proxy_url: options.proxy_url.clone(),
        };
        let simple_template = PresetDnsTemplateClient::new()
            .fetch(&sources.dns_template_source_url, &fetch_options)
            .await;
        let simple_dns = simple_template
            .as_deref()
            .and_then(parse_optional_json::<SimpleDnsItem>);
        let simple_dns_fetched = simple_dns.is_some();

        Ok(PreparedConfigTemplateImport {
            sources: source_settings,
            routing,
            simple_dns: Some(simple_dns.unwrap_or_else(SimpleDnsDefaults::builtin)),
            simple_dns_fetched,
        })
    }
}

struct PreparedConfigTemplateImport {
    sources: ConfigSourceSettings,
    routing: PreparedRoutingTemplate,
    simple_dns: Option<SimpleDnsItem>,
    simple_dns_fetched: bool,
}

fn parse_optional_json<T>(content: &str) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_str::<Option<T>>(content.trim())
        .ok()
        .flatten()
}

fn nonempty(value: String) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn default_template_applies_structured_dns_and_routing_only() {
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let mut config = AppConfig::default();
        config.simple_dns_item.direct_dns = Some("1.1.1.1".to_string());

        let result = PresetManager::new(&database)
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Default,
                ConfigTemplateImportOptions::default(),
            )
            .await
            .expect("preset manager test operation should succeed");

        assert_eq!(result.routing_ids.len(), 3);
        assert!(!result.simple_dns_fetched);
        assert_eq!(
            config.simple_dns_item.direct_dns,
            SimpleDnsDefaults::builtin().direct_dns
        );
    }
}
