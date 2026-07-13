use serde::{Deserialize, Serialize};
use specta::Type;
use thiserror::Error;
use voya_core::{AppConfig, DnsItem, SimpleDnsDefaults, SimpleDnsItem};
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
    pub singbox_dns_fetched: bool,
    pub simple_dns_fetched: bool,
    pub fallback_custom_dns_enabled: bool,
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

    #[must_use]
    pub fn with_sources(database: &'db Database, sources: RegionalPresetCatalog) -> Self {
        Self { database, sources }
    }

    pub async fn import_config_template(
        &self,
        config: &mut AppConfig,
        selection: ConfigTemplateSelection,
        options: ConfigTemplateImportOptions,
    ) -> Result<ConfigTemplateImportResult> {
        let routing = RoutingManager::new(self.database);
        let prepared = self.prepare_import(&routing, selection, &options).await?;
        let mut next_config = config.clone();
        let normalized_sources = apply_source_settings(&mut next_config, prepared.sources.clone());
        if let Some(simple_dns) = prepared.simple_dns {
            next_config.simple_dns_item = simple_dns;
        }

        let routing_result = routing
            .apply_prepared_config_template(&mut next_config, prepared.routing)
            .await?;
        if let Some(singbox_dns) = prepared.singbox_dns {
            self.database.dns().upsert(&singbox_dns).await?;
        }

        *config = next_config;
        Ok(ConfigTemplateImportResult {
            sources: normalized_sources,
            routing_ids: routing_result.routing_ids,
            active_routing_id: routing_result.active_routing_id,
            reused_existing_routing: routing_result.reused_existing_routing,
            singbox_dns_fetched: prepared.singbox_dns_fetched,
            simple_dns_fetched: prepared.simple_dns_fetched,
            fallback_custom_dns_enabled: prepared.fallback_custom_dns_enabled,
        })
    }

    async fn prepare_import(
        &self,
        routing: &RoutingManager<'_>,
        selection: ConfigTemplateSelection,
        options: &ConfigTemplateImportOptions,
    ) -> Result<PreparedConfigTemplateImport> {
        match selection {
            ConfigTemplateSelection::Default => {
                let mut singbox_dns = self.current_dns_item().await?;
                reset_dns_item(&mut singbox_dns);
                Ok(PreparedConfigTemplateImport {
                    sources: ConfigSourceSettings::default(),
                    routing: routing.prepare_builtin_config_template(),
                    singbox_dns: Some(singbox_dns),
                    simple_dns: Some(SimpleDnsDefaults::builtin()),
                    singbox_dns_fetched: false,
                    simple_dns_fetched: false,
                    fallback_custom_dns_enabled: false,
                })
            }
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
                    singbox_dns: None,
                    simple_dns: None,
                    singbox_dns_fetched: false,
                    simple_dns_fetched: false,
                    fallback_custom_dns_enabled: false,
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
        let client = PresetDnsTemplateClient::new();
        let templates = client
            .fetch(&sources.dns_template_source_url, &fetch_options)
            .await;
        let current_singbox = self.current_dns_item().await?;
        let (mut singbox_dns, singbox_dns_fetched) = external_dns_item(
            current_singbox,
            templates.singbox_template.as_deref(),
            &client,
            &fetch_options,
        )
        .await;
        let simple_dns = external_simple_dns_item(templates.simple_template.as_deref());
        let simple_dns_fetched = simple_dns.is_some();
        let fallback_custom_dns_enabled = simple_dns.is_none();
        let simple_dns = if let Some(simple_dns) = simple_dns {
            simple_dns
        } else {
            singbox_dns.enabled = true;
            SimpleDnsDefaults::builtin()
        };

        Ok(PreparedConfigTemplateImport {
            sources: source_settings,
            routing,
            singbox_dns: Some(singbox_dns),
            simple_dns: Some(simple_dns),
            singbox_dns_fetched,
            simple_dns_fetched,
            fallback_custom_dns_enabled,
        })
    }

    async fn current_dns_item(&self) -> Result<DnsItem> {
        Ok(self
            .database
            .dns()
            .get_default()
            .await?
            .unwrap_or_else(default_dns_item))
    }
}

