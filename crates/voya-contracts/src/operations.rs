use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum AutostartPlatform {
    Windows,
    Linux,
    Macos,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AutostartStatus {
    pub enabled: bool,
    pub platform: AutostartPlatform,
    pub artifact_kind: Option<String>,
    pub artifact_path: Option<String>,
    pub artifact_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ExportProfilesFormat {
    ShareLinks,
    ShareLinksBase64,
    VoyaBundle,
    ClientConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportProfilesRequest {
    pub index_ids: Vec<String>,
    pub format: ExportProfilesFormat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExportProfilesResult {
    pub text: String,
    pub count: u32,
    pub format: ExportProfilesFormat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ConfigTemplateSelection {
    Default,
    Custom { sources: ConfigSourceSettings },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigTemplateImportResult {
    pub sources: ConfigSourceSettings,
    pub routing_ids: Vec<String>,
    pub active_routing_id: Option<String>,
    pub reused_existing_routing: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrCodeImage {
    pub mime_type: String,
    pub svg: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum QrScanStatus {
    Found,
    NotFound,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrScanResult {
    pub status: QrScanStatus,
    pub text: Option<String>,
    pub source: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResourceUpdateFile {
    pub name: String,
    pub bytes: u32,
    pub used_proxy: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigSourceSettings {
    pub geo_source_url: Option<String>,
    pub srs_source_url: Option<String>,
    pub route_rules_template_source_url: Option<String>,
}
