//! Network service clients for downloads, subscriptions, Clash API,
//! geo assets, and rulesets.

mod download;
mod subscription;

pub mod clash;
pub mod ruleset;

pub use download::{
    DownloadAttempt, DownloadBytesResponse, DownloadClient, DownloadError, DownloadRequest,
    DownloadResponse, Result, DEFAULT_BINARY_RESPONSE_LIMIT_BYTES,
    DEFAULT_TEXT_RESPONSE_LIMIT_BYTES, USER_AGENT_PREFIX,
};
pub use subscription::{
    build_subscription_url, decode_base64_payload, PresetDnsTemplateClient,
    PresetDnsTemplateFetchOptions, PresetDnsTemplates, RegionalPreset, RegionalPresetCatalog,
    RegionalPresetSources, SubscriptionClient, SubscriptionFetchOptions, SubscriptionFetchResult,
    SubscriptionFetchSource, DEFAULT_SUB_CONVERT_CONFIG, DEFAULT_SUB_CONVERT_URL,
    IRAN_DNS_TEMPLATE_SOURCE_URL, IRAN_GEO_SOURCE_URL, IRAN_ROUTING_RULES_SOURCE_URL,
    IRAN_SRS_SOURCE_URL, RUSSIA_DNS_TEMPLATE_SOURCE_URL, RUSSIA_GEO_SOURCE_URL,
    RUSSIA_ROUTING_RULES_SOURCE_URL, RUSSIA_SRS_SOURCE_URL,
};

pub(crate) use download::{
    build_http_client, is_denied_local_host, read_response_text_limited, LimitedBodyReadError,
};

#[cfg(test)]
pub(crate) use download::test_support;
