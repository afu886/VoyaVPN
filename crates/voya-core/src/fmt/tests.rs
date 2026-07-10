use std::{collections::BTreeMap, panic};

use proptest::prelude::*;

use super::*;
use crate::{generate_singbox_config_value, AppConfig, CoreConfigContext, CoreType, PROXY_TAG};

#[test]
fn fmt_share_round_trips_all_supported_protocols() {
    for source in sample_profiles() {
        let uri = export_share_link(&source).expect("export share link");
        let parsed = parse_share_link(&uri).expect("parse exported share link");

        assert_eq!(parsed.config_type, source.config_type, "{uri}");
        assert_eq!(parsed.address, source.address, "{uri}");
        assert_eq!(parsed.port, source.port, "{uri}");
        assert_eq!(parsed.remarks, source.remarks, "{uri}");
        assert_eq!(parsed.password, source.password, "{uri}");
        assert_eq!(parsed.username, source.username, "{uri}");
    }
}

#[test]
fn fmt_base_query_round_trips_transport_security_and_masks() {
    let source = ProfileItem {
        config_type: ConfigType::VLESS,
        remarks: "advanced vless".to_string(),
        address: "vless.example".to_string(),
        port: 443,
        password: "00000000-0000-0000-0000-000000000001".to_string(),
        network: "xhttp".to_string(),
        stream_security: "reality".to_string(),
        sni: "sni.example".to_string(),
        fingerprint: "chrome".to_string(),
        public_key: "public-key".to_string(),
        short_id: "abcd".to_string(),
        spider_x: "/spider".to_string(),
        mldsa65_verify: "pqv-token".to_string(),
        ech_config_list: "https://ech.example/config".to_string(),
        cert_sha: "sha256-pin".to_string(),
        finalmask: r#"{"tcp":{"fragment":{"packets":"tlshello"}}}"#.to_string(),
        protocol_extra: ProtocolExtraItem {
            vless_encryption: Some(NONE.to_string()),
            flow: Some("xtls-rprx-vision".to_string()),
            ..ProtocolExtraItem::default()
        },
        transport_extra: TransportExtraItem {
            host: Some("cdn.example".to_string()),
            path: Some("/xhttp".to_string()),
            xhttp_mode: Some("stream-one".to_string()),
            xhttp_extra: Some(r#"{"downloadSettings":{"address":"cdn2.example"}}"#.to_string()),
            ..TransportExtraItem::default()
        },
        ..ProfileItem::default()
    };

    let uri = export_share_link(&source).expect("export advanced vless");
    let parsed = parse_share_link(&uri).expect("parse advanced vless");

    assert_eq!(parsed.stream_security, "reality");
    assert_eq!(parsed.network, "xhttp");
    assert_eq!(parsed.mldsa65_verify, "pqv-token");
    assert_eq!(parsed.ech_config_list, "https://ech.example/config");
    assert_eq!(parsed.cert_sha, "sha256-pin");
    assert!(parsed.finalmask.contains("\"fragment\""));
    assert_eq!(
        parsed.transport_extra.xhttp_mode.as_deref(),
        Some("stream-one")
    );
    assert!(parsed
        .transport_extra
        .xhttp_extra
        .as_deref()
        .unwrap_or_default()
        .contains("downloadSettings"));
}

#[test]
fn fmt_query_parser_preserves_values_containing_equals() {
    let parsed = parse_share_link(
        "vless://00000000-0000-0000-0000-000000000001@example.com:443?encryption=none&type=xhttp&extra=left=right==#eq",
    )
    .expect("parse vless with equals in query value");

    assert_eq!(parsed.network, "xhttp");
    assert_eq!(
        parsed.transport_extra.xhttp_extra.as_deref(),
        Some("left=right==")
    );
}

#[test]
fn fmt_hostile_subscription_tls_flags_are_not_trusted_by_generators() {
    let mut node = parse_share_link(
        "vless://00000000-0000-0000-0000-000000000099@hostile.example:443?encryption=none&security=tls&type=ws&host=cdn.example&path=/ws&insecure=1&fp=definitely-not-utls#hostile",
    )
    .expect("parse hostile vless share");
    node.index_id = "hostile-vless".to_string();

    assert_eq!(node.allow_insecure, ALLOW_INSECURE_TRUE);
    assert_eq!(node.fingerprint, "definitely-not-utls");

    let mut app_config = AppConfig::default();
    app_config.core_basic_item.def_fingerprint = "firefox".to_string();

    let singbox_value =
        generate_singbox_config_value(&fmt_test_context(CoreType::sing_box, app_config, node))
            .expect("sing-box config should generate");
    let singbox_proxy = proxy_outbound(&singbox_value);
    assert_eq!(
        singbox_proxy
            .pointer("/tls/insecure")
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        singbox_proxy
            .pointer("/tls/utls/fingerprint")
            .and_then(Value::as_str),
        Some("firefox")
    );
}

#[test]
fn fmt_negative_inputs_return_typed_errors_without_panicking() {
    for bad in [
        "",
        "not-a-share-uri",
        "vmess://%%%%",
        "vless://uuid@example.com",
        "ss://not-base64",
        "wireguard://key@example.com:notaport",
        "tuic://onlyuser@example.com:443",
        "v2rayn://vless/not-base64",
    ] {
        let result = panic::catch_unwind(|| {
            if starts_with_ci(bad, INNER_URI_PROTOCOL) {
                parse_inner_share_links(bad, "sub").map(|_| ())
            } else {
                parse_share_link(bad).map(|_| ())
            }
        });
        assert!(result.is_ok(), "{bad} panicked");
        assert!(result.expect("panic checked").is_err(), "{bad} parsed");
    }
}

#[test]
fn fmt_negative_inputs_cover_port_host_and_large_base64_edges() {
    let bad_port_vmess = base64_encode(
        r#"{"v":"2","ps":"bad-port","add":"example.com","port":"70000","id":"00000000-0000-0000-0000-000000000012"}"#,
        false,
    );
    let bad_host_vmess = base64_encode(
        r#"{"v":"2","ps":"bad-host","add":"bad=host","port":"443","id":"00000000-0000-0000-0000-000000000013"}"#,
        false,
    );
    let oversized_vmess = format!("vmess://{}", "A".repeat(MAX_BASE64_DECODE_INPUT + 4));
    let bad_inputs = vec![
        "vless://00000000-0000-0000-0000-000000000014@example.com:0?encryption=none".to_string(),
        "vless://00000000-0000-0000-0000-000000000014@example.com:65536?encryption=none"
            .to_string(),
        "vless://00000000-0000-0000-0000-000000000014@bad=host:443?encryption=none".to_string(),
        format!("vmess://{bad_port_vmess}"),
        format!("vmess://{bad_host_vmess}"),
        oversized_vmess,
    ];

    for bad in bad_inputs {
        let result = panic::catch_unwind(|| parse_share_link(&bad));
        assert!(result.is_ok(), "{bad} panicked");
        assert!(result.expect("panic checked").is_err(), "{bad} parsed");
    }
}

#[test]
fn fmt_shadowsocks_legacy_and_plugins_parse() {
    let legacy_payload = base64_encode("aes-128-gcm:pass@example.com:8388", false);
    let legacy = format!("ss://{legacy_payload}#legacy");
    let parsed = parse_share_link(&legacy).expect("parse legacy ss");
    assert_eq!(parsed.config_type, ConfigType::Shadowsocks);
    assert_eq!(
        parsed.protocol_extra.ss_method.as_deref(),
        Some("aes-128-gcm")
    );

    let plugin =
        url_encode("v2ray-plugin;mode=websocket;host=ws.example;path=/a\\=b\\,c;tls;mux=0");
    let sip002 = format!(
        "ss://{}@example.com:8388?plugin={plugin}#plugin",
        base64_encode("aes-256-gcm:pass", true)
    );
    let parsed = parse_share_link(&sip002).expect("parse plugin ss");
    assert_eq!(parsed.network, "ws");
    assert_eq!(parsed.stream_security, STREAM_SECURITY_TLS);
    assert_eq!(parsed.transport_extra.path.as_deref(), Some("/a=b,c"));
}

#[test]
fn fmt_parses_common_multiline_import_shapes() {
    let vmess_json = r#"{
        "v": "2",
        "ps": "JMS-TEST@example.test:17701",
        "add": "node-vmess.example.test",
        "port": "17701",
        "id": "00000000-0000-0000-0000-000000000001",
        "aid": "0",
        "scy": "auto",
        "net": "tcp",
        "type": "none",
        "host": "",
        "path": "",
        "tls": "",
        "sni": "",
        "alpn": "",
        "fp": "",
        "insecure": "0"
    }"#;
    let vmess = format!("vmess://{}", base64_encode(vmess_json, false));
    let parsed = parse_share_link(&vmess).expect("parse vmess base64 json");
    assert_eq!(parsed.config_type, ConfigType::VMess);
    assert_eq!(parsed.remarks, "JMS-TEST@example.test:17701");
    assert_eq!(parsed.address, "node-vmess.example.test");
    assert_eq!(parsed.port, 17701);
    assert_eq!(parsed.network, DEFAULT_NETWORK);
    assert_eq!(
        parsed.protocol_extra.vmess_security.as_deref(),
        Some(DEFAULT_SECURITY)
    );

    let paddingless_vmess = format!("vmess://{}", base64_encode(vmess_json, true));
    let parsed = parse_share_link(&paddingless_vmess).expect("parse paddingless vmess");
    assert_eq!(parsed.address, "node-vmess.example.test");

    let vless = "vless://00000000-0000-0000-0000-000000000002@node-vless.example.test:443?encryption=none&security=tls&sni=node-vless.example.test&fp=randomized&insecure=0&allowInsecure=0&type=ws&host=node-vless.example.test&path=%2F%3Fed%3D2048#node-vless.example.test";
    let parsed = parse_share_link(vless).expect("parse vless ws tls");
    assert_eq!(parsed.config_type, ConfigType::VLESS);
    assert_eq!(parsed.address, "node-vless.example.test");
    assert_eq!(parsed.network, "ws");
    assert_eq!(parsed.stream_security, STREAM_SECURITY_TLS);
    assert_eq!(
        parsed.transport_extra.host.as_deref(),
        Some("node-vless.example.test")
    );
    assert_eq!(parsed.transport_extra.path.as_deref(), Some("/?ed=2048"));

    let ss_user_info = base64_encode("aes-256-gcm:test-password", true);
    let ss = format!(
        "ss://{ss_user_info}@node-ss.example.test:17701?#JMS-TEST%40node-ss.example.test%3A17701"
    );
    let parsed = parse_share_link(&ss).expect("parse sip002 ss with empty query");
    assert_eq!(parsed.config_type, ConfigType::Shadowsocks);
    assert_eq!(parsed.address, "node-ss.example.test");
    assert_eq!(parsed.port, 17701);
    assert_eq!(parsed.remarks, "JMS-TEST@node-ss.example.test:17701");
    assert_eq!(
        parsed.protocol_extra.ss_method.as_deref(),
        Some("aes-256-gcm")
    );
}

