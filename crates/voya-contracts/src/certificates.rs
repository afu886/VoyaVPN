use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CertificateFetchRequest {
    pub address: String,
    pub port: u16,
    pub server_name: Option<String>,
    pub allow_insecure: bool,
    pub include_chain: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CertificateFetchResult {
    pub pem: String,
    pub sha256: Vec<String>,
    pub chain_count: u32,
    pub warning: Option<String>,
}
