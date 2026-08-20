use thiserror::Error;
pub use voya_contracts::{
    ConfigTemplateImportOptions, ConfigTemplateImportResult, ConfigTemplateSelection,
};
use voya_core::{AppConfig, SimpleDnsDefaults, SimpleDnsItem};
use voya_db::{Database, DbError};

use crate::{
    routing::{manager::PreparedRoutingTemplate, RoutingManager, RoutingManagerError},
    updates::{apply_source_settings, ConfigSourceSettings},
};

pub type Result<T> = std::result::Result<T, PresetManagerError>;

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
}

impl<'db> PresetManager<'db> {
    #[must_use]
    pub fn new(database: &'db Database) -> Self {
        Self { database }
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
            }),
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
                })
            }
        }
    }
}

struct PreparedConfigTemplateImport {
    sources: ConfigSourceSettings,
    routing: PreparedRoutingTemplate,
    simple_dns: Option<SimpleDnsItem>,
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
        assert_eq!(
            config.simple_dns_item.direct_dns,
            SimpleDnsDefaults::builtin().direct_dns
        );
    }
}