#[test]
fn fmt_wireguard_config_parses_peers_and_inline_comments() {
    let config = r#"
        [Interface]
        PrivateKey = interface-private-key
        Address = 10.0.0.2/32, fd00::2/128 ; inline comment
        MTU = 1420

        [Peer]
        PublicKey = peer-public-key
        PresharedKey = peer-preshared-key
        AllowedIPs = 10.0.0.0/8, 192.168.0.0/16
        Reserved = 1, 2, 3 # inline comment
        Endpoint = [2001:db8::1]:51820 # inline comment

        [Peer]
        PublicKey = peer-public-key-2
        Endpoint = example.com:12345
    "#;

    let resolved = parse_wireguard_config(config).expect("wireguard config");
    assert_eq!(resolved.len(), 2);
    assert_eq!(resolved[0].address, "2001:db8::1");
    assert_eq!(resolved[0].port, 51820);
    assert_eq!(resolved[0].password, "interface-private-key");
    assert_eq!(
        resolved[0].protocol_extra.wg_reserved.as_deref(),
        Some("1, 2, 3")
    );
    assert_eq!(
        resolved[0].protocol_extra.wg_allowed_ips.as_deref(),
        Some("10.0.0.0/8, 192.168.0.0/16")
    );
    assert_eq!(
        resolved[0].protocol_extra.wg_interface_address.as_deref(),
        Some("10.0.0.2/32, fd00::2/128")
    );
    assert_eq!(resolved[0].protocol_extra.wg_mtu, Some(1420));
    assert_eq!(resolved[1].address, "example.com");
    assert_eq!(resolved[1].port, 12345);
}