struct PreparedConfigTemplateImport {
    sources: ConfigSourceSettings,
    routing: PreparedRoutingTemplate,
    singbox_dns: Option<DnsItem>,
    simple_dns: Option<SimpleDnsItem>,
    singbox_dns_fetched: bool,
    simple_dns_fetched: bool,
    fallback_custom_dns_enabled: bool,
}

async fn external_dns_item(
    current: DnsItem,
    template_content: Option<&str>,
    client: &PresetDnsTemplateClient,
    fetch_options: &PresetDnsTemplateFetchOptions,
) -> (DnsItem, bool) {
    let Some(mut template) = template_content.and_then(parse_optional_json::<DnsItem>) else {
        return (current, false);
    };

    let (normal_dns, normal_dns_fetched) =
        resolve_dns_body(template.normal_dns.as_deref(), client, fetch_options).await;
    let (tun_dns, tun_dns_fetched) =
        resolve_dns_body(template.tun_dns.as_deref(), client, fetch_options).await;
    if !normal_dns_fetched || !tun_dns_fetched {
        return (current, false);
    }
    template.normal_dns = normal_dns;
    template.tun_dns = tun_dns;
    template.id = current.id;
    template.enabled = current.enabled;
    template.remarks = current.remarks;

    (template, true)
}

async fn resolve_dns_body(
    value: Option<&str>,
    client: &PresetDnsTemplateClient,
    fetch_options: &PresetDnsTemplateFetchOptions,
) -> (Option<String>, bool) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return (None, true);
    };
    if is_http_url(value) {
        match client.fetch_optional(value, fetch_options).await {
            Some(body) => (Some(body), true),
            None => (None, false),
        }
    } else {
        (Some(value.to_string()), true)
    }
}

fn external_simple_dns_item(template_content: Option<&str>) -> Option<SimpleDnsItem> {
    template_content.and_then(parse_optional_json::<SimpleDnsItem>)
}

fn parse_optional_json<T>(content: &str) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_str::<Option<T>>(content.trim())
        .ok()
        .flatten()
}

fn reset_dns_item(item: &mut DnsItem) {
    let id = std::mem::take(&mut item.id);
    let remarks = if item.remarks.trim().is_empty() {
        default_dns_item().remarks
    } else {
        item.remarks.trim().to_string()
    };

    *item = default_dns_item();
    item.id = id;
    item.remarks = remarks;
}

fn default_dns_item() -> DnsItem {
    crate::dns::default_dns_item()
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("http://") || value.starts_with("https://")
}

