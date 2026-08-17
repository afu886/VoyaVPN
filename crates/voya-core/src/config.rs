use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{GlobalHotkey, SysProxyType, TrafficMode};

pub const DEFAULT_LOCAL_PORT: i32 = 10808;
pub const DEFAULT_LOG_LEVEL: &str = "warning";
pub const DEFAULT_DOMAIN_STRATEGY: &str = "AsIs";
pub const DEFAULT_TUN_ICMP_ROUTING: &str = "rule";
pub const DEFAULT_LANGUAGE: &str = "en";
pub const DEFAULT_SPEED_TEST_URL: &str = "https://cachefly.cachefly.net/50mb.test";
pub const DEFAULT_SPEED_PING_TEST_URL: &str = "https://www.google.com/generate_204";
pub const DEFAULT_UDP_TEST_TARGET: &str = "ntp:pool.ntp.org";
pub const DEFAULT_SINGBOX_MUX: &str = "h2mux";
pub const DEFAULT_SYSTEM_PROXY_EXCEPTIONS: &str = "localhost,127.0.0.0/8,::1";
pub const DEFAULT_DIRECT_DNS: &str = "119.29.29.29";
pub const DEFAULT_REMOTE_DNS: &str = "https://cloudflare-dns.com/dns-query";
pub const DEFAULT_BOOTSTRAP_DNS: &str = "119.29.29.29";

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct AppConfig {
    pub index_id: String,
    pub sub_index_id: String,
    pub core_basic_item: CoreBasicItem,
    pub tun_mode_item: TunModeItem,
    pub grpc_item: GrpcItem,
    pub routing_basic_item: RoutingBasicItem,
    #[serde(rename = "GUIItem")]
    pub gui_item: GuiItem,
    #[serde(rename = "UIItem")]
    pub ui_item: UiItem,
    pub const_item: ConstItem,
    pub speed_test_item: SpeedTestItem,
    pub mux4_sbox_item: Mux4SboxItem,
    pub hysteria_item: HysteriaItem,
    #[serde(rename = "ProxyUIItem")]
    pub proxy_ui_item: ProxyUiItem,
    pub system_proxy_item: SystemProxyItem,
    pub inbound: Vec<InItem>,
    pub global_hotkeys: Vec<KeyEventItem>,
    #[serde(rename = "SimpleDNSItem")]
    pub simple_dns_item: SimpleDnsItem,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            index_id: String::new(),
            sub_index_id: String::new(),
            core_basic_item: CoreBasicItem::default(),
            tun_mode_item: TunModeItem::default(),
            grpc_item: GrpcItem::default(),
            routing_basic_item: RoutingBasicItem::default(),
            gui_item: GuiItem::default(),
            ui_item: UiItem::default(),
            const_item: ConstItem::default(),
            speed_test_item: SpeedTestItem::default(),
            mux4_sbox_item: Mux4SboxItem::default(),
            hysteria_item: HysteriaItem::default(),
            proxy_ui_item: ProxyUiItem::default(),
            system_proxy_item: SystemProxyItem::default(),
            inbound: vec![InItem::default()],
            global_hotkeys: Vec::new(),
            simple_dns_item: SimpleDnsItem::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct CoreBasicItem {
    pub log_enabled: bool,
    pub loglevel: String,
    pub mux_enabled: bool,
    pub def_allow_insecure: bool,
    pub def_fingerprint: String,
    pub def_user_agent: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_through: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bind_interface: Option<String>,
    pub enable_fragment: bool,
    pub enable_cache_file4_sbox: bool,
}

impl Default for CoreBasicItem {
    fn default() -> Self {
        Self {
            log_enabled: false,
            loglevel: DEFAULT_LOG_LEVEL.to_string(),
            mux_enabled: false,
            def_allow_insecure: false,
            def_fingerprint: String::new(),
            def_user_agent: String::new(),
            send_through: None,
            bind_interface: None,
            enable_fragment: false,
            enable_cache_file4_sbox: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct InItem {
    pub local_port: i32,
    pub protocol: String,
    pub sniffing_enabled: bool,
    #[serde(rename = "AllowLANConn")]
    pub allow_lan_conn: bool,
    pub new_port4_lan: bool,
    pub user: String,
    pub pass: String,
    pub second_local_port_enabled: bool,
}

impl Default for InItem {
    fn default() -> Self {
        Self {
            local_port: DEFAULT_LOCAL_PORT,
            protocol: "socks".to_string(),
            sniffing_enabled: true,
            allow_lan_conn: false,
            new_port4_lan: false,
            user: String::new(),
            pass: String::new(),
            second_local_port_enabled: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct GrpcItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_timeout: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_check_timeout: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit_without_stream: Option<bool>,
}

impl Default for GrpcItem {
    fn default() -> Self {
        Self {
            idle_timeout: Some(60),
            health_check_timeout: Some(20),
            permit_without_stream: Some(false),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct GuiItem {
    pub auto_run: bool,
    pub enable_statistics: bool,
    pub display_real_time_speed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct UiItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_theme: Option<String>,
    pub current_language: String,
}

impl Default for UiItem {
    fn default() -> Self {
        Self {
            current_theme: None,
            current_language: DEFAULT_LANGUAGE.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct ConstItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_convert_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub geo_source_url: Option<String>,
    #[serde(rename = "SrsSourceUrl", skip_serializing_if = "Option::is_none")]
    pub srs_source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route_rules_template_source_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct SpeedTestItem {
    pub speed_test_timeout: i32,
    pub speed_test_url: String,
    pub speed_ping_test_url: String,
    pub mixed_concurrency_count: i32,
    #[serde(rename = "IPAPIUrl")]
    pub ipapi_url: String,
    pub udp_test_target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_test_page_size: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_test_delay_interval: Option<i32>,
}

impl Default for SpeedTestItem {
    fn default() -> Self {
        Self {
            speed_test_timeout: 10,
            speed_test_url: DEFAULT_SPEED_TEST_URL.to_string(),
            speed_ping_test_url: DEFAULT_SPEED_PING_TEST_URL.to_string(),
            mixed_concurrency_count: 5,
            ipapi_url: String::new(),
            udp_test_target: DEFAULT_UDP_TEST_TARGET.to_string(),
            speed_test_page_size: None,
            speed_test_delay_interval: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct RoutingBasicItem {
    pub domain_strategy: String,
    pub domain_strategy4_singbox: String,
    pub routing_index_id: String,
}

impl Default for RoutingBasicItem {
    fn default() -> Self {
        Self {
            domain_strategy: DEFAULT_DOMAIN_STRATEGY.to_string(),
            domain_strategy4_singbox: String::new(),
            routing_index_id: String::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct Mux4SboxItem {
    pub protocol: String,
    pub max_connections: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding: Option<bool>,
}

impl Default for Mux4SboxItem {
    fn default() -> Self {
        Self {
            protocol: DEFAULT_SINGBOX_MUX.to_string(),
            max_connections: 8,
            padding: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct HysteriaItem {
    pub up_mbps: i32,
    pub down_mbps: i32,
    pub hop_interval: i32,
}

impl Default for HysteriaItem {
    fn default() -> Self {
        Self {
            up_mbps: 100,
            down_mbps: 100,
            hop_interval: 30,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct ProxyUiItem {
    pub traffic_mode: TrafficMode,
    pub node_sorting: i32,
}

impl Default for ProxyUiItem {
    fn default() -> Self {
        Self {
            traffic_mode: TrafficMode::Rule,
            node_sorting: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct SystemProxyItem {
    pub sys_proxy_type: SysProxyType,
    pub system_proxy_exceptions: String,
    pub not_proxy_local_address: bool,
    pub system_proxy_advanced_protocol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_system_proxy_pac_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_system_proxy_script_path: Option<String>,
}

impl Default for SystemProxyItem {
    fn default() -> Self {
        Self {
            sys_proxy_type: SysProxyType::ForcedClear,
            system_proxy_exceptions: DEFAULT_SYSTEM_PROXY_EXCEPTIONS.to_string(),
            not_proxy_local_address: true,
            system_proxy_advanced_protocol: String::new(),
            custom_system_proxy_pac_path: None,
            custom_system_proxy_script_path: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct KeyEventItem {
    #[serde(rename = "EGlobalHotkey")]
    pub global_hotkey: GlobalHotkey,
    pub alt: bool,
    pub control: bool,
    pub shift: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_code: Option<i32>,
}

impl Default for KeyEventItem {
    fn default() -> Self {
        Self {
            global_hotkey: GlobalHotkey::ShowForm,
            alt: false,
            control: false,
            shift: false,
            key_code: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct TunModeItem {
    pub enable_tun: bool,
    pub auto_route: bool,
    pub strict_route: bool,
    pub stack: String,
    pub mtu: i32,
    #[serde(rename = "EnableIPv6Address")]
    pub enable_ipv6_address: bool,
    pub icmp_routing: String,
}

impl Default for TunModeItem {
    fn default() -> Self {
        Self {
            enable_tun: false,
            auto_route: true,
            strict_route: false,
            stack: String::new(),
            mtu: 1500,
            enable_ipv6_address: false,
            icmp_routing: DEFAULT_TUN_ICMP_ROUTING.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(rename_all = "PascalCase", deny_unknown_fields)]
pub struct SimpleDnsItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_system_hosts: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add_common_hosts: Option<bool>,
    #[serde(rename = "FakeIP", skip_serializing_if = "Option::is_none")]
    pub fake_ip: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_fake_ip: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_binding_query: Option<bool>,
    #[serde(rename = "DirectDNS", skip_serializing_if = "Option::is_none")]
    pub direct_dns: Option<String>,
    #[serde(rename = "RemoteDNS", skip_serializing_if = "Option::is_none")]
    pub remote_dns: Option<String>,
    #[serde(rename = "BootstrapDNS", skip_serializing_if = "Option::is_none")]
    pub bootstrap_dns: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy4_freedom: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy4_proxy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serve_stale: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parallel_query: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hosts: Option<String>,
    #[serde(rename = "DirectExpectedIPs", skip_serializing_if = "Option::is_none")]
    pub direct_expected_ips: Option<String>,
}

impl Default for SimpleDnsItem {
    fn default() -> Self {
        SimpleDnsDefaults::builtin()
    }
}

pub struct SimpleDnsDefaults;

impl SimpleDnsDefaults {
    #[must_use]
    pub fn builtin() -> SimpleDnsItem {
        SimpleDnsItem {
            use_system_hosts: Some(false),
            add_common_hosts: Some(true),
            fake_ip: Some(false),
            global_fake_ip: Some(true),
            block_binding_query: Some(true),
            direct_dns: Some(DEFAULT_DIRECT_DNS.to_string()),
            remote_dns: Some(DEFAULT_REMOTE_DNS.to_string()),
            bootstrap_dns: Some(DEFAULT_BOOTSTRAP_DNS.to_string()),
            strategy4_freedom: None,
            strategy4_proxy: None,
            serve_stale: Some(false),
            parallel_query: Some(false),
            hosts: None,
            direct_expected_ips: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn app_config_defaults_match_foundation_source() {
        let config = AppConfig::default();

        assert_eq!(config.inbound.len(), 1);
        assert_eq!(config.inbound[0].protocol, "socks");
        assert_eq!(config.inbound[0].local_port, 10808);
        assert!(config.inbound[0].sniffing_enabled);
        assert_eq!(config.core_basic_item.loglevel, "warning");
        assert_eq!(config.routing_basic_item.domain_strategy, "AsIs");
        assert_eq!(config.tun_mode_item.mtu, 1500);
        assert!(!config.tun_mode_item.strict_route);
        assert_eq!(config.speed_test_item.speed_test_timeout, 10);
        assert_eq!(config.speed_test_item.mixed_concurrency_count, 5);
        assert_eq!(config.mux4_sbox_item.protocol, "h2mux");
        assert_eq!(config.hysteria_item.up_mbps, 100);
        assert_eq!(config.hysteria_item.down_mbps, 100);
        assert_eq!(
            config.system_proxy_item.system_proxy_exceptions,
            DEFAULT_SYSTEM_PROXY_EXCEPTIONS
        );
        assert_eq!(
            config.simple_dns_item.direct_dns.as_deref(),
            Some(DEFAULT_DIRECT_DNS)
        );
        assert_eq!(
            config.simple_dns_item.remote_dns.as_deref(),
            Some(DEFAULT_REMOTE_DNS)
        );
    }

    #[test]
    fn app_config_uses_stable_acronym_property_names() {
        let json = serde_json::to_value(AppConfig::default())
            .expect("default app config should serialize to JSON");
        let object = json
            .as_object()
            .expect("default app config JSON should be an object");

        assert!(object.contains_key("GUIItem"));
        assert!(object.contains_key("UIItem"));
        assert!(object.contains_key("ProxyUIItem"));
        assert!(!object.contains_key("ClashUIItem"));
        assert!(object.contains_key("SimpleDNSItem"));
    }

    #[test]
    fn current_app_config_schema_round_trips() {
        let expected = AppConfig::default();
        let json = serde_json::to_value(&expected).expect("app config should serialize");
        let actual: AppConfig =
            serde_json::from_value(json).expect("current app config should deserialize");

        assert_eq!(actual, expected);
    }

    #[test]
    fn missing_required_app_config_field_is_rejected() {
        let mut json =
            serde_json::to_value(AppConfig::default()).expect("app config should serialize");
        json.as_object_mut()
            .expect("app config JSON should be an object")
            .remove("CoreBasicItem");

        let error = serde_json::from_value::<AppConfig>(json)
            .expect_err("missing required app config field should fail");
        assert!(error.to_string().contains("CoreBasicItem"));
    }

    #[test]
    fn unknown_app_config_fields_are_rejected_at_every_level() {
        let mut root =
            serde_json::to_value(AppConfig::default()).expect("app config should serialize");
        root.as_object_mut()
            .expect("app config JSON should be an object")
            .insert("ClashUIItem".to_string(), json!({}));
        assert!(serde_json::from_value::<AppConfig>(root).is_err());

        let mut nested =
            serde_json::to_value(AppConfig::default()).expect("app config should serialize");
        nested
            .pointer_mut("/ConstItem")
            .and_then(serde_json::Value::as_object_mut)
            .expect("ConstItem should be an object")
            .insert("CdnBaseUrl".to_string(), json!("https://legacy.example"));
        assert!(serde_json::from_value::<AppConfig>(nested).is_err());
    }

    #[test]
    fn invalid_app_config_field_types_are_rejected() {
        let mut json =
            serde_json::to_value(AppConfig::default()).expect("app config should serialize");
        *json
            .pointer_mut("/Inbound/0/LocalPort")
            .expect("default inbound port should exist") = json!("10808");

        assert!(serde_json::from_value::<AppConfig>(json).is_err());
    }
}