#[test]
fn share_inner_format_round_trips_group_references() {
    let child_a = ProfileItem {
        index_id: "child-a".to_string(),
        config_type: ConfigType::SOCKS,
        remarks: "child-a".to_string(),
        address: "127.0.0.1".to_string(),
        port: 1080,
        username: "u".to_string(),
        password: "p".to_string(),
        ..ProfileItem::default()
    };
    let child_b = ProfileItem {
        index_id: "child-b".to_string(),
        config_type: ConfigType::VMess,
        remarks: "child-b".to_string(),
        address: "vmess.example".to_string(),
        port: 443,
        password: "00000000-0000-0000-0000-000000000002".to_string(),
        ..ProfileItem::default()
    };
    let group = ProfileItem {
        index_id: "group-1".to_string(),
        config_type: ConfigType::PolicyGroup,
        remarks: "group-1".to_string(),
        protocol_extra: ProtocolExtraItem {
            child_items: Some("child-a,child-b".to_string()),
            sub_child_items: Some("original-sub".to_string()),
            multiple_load: Some(MultipleLoad::LeastPing),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    };

    let uri = export_inner_share_links(&[group, child_a, child_b]).expect("export inner");
    let resolved = parse_inner_share_links(&uri, "sub-123").expect("parse inner");
    assert_eq!(resolved.len(), 3);
    let resolved_group = resolved
        .iter()
        .find(|item| item.remarks == "group-1")
        .expect("resolved group");
    assert_eq!(
        resolved_group.protocol_extra.sub_child_items.as_deref(),
        Some("sub-123")
    );
    let child_ids = resolved_group
        .protocol_extra
        .child_items
        .as_deref()
        .unwrap_or_default();
    assert!(child_ids.contains("inner-import-2"));
    assert!(child_ids.contains("inner-import-3"));
}

#[test]
fn share_full_custom_import_helpers_classify_configs_without_file_writes() {
    let unsupported = r#"{"remarks":"legacy custom","inbounds":[],"outbounds":[],"routing":{}}"#;
    assert!(parse_full_custom_config(unsupported, None).is_err());

    let singbox_array = r#"[{"inbounds":[],"outbounds":[],"route":{},"dns":{}}]"#;
    let imports =
        parse_full_custom_config(singbox_array, Some("sub")).expect("singbox array custom");
    assert_eq!(imports.len(), 1);
    assert_eq!(imports[0].kind, CustomConfigKind::SingBox);

    let html = "<!doctype html><html><head></head></html>";
    assert!(parse_full_custom_config(html, None).is_err());
}

proptest! {
    #[test]
    fn share_url_component_property_round_trips(value in "[A-Za-z0-9 _./:@,=+\\-]{0,80}") {
        prop_assert_eq!(url_decode(&url_encode(&value)), value);
    }

    #[test]
    fn share_base64_property_round_trips(value in "[A-Za-z0-9 _./:@,=+\\-]{0,80}") {
        let encoded = base64_encode(&value, true);
        prop_assert_eq!(base64_decode(&encoded, "test").expect("decode"), value);
    }
}

fn sample_profiles() -> Vec<ProfileItem> {
    vec![
        ProfileItem {
            config_type: ConfigType::VMess,
            remarks: "vmess demo".to_string(),
            address: "example.com".to_string(),
            port: 443,
            password: "00000000-0000-0000-0000-000000000003".to_string(),
            network: DEFAULT_NETWORK.to_string(),
            protocol_extra: ProtocolExtraItem {
                alter_id: Some("0".to_string()),
                vmess_security: Some(DEFAULT_SECURITY.to_string()),
                ..ProtocolExtraItem::default()
            },
            transport_extra: TransportExtraItem {
                raw_header_type: Some(NONE.to_string()),
                ..TransportExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::VLESS,
            remarks: "vless demo".to_string(),
            address: "vless.example".to_string(),
            port: 8443,
            password: "00000000-0000-0000-0000-000000000004".to_string(),
            network: "ws".to_string(),
            stream_security: STREAM_SECURITY_TLS.to_string(),
            allow_insecure: ALLOW_INSECURE_TRUE.to_string(),
            sni: "vless.example".to_string(),
            alpn: "h2,http/1.1".to_string(),
            protocol_extra: ProtocolExtraItem {
                vless_encryption: Some(NONE.to_string()),
                ..ProtocolExtraItem::default()
            },
            transport_extra: TransportExtraItem {
                host: Some("vless.example".to_string()),
                path: Some("/ws".to_string()),
                ..TransportExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::Trojan,
            remarks: "trojan demo".to_string(),
            address: "trojan.example".to_string(),
            port: 443,
            password: "trojan-pass".to_string(),
            network: "grpc".to_string(),
            stream_security: STREAM_SECURITY_TLS.to_string(),
            protocol_extra: ProtocolExtraItem {
                flow: Some("xtls-rprx-vision".to_string()),
                ..ProtocolExtraItem::default()
            },
            transport_extra: TransportExtraItem {
                grpc_authority: Some("trojan.example".to_string()),
                grpc_service_name: Some("svc".to_string()),
                grpc_mode: Some(GRPC_MULTI_MODE.to_string()),
                ..TransportExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::Shadowsocks,
            remarks: "ss demo".to_string(),
            address: "1.2.3.4".to_string(),
            port: 8388,
            password: "pass123".to_string(),
            network: DEFAULT_NETWORK.to_string(),
            protocol_extra: ProtocolExtraItem {
                ss_method: Some("aes-128-gcm".to_string()),
                ..ProtocolExtraItem::default()
            },
            transport_extra: TransportExtraItem {
                raw_header_type: Some(NONE.to_string()),
                ..TransportExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::SOCKS,
            remarks: "socks demo".to_string(),
            address: "127.0.0.1".to_string(),
            port: 1080,
            username: "user".to_string(),
            password: "pass".to_string(),
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::Hysteria2,
            remarks: "hy2 demo".to_string(),
            address: "hy2.example".to_string(),
            port: 443,
            password: "hy2-pass".to_string(),
            sni: "hy2.example".to_string(),
            cert_sha: "sha-pin,second".to_string(),
            protocol_extra: ProtocolExtraItem {
                salamander_pass: Some("obfs-pass".to_string()),
                ports: Some("1000:2000".to_string()),
                ..ProtocolExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::TUIC,
            remarks: "tuic demo".to_string(),
            address: "tuic.example".to_string(),
            port: 443,
            username: "uuid".to_string(),
            password: "tuic-pass".to_string(),
            protocol_extra: ProtocolExtraItem {
                congestion_control: Some("bbr".to_string()),
                ..ProtocolExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::WireGuard,
            remarks: "wg demo".to_string(),
            address: "2001:db8::1".to_string(),
            port: 51820,
            password: "private-key".to_string(),
            protocol_extra: ProtocolExtraItem {
                wg_public_key: Some("public-key".to_string()),
                wg_preshared_key: Some("psk".to_string()),
                wg_reserved: Some("1,2,3".to_string()),
                wg_interface_address: Some("10.0.0.2/32".to_string()),
                wg_mtu: Some(1420),
                ..ProtocolExtraItem::default()
            },
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::Anytls,
            remarks: "anytls demo".to_string(),
            address: "anytls.example".to_string(),
            port: 443,
            password: "anytls-pass".to_string(),
            stream_security: STREAM_SECURITY_TLS.to_string(),
            sni: "anytls.example".to_string(),
            ..ProfileItem::default()
        },
        ProfileItem {
            config_type: ConfigType::Naive,
            remarks: "naive demo".to_string(),
            address: "naive.example".to_string(),
            port: 443,
            username: "user".to_string(),
            password: "pass".to_string(),
            protocol_extra: ProtocolExtraItem {
                naive_quic: Some(true),
                insecure_concurrency: Some(4),
                ..ProtocolExtraItem::default()
            },
            ..ProfileItem::default()
        },
    ]
}

fn fmt_test_context(
    run_core_type: CoreType,
    app_config: AppConfig,
    node: ProfileItem,
) -> CoreConfigContext {
    let mut all_proxies_map = BTreeMap::new();
    all_proxies_map.insert(node.index_id.clone(), node.clone());
    let simple_dns_item = app_config.simple_dns_item.clone();
    CoreConfigContext {
        node,
        run_core_type,
        app_config,
        simple_dns_item,
        all_proxies_map,
        ..CoreConfigContext::default()
    }
}

fn proxy_outbound(config: &Value) -> &Value {
    config
        .get("outbounds")
        .and_then(Value::as_array)
        .and_then(|outbounds| {
            outbounds
                .iter()
                .find(|outbound| outbound.get("tag").and_then(Value::as_str) == Some(PROXY_TAG))
        })
        .expect("proxy outbound should be generated")
}