fn nonempty(value: String) -> Option<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, sync::Arc};

    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        sync::Mutex,
    };
    use voya_core::{RoutingItem, RulesItem, DIRECT_TAG};
    use voya_db::Database;
    use voya_net::{RegionalPresetCatalog, RegionalPresetSources};

    use super::*;

    #[tokio::test]
    async fn config_template_import_region_preflights_routing_and_applies_dns() {
        let seen_paths = Arc::new(Mutex::new(Vec::new()));
        let base = spawn_http_fixture(
            HashMap::from([
                (
                    "/routing-russia.json".to_string(),
                    r#"{
                      "version": "RU1",
                      "routingItems": [
                        { "remarks": "Russia", "url": "__BASE__/russia-rules.json" }
                      ]
                    }"#
                    .to_string(),
                ),
                (
                    "/russia-rules.json".to_string(),
                    r#"[{"remarks":"direct","outboundTag":"direct","domain":["geosite:ru"]}]"#
                        .to_string(),
                ),
                (
                    "/dns/sing_box.json".to_string(),
                    format!(
                        r#"{{"normalDNS":"{base}/sing-normal.json","domainDNSAddress":"77.88.8.8","useSystemHosts":false}}"#,
                        base = "__BASE__"
                    ),
                ),
                (
                    "/dns/simple_dns.json".to_string(),
                    r#"{"DirectDNS":"8.8.8.8","RemoteDNS":"https://dns.google/dns-query","FakeIP":true}"#
                        .to_string(),
                ),
                (
                    "/sing-normal.json".to_string(),
                    r#"{"servers":[{"tag":"remote","type":"https","server":"dns.google"}]}"#
                        .to_string(),
                ),
            ]),
            5,
            Arc::clone(&seen_paths),
        )
        .await;
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let manager = PresetManager::with_sources(&database, test_catalog(&base));
        let mut config = AppConfig::default();

        let result = manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Russia,
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect("preset manager test operation should succeed");

        let singbox = database
            .dns()
            .get_default()
            .await
            .expect("preset manager test operation should succeed")
            .expect("preset manager test operation should succeed");

        assert_eq!(
            result.sources.route_rules_template_source_url.as_deref(),
            Some(format!("{base}/routing-russia.json").as_str())
        );
        assert_eq!(result.routing_ids.len(), 1);
        assert_eq!(
            result.active_routing_id,
            Some(result.routing_ids[0].clone())
        );
        assert!(!result.reused_existing_routing);
        assert!(result.singbox_dns_fetched);
        assert!(result.simple_dns_fetched);
        assert!(!result.fallback_custom_dns_enabled);
        assert_eq!(
            config.const_item.geo_source_url.as_deref(),
            Some("https://example.test/geo-russia/{0}.dat")
        );
        assert_eq!(
            config.simple_dns_item.direct_dns.as_deref(),
            Some("8.8.8.8")
        );
        assert_eq!(config.simple_dns_item.fake_ip, Some(true));
        assert_eq!(
            singbox.normal_dns.as_deref(),
            Some(r#"{"servers":[{"tag":"remote","type":"https","server":"dns.google"}]}"#)
        );
        assert_eq!(singbox.domain_dns_address.as_deref(), Some("77.88.8.8"));
        assert_eq!(
            database
                .routings()
                .active()
                .await
                .expect("preset manager test operation should succeed")
                .expect("preset manager test operation should succeed")
                .remarks,
            "RU1-Russia"
        );
        assert_eq!(seen_paths.lock().await.len(), 5);
    }

    #[tokio::test]
    async fn config_template_import_region_keeps_dns_fallback_behavior() {
        let seen_paths = Arc::new(Mutex::new(Vec::new()));
        let base = spawn_http_fixture(
            HashMap::from([
                (
                    "/routing-iran.json".to_string(),
                    r#"{
                      "version": "IR1",
                      "routingItems": [{
                        "remarks": "Iran",
                        "ruleSet": [{
                          "remarks": "direct",
                          "outboundTag": "direct",
                          "domain": ["geosite:ir"]
                        }]
                      }]
                    }"#
                    .to_string(),
                ),
                (
                    "/dns/sing_box.json".to_string(),
                    r#"{"NormalDNS":"{\"servers\":[{\"tag\":\"remote\",\"type\":\"udp\",\"server\":\"9.9.9.9\"}]}"}"#
                        .to_string(),
                ),
                ("/dns/simple_dns.json".to_string(), "null".to_string()),
            ]),
            3,
            Arc::clone(&seen_paths),
        )
        .await;
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let manager = PresetManager::with_sources(&database, test_catalog(&base));
        let mut config = AppConfig::default();

        let result = manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Iran,
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect("preset manager test operation should succeed");

        let singbox = database
            .dns()
            .get_default()
            .await
            .expect("preset manager test operation should succeed")
            .expect("preset manager test operation should succeed");

        assert_eq!(
            result.sources.route_rules_template_source_url.as_deref(),
            Some(format!("{base}/routing-iran.json").as_str())
        );
        assert!(result.fallback_custom_dns_enabled);
        assert!(!result.simple_dns_fetched);
        assert!(singbox.enabled);
        assert_eq!(
            config.simple_dns_item.direct_dns.as_deref(),
            Some(voya_core::DEFAULT_DIRECT_DNS)
        );
        assert_eq!(
            config.const_item.srs_source_url.as_deref(),
            Some("https://example.test/srs-iran/{1}.srs")
        );
        assert_eq!(seen_paths.lock().await.len(), 3);
    }

    #[tokio::test]
    async fn config_template_import_region_keeps_current_singbox_dns_when_body_fetch_fails() {
        let seen_paths = Arc::new(Mutex::new(Vec::new()));
        let base = spawn_http_fixture(
            HashMap::from([
                (
                    "/routing-russia.json".to_string(),
                    r#"{
                      "version": "RU-DNS-FALLBACK",
                      "routingItems": [{
                        "remarks": "Russia",
                        "ruleSet": [{
                          "remarks": "direct",
                          "outboundTag": "direct",
                          "domain": ["geosite:ru"]
                        }]
                      }]
                    }"#
                    .to_string(),
                ),
                (
                    "/dns/sing_box.json".to_string(),
                    r#"{"normalDNS":"__BASE__/missing-dns.json"}"#.to_string(),
                ),
                (
                    "/dns/simple_dns.json".to_string(),
                    r#"{"DirectDNS":"8.8.4.4","RemoteDNS":"https://dns.google/dns-query"}"#
                        .to_string(),
                ),
            ]),
            4,
            Arc::clone(&seen_paths),
        )
        .await;
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let existing_dns = DnsItem {
            id: "dns-before".to_string(),
            remarks: "Before".to_string(),
            enabled: true,
            normal_dns: Some(r#"{"servers":[]}"#.to_string()),
            ..DnsItem::default()
        };
        database
            .dns()
            .upsert(&existing_dns)
            .await
            .expect("preset manager test operation should succeed");
        let manager = PresetManager::with_sources(&database, test_catalog(&base));
        let mut config = AppConfig::default();

        let result = manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Russia,
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect("preset manager test operation should succeed");

        assert!(!result.singbox_dns_fetched);
        assert!(result.simple_dns_fetched);
        assert!(!result.fallback_custom_dns_enabled);
        assert_eq!(
            config.simple_dns_item.direct_dns.as_deref(),
            Some("8.8.4.4")
        );
        assert_eq!(
            database
                .dns()
                .get_default()
                .await
                .expect("preset manager test operation should succeed"),
            Some(existing_dns)
        );
        assert!(seen_paths
            .lock()
            .await
            .iter()
            .any(|path| path == "/missing-dns.json"));
    }

    #[tokio::test]
    async fn config_template_import_default_resets_sources_and_reuses_active_builtin() {
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let manager = PresetManager::new(&database);
        let mut config = AppConfig::default();
        config.const_item.geo_source_url = Some("https://example.test/geo".to_string());
        config.const_item.srs_source_url = Some("https://example.test/srs".to_string());
        config.const_item.route_rules_template_source_url =
            Some("https://example.test/routing".to_string());

        let first = manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Default,
                ConfigTemplateImportOptions::default(),
            )
            .await
            .expect("preset manager test operation should succeed");
        let second = manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Default,
                ConfigTemplateImportOptions::default(),
            )
            .await
            .expect("preset manager test operation should succeed");

        assert_eq!(first.routing_ids.len(), 3);
        assert!(!first.reused_existing_routing);
        assert!(second.reused_existing_routing);
        assert_eq!(second.routing_ids.len(), 1);
        assert_eq!(
            second.active_routing_id,
            Some(second.routing_ids[0].clone())
        );
        assert_eq!(first.active_routing_id, second.active_routing_id);
        assert_eq!(config.const_item.geo_source_url, None);
        assert_eq!(config.const_item.srs_source_url, None);
        assert_eq!(config.const_item.route_rules_template_source_url, None);
        assert_eq!(
            database
                .routings()
                .list()
                .await
                .expect("preset manager test operation should succeed")
                .len(),
            3
        );
    }

    #[tokio::test]
    async fn config_template_import_custom_normalizes_sources_preserves_dns_and_reuses_version() {
        let seen_paths = Arc::new(Mutex::new(Vec::new()));
        let base = spawn_http_fixture(
            HashMap::from([
                (
                    "/custom-template.json".to_string(),
                    r#"{
                      "version": "CUSTOM1",
                      "routingItems": [
                        { "remarks": "Custom", "url": "__BASE__/custom-rules.json" }
                      ]
                    }"#
                    .to_string(),
                ),
                (
                    "/custom-rules.json".to_string(),
                    r#"[{"remarks":"direct","outboundTag":"direct","domain":["full:custom.example"]}]"#
                        .to_string(),
                ),
            ]),
            4,
            Arc::clone(&seen_paths),
        )
        .await;
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let existing_dns = DnsItem {
            id: "dns-custom".to_string(),
            remarks: "Keep DNS".to_string(),
            enabled: true,
            normal_dns: Some(r#"{"servers":[]}"#.to_string()),
            ..DnsItem::default()
        };
        database
            .dns()
            .upsert(&existing_dns)
            .await
            .expect("preset manager test operation should succeed");
        let manager = PresetManager::new(&database);
        let mut config = AppConfig::default();
        config.simple_dns_item.direct_dns = Some("1.1.1.1".to_string());
        let selection = || ConfigTemplateSelection::Custom {
            sources: ConfigSourceSettings {
                geo_source_url: Some(" https://example.test/geo/{0}.dat ".to_string()),
                srs_source_url: Some(" https://example.test/srs/{1}.srs ".to_string()),
                route_rules_template_source_url: Some(format!(" {base}/custom-template.json ")),
            },
        };

        let first = manager
            .import_config_template(
                &mut config,
                selection(),
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect("preset manager test operation should succeed");
        let second = manager
            .import_config_template(
                &mut config,
                selection(),
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect("preset manager test operation should succeed");

        assert_eq!(
            first.sources.geo_source_url.as_deref(),
            Some("https://example.test/geo/{0}.dat")
        );
        assert_eq!(first.active_routing_id, second.active_routing_id);
        assert!(second.reused_existing_routing);
        assert_eq!(
            database
                .routings()
                .list()
                .await
                .expect("preset manager test operation should succeed")
                .len(),
            1
        );
        assert_eq!(
            database
                .dns()
                .get_default()
                .await
                .expect("preset manager test operation should succeed"),
            Some(existing_dns)
        );
        assert_eq!(
            config.simple_dns_item.direct_dns.as_deref(),
            Some("1.1.1.1")
        );
        assert_eq!(seen_paths.lock().await.len(), 4);
    }

    #[tokio::test]
    async fn config_template_import_failed_region_child_preflight_writes_nothing() {
        let seen_paths = Arc::new(Mutex::new(Vec::new()));
        let base = spawn_http_fixture(
            HashMap::from([
                (
                    "/routing-russia.json".to_string(),
                    r#"{
                      "version": "BROKEN1",
                      "routingItems": [
                        { "remarks": "good", "url": "__BASE__/good.json" },
                        { "remarks": "missing", "url": "__BASE__/missing.json" }
                      ]
                    }"#
                    .to_string(),
                ),
                (
                    "/good.json".to_string(),
                    r#"[{"remarks":"direct","outboundTag":"direct","domain":["full:good.example"]}]"#
                        .to_string(),
                ),
            ]),
            3,
            Arc::clone(&seen_paths),
        )
        .await;
        let database = Database::connect_in_memory()
            .await
            .expect("preset manager test operation should succeed");
        let mut config = AppConfig::default();
        config.const_item.geo_source_url = Some("https://before.example/geo".to_string());
        config.simple_dns_item.direct_dns = Some("1.0.0.1".to_string());
        let existing_dns = DnsItem {
            id: "dns-before".to_string(),
            remarks: "Before".to_string(),
            enabled: true,
            normal_dns: Some("before".to_string()),
            ..DnsItem::default()
        };
        database
            .dns()
            .upsert(&existing_dns)
            .await
            .expect("preset manager test operation should succeed");
        let routing = RoutingManager::new(&database);
        let existing_routing = routing
            .save_routing(
                &mut config,
                RoutingItem {
                    remarks: "Existing".to_string(),
                    rule_set: vec![RulesItem {
                        outbound_tag: Some(DIRECT_TAG.to_string()),
                        domain: Some(vec!["full:existing.example".to_string()]),
                        ..RulesItem::default()
                    }],
                    ..RoutingItem::default()
                },
            )
            .await
            .expect("preset manager test operation should succeed");
        let config_before = config.clone();
        let manager = PresetManager::with_sources(&database, test_catalog(&base));

        manager
            .import_config_template(
                &mut config,
                ConfigTemplateSelection::Russia,
                ConfigTemplateImportOptions {
                    prefer_proxy: false,
                    proxy_url: None,
                },
            )
            .await
            .expect_err("missing child rules must fail the strict preflight");

        assert_eq!(config, config_before);
        assert_eq!(
            database
                .dns()
                .get_default()
                .await
                .expect("preset manager test operation should succeed"),
            Some(existing_dns)
        );
        assert_eq!(
            database
                .routings()
                .list()
                .await
                .expect("preset manager test operation should succeed"),
            vec![existing_routing]
        );
        assert_eq!(seen_paths.lock().await.len(), 3);
    }

    #[test]
    fn config_template_selection_uses_tagged_request_shape() {
        assert_eq!(
            serde_json::to_value(ConfigTemplateSelection::Default)
                .expect("selection should serialize"),
            serde_json::json!({ "type": "default" })
        );
        assert_eq!(
            serde_json::to_value(ConfigTemplateSelection::Custom {
                sources: ConfigSourceSettings::default(),
            })
            .expect("selection should serialize"),
            serde_json::json!({
                "type": "custom",
                "sources": {
                    "geoSourceUrl": null,
                    "srsSourceUrl": null,
                    "routeRulesTemplateSourceUrl": null
                }
            })
        );
    }

    fn test_catalog(base: &str) -> RegionalPresetCatalog {
        RegionalPresetCatalog {
            russia: RegionalPresetSources {
                geo_source_url: "https://example.test/geo-russia/{0}.dat".to_string(),
                srs_source_url: "https://example.test/srs-russia/{1}.srs".to_string(),
                route_rules_template_source_url: format!("{base}/routing-russia.json"),
                dns_template_source_url: format!("{base}/dns/"),
            },
            iran: RegionalPresetSources {
                geo_source_url: "https://example.test/geo-iran/{0}.dat".to_string(),
                srs_source_url: "https://example.test/srs-iran/{1}.srs".to_string(),
                route_rules_template_source_url: format!("{base}/routing-iran.json"),
                dns_template_source_url: format!("{base}/dns/"),
            },
        }
    }

    async fn spawn_http_fixture(
        routes: HashMap<String, String>,
        max_requests: usize,
        seen_paths: Arc<Mutex<Vec<String>>>,
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("preset manager test operation should succeed");
        let address = listener
            .local_addr()
            .expect("preset manager test operation should succeed");
        let routes = Arc::new(routes);

        tokio::spawn(async move {
            for _ in 0..max_requests {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let routes = Arc::clone(&routes);
                let seen_paths = Arc::clone(&seen_paths);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 8192];
                    let bytes_read = socket.read(&mut buffer).await.unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                    let path = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .and_then(|target| target.split('?').next())
                        .unwrap_or("/")
                        .to_string();
                    seen_paths.lock().await.push(path.clone());
                    let body = routes
                        .get(&path)
                        .map(|body| body.replace("__BASE__", &format!("http://{address}")))
                        .unwrap_or_default();
                    let status = if routes.contains_key(&path) {
                        "200 OK"
                    } else {
                        "404 Not Found"
                    };
                    let response = format!(
                        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(response.as_bytes()).await;
                });
            }
        });

        format!("http://{address}")
    }
}
