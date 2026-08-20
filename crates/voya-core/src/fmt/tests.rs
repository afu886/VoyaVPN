use std::{collections::BTreeMap, panic};

use proptest::prelude::*;

use super::*;
use crate::{generate_singbox_config_value, AppConfig, CoreConfigContext, CoreType, PROXY_TAG};

#[test]
fn fmt_share_round_trips_all_supported_protocols() {
    for source in sample_profiles() {
        let uri = export_share_link(&source).expect("export share link");
        let parsed = parse_share_link(&uri).expect("parse exported share link");

        assert_eq!(parsed.config_type(), source.config_type(), "{uri}");
        assert_eq!(parsed.address(), source.address(), "{uri}");
        assert_eq!(parsed.port(), source.port(), "{uri}");
        assert_eq!(parsed.remarks, source.remarks, "{uri}");
        assert_eq!(parsed.password(), source.password(), "{uri}");
        assert_eq!(parsed.username(), source.username(), "{uri}");
    }
}

#[test]
fn fmt_share_export_materializes_supported_global_runtime_options() {
    let options = ShareLinkOptions {
        allow_insecure: true,
        fingerprint: "firefox".to_string(),
        hysteria_up_mbps: 80,
        hysteria_down_mbps: 160,
        hysteria_hop_interval: 25,
    };
    let vless = ProfileItem {
        protocol: ProfileProtocol::Vless {
            server: endpoint("vless.example", 443),
            uuid: "00000000-0000-0000-0000-000000000001".to_string(),
            flow: None,
            encryption: Some(NONE.to_string()),
        },
        tls: Some(tls(TlsMode::Tls, "vless.example")),
        ..ProfileItem::default()
    };
    let vless_link = export_share_link_with_options(&vless, &options)
        .expect("global VLESS options should export");
    let vless_url = Url::parse(&vless_link).expect("VLESS link should parse");
    let vless_query = vless_url.query_pairs().collect::<BTreeMap<_, _>>();
    assert_eq!(
        vless_query.get("insecure").map(|value| value.as_ref()),
        Some("1")
    );
    assert_eq!(
        vless_query.get("fp").map(|value| value.as_ref()),
        Some("firefox")
    );

    let hysteria = ProfileItem {
        protocol: ProfileProtocol::Hysteria2 {
            server: endpoint("hy2.example", 443),
            password: "secret".to_string(),
            port_hops: None,
            obfuscation_password: None,
        },
        ..ProfileItem::default()
    };
    let hysteria_link = export_share_link_with_options(&hysteria, &options)
        .expect("global Hysteria options should export");
    let hysteria_url = Url::parse(&hysteria_link).expect("Hysteria link should parse");
    let hysteria_query = hysteria_url.query_pairs().collect::<BTreeMap<_, _>>();
    assert_eq!(
        hysteria_query.get("upmbps").map(|value| value.as_ref()),
        Some("80")
    );
    assert_eq!(
        hysteria_query.get("downmbps").map(|value| value.as_ref()),
        Some("160")
    );
    assert_eq!(
        hysteria_query
            .get("hopInterval")
            .map(|value| value.as_ref()),
        Some("25")
    );
}

#[test]
fn fmt_base_query_round_trips_transport_security_and_masks() {
    let source = ProfileItem {
        remarks: "advanced vless".to_string(),
        protocol: ProfileProtocol::Vless {
            server: endpoint("vless.example", 443),
            uuid: "00000000-0000-0000-0000-000000000001".to_string(),
            flow: Some("xtls-rprx-vision".to_string()),
            encryption: Some(NONE.to_string()),
        },
        transport: Some(ProfileTransport::Xhttp {
            host: Some("cdn.example".to_string()),
            path: Some("/xhttp".to_string()),
            mode: Some("stream-one".to_string()),
            extra: Some(r#"{"downloadSettings":{"address":"cdn2.example"}}"#.to_string()),
        }),
        tls: Some(TlsSettings {
            mode: TlsMode::Reality,
            server_name: Some("sni.example".to_string()),
            alpn: Vec::new(),
            reality_public_key: Some("public-key".to_string()),
            reality_short_id: Some("abcd".to_string()),
            reality_spider_x: Some("/spider".to_string()),
            mldsa65_verify: Some("pqv-token".to_string()),
            certificate_pem: None,
            certificate_sha256: vec!["sha256-pin".to_string()],
            ech_config: vec!["https://ech.example/config".to_string()],
            final_mask: Some(r#"{"tcp":{"fragment":{"packets":"tlshello"}}}"#.to_string()),
        }),
        ..ProfileItem::default()
    };

    let uri = export_share_link(&source).expect("export advanced vless");
    let parsed = parse_share_link(&uri).expect("parse advanced vless");

    let parsed_tls = parsed.tls.as_ref().expect("TLS settings");
    assert_eq!(parsed_tls.mode, TlsMode::Reality);
    assert_eq!(parsed_tls.mldsa65_verify.as_deref(), Some("pqv-token"));
    assert_eq!(
        parsed_tls.ech_config,
        vec!["https://ech.example/config".to_string()]
    );
    assert_eq!(parsed_tls.certificate_sha256, vec!["sha256-pin"]);
    assert!(parsed_tls
        .final_mask
        .as_deref()
        .is_some_and(|value| value.contains("\"fragment\"")));
    let Some(ProfileTransport::Xhttp { mode, extra, .. }) = parsed.transport.as_ref() else {
        panic!("expected xhttp transport");
    };
    assert_eq!(mode.as_deref(), Some("stream-one"));
    assert!(extra
        .as_deref()
        .is_some_and(|value| value.contains("downloadSettings")));
}

#[test]
fn fmt_query_parser_preserves_values_containing_equals() {
    let parsed = parse_share_link(
        "vless://00000000-0000-0000-0000-000000000001@example.com:443?encryption=none&type=xhttp&extra=left=right==#eq",
    )
    .expect("parse vless with equals in query value");

    let Some(ProfileTransport::Xhttp { extra, .. }) = parsed.transport else {
        panic!("expected xhttp transport");
    };
    assert_eq!(extra.as_deref(), Some("left=right=="));
}

#[test]
fn fmt_hostile_subscription_tls_flags_are_not_trusted_by_generators() {
    let mut node = parse_share_link(
        "vless://00000000-0000-0000-0000-000000000099@hostile.example:443?encryption=none&security=tls&type=ws&host=cdn.example&path=/ws&insecure=1&fp=definitely-not-utls#hostile",
    )
    .expect("parse hostile vless share");
    node.index_id = "hostile-vless".to_string();

    let mut app_config = AppConfig::default();
    app_config.core_basic_item.def_allow_insecure = false;
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
        "voya://profiles/v1/not-base64",
        "v2rayn://retired-private-format",
    ] {
        let result = panic::catch_unwind(|| {
            if starts_with_ci(bad, VOYA_PROFILE_BUNDLE_PREFIX) {
                parse_voya_profile_bundle(bad, "sub").map(|_| ())
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
fn fmt_shadowsocks_rejects_full_link_base64_and_parses_plugins() {
    let old_payload = base64_encode("aes-128-gcm:pass@example.com:8388", false);
    assert!(parse_share_link(&format!("ss://{old_payload}#old")).is_err());

    let old_socks_payload = base64_encode("user:pass@example.com:1080", false);
    assert!(parse_share_link(&format!("socks://{old_socks_payload}")).is_err());

    let plugin =
        url_encode("v2ray-plugin;mode=websocket;host=ws.example;path=/a\\=b\\,c;tls;mux=0");
    let sip002 = format!(
        "ss://{}@example.com:8388?plugin={plugin}#plugin",
        base64_encode("aes-256-gcm:pass", true)
    );
    let parsed = parse_share_link(&sip002).expect("parse plugin ss");
    assert_eq!(parsed.stream_security(), STREAM_SECURITY_TLS);
    let Some(ProfileTransport::Websocket { path, .. }) = parsed.transport else {
        panic!("expected websocket transport");
    };
    assert_eq!(path.as_deref(), Some("/a=b,c"));
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
    assert_eq!(parsed.config_type(), ConfigType::VMess);
    assert_eq!(parsed.remarks, "JMS-TEST@example.test:17701");
    assert_eq!(parsed.address(), "node-vmess.example.test");
    assert_eq!(parsed.port(), 17701);
    assert_eq!(parsed.network(), DEFAULT_NETWORK);
    let ProfileProtocol::Vmess { cipher, .. } = parsed.protocol else {
        panic!("expected VMess protocol");
    };
    assert_eq!(cipher.as_deref(), Some(DEFAULT_SECURITY));

    let paddingless_vmess = format!("vmess://{}", base64_encode(vmess_json, true));
    let parsed = parse_share_link(&paddingless_vmess).expect("parse paddingless vmess");
    assert_eq!(parsed.address(), "node-vmess.example.test");

    let vless = "vless://00000000-0000-0000-0000-000000000002@node-vless.example.test:443?encryption=none&security=tls&sni=node-vless.example.test&fp=randomized&insecure=0&allowInsecure=0&type=ws&host=node-vless.example.test&path=%2F%3Fed%3D2048#node-vless.example.test";
    let parsed = parse_share_link(vless).expect("parse vless ws tls");
    assert_eq!(parsed.config_type(), ConfigType::VLESS);
    assert_eq!(parsed.address(), "node-vless.example.test");
    assert_eq!(parsed.stream_security(), STREAM_SECURITY_TLS);
    let Some(ProfileTransport::Websocket { host, path }) = parsed.transport else {
        panic!("expected websocket transport");
    };
    assert_eq!(host.as_deref(), Some("node-vless.example.test"));
    assert_eq!(path.as_deref(), Some("/?ed=2048"));

    let ss_user_info = base64_encode("aes-256-gcm:test-password", true);
    let ss = format!(
        "ss://{ss_user_info}@node-ss.example.test:17701?#JMS-TEST%40node-ss.example.test%3A17701"
    );
    let parsed = parse_share_link(&ss).expect("parse sip002 ss with empty query");
    assert_eq!(parsed.config_type(), ConfigType::Shadowsocks);
    assert_eq!(parsed.address(), "node-ss.example.test");
    assert_eq!(parsed.port(), 17701);
    assert_eq!(parsed.remarks, "JMS-TEST@node-ss.example.test:17701");
    let ProfileProtocol::Shadowsocks { method, .. } = parsed.protocol else {
        panic!("expected Shadowsocks protocol");
    };
    assert_eq!(method, "aes-256-gcm");
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
    assert_eq!(resolved[0].address(), "2001:db8::1");
    assert_eq!(resolved[0].port(), 51820);
    let ProfileProtocol::WireGuard {
        private_key,
        reserved,
        allowed_ips,
        interface_address,
        mtu,
        ..
    } = &resolved[0].protocol
    else {
        panic!("expected WireGuard protocol");
    };
    assert_eq!(private_key, "interface-private-key");
    assert_eq!(reserved.as_deref(), Some("1, 2, 3"));
    assert_eq!(allowed_ips.as_deref(), Some("10.0.0.0/8, 192.168.0.0/16"));
    assert_eq!(
        interface_address.as_deref(),
        Some("10.0.0.2/32, fd00::2/128")
    );
    assert_eq!(*mtu, Some(1420));
    assert_eq!(resolved[1].address(), "example.com");
    assert_eq!(resolved[1].port(), 12345);
}

#[test]
fn voya_profile_bundle_round_trips_group_references() {
    let child_a = ProfileItem {
        index_id: "child-a".to_string(),
        remarks: "child-a".to_string(),
        protocol: ProfileProtocol::Socks {
            server: endpoint("127.0.0.1", 1080),
            username: "u".to_string(),
            password: "p".to_string(),
        },
        ..ProfileItem::default()
    };
    let child_b = ProfileItem {
        index_id: "child-b".to_string(),
        remarks: "child-b".to_string(),
        protocol: ProfileProtocol::Vmess {
            server: endpoint("vmess.example", 443),
            uuid: "00000000-0000-0000-0000-000000000002".to_string(),
            cipher: None,
        },
        ..ProfileItem::default()
    };
    let group = ProfileItem {
        index_id: "group-1".to_string(),
        remarks: "group-1".to_string(),
        protocol: ProfileProtocol::PolicyGroup {
            child_profile_ids: vec!["child-a".to_string(), "child-b".to_string()],
            source_subscription_id: Some("original-sub".to_string()),
            filter: None,
            strategy: MultipleLoad::LeastPing,
        },
        ..ProfileItem::default()
    };

    let uri =
        export_voya_profile_bundle(&[group, child_a, child_b]).expect("export Voya profile bundle");
    assert!(uri.starts_with(VOYA_PROFILE_BUNDLE_PREFIX));
    let resolved = parse_voya_profile_bundle(&uri, "sub-123").expect("parse Voya profile bundle");
    assert_eq!(resolved.len(), 3);
    let resolved_group = resolved
        .iter()
        .find(|item| item.remarks == "group-1")
        .expect("resolved group");
    let ProfileProtocol::PolicyGroup {
        child_profile_ids,
        source_subscription_id,
        ..
    } = &resolved_group.protocol
    else {
        panic!("expected policy group");
    };
    assert_eq!(source_subscription_id.as_deref(), Some("sub-123"));
    assert_eq!(child_profile_ids, &["voya-import-2", "voya-import-3"]);
}

#[test]
fn voya_profile_bundle_rejects_versions_fields_missing_refs_and_cycles() {
    for json in [
        r#"{"schemaVersion":2,"profiles":[]}"#,
        r#"{"schemaVersion":1,"profiles":[],"retired":true}"#,
        r#"{"schemaVersion":1,"profiles":[{"kind":"proxyChain","reference":"a","name":"a","childRefs":["missing"],"includeCurrentSubscription":false}]}"#,
        r#"{"schemaVersion":1,"profiles":[{"kind":"proxyChain","reference":"a","name":"a","childRefs":["b"],"includeCurrentSubscription":false},{"kind":"proxyChain","reference":"b","name":"b","childRefs":["a"],"includeCurrentSubscription":false}]}"#,
    ] {
        let payload = base64_encode(json, true)
            .replace('+', "-")
            .replace('/', "_");
        let uri = format!("{VOYA_PROFILE_BUNDLE_PREFIX}{payload}");
        assert!(parse_voya_profile_bundle(&uri, "sub").is_err());
    }
}

#[test]
fn share_full_custom_import_helpers_classify_configs_without_file_writes() {
    let unsupported =
        r#"{"remarks":"unsupported custom","inbounds":[],"outbounds":[],"routing":{}}"#;
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
        profile(
            "vmess demo",
            ProfileProtocol::Vmess {
                server: endpoint("example.com", 443),
                uuid: "00000000-0000-0000-0000-000000000003".to_string(),
                cipher: Some(DEFAULT_SECURITY.to_string()),
            },
            Some(raw_transport()),
            None,
        ),
        profile(
            "vless demo",
            ProfileProtocol::Vless {
                server: endpoint("vless.example", 8443),
                uuid: "00000000-0000-0000-0000-000000000004".to_string(),
                flow: None,
                encryption: Some(NONE.to_string()),
            },
            Some(ProfileTransport::Websocket {
                host: Some("vless.example".to_string()),
                path: Some("/ws".to_string()),
            }),
            Some(tls(TlsMode::Tls, "vless.example")),
        ),
        profile(
            "trojan demo",
            ProfileProtocol::Trojan {
                server: endpoint("trojan.example", 443),
                password: "trojan-pass".to_string(),
            },
            Some(ProfileTransport::Grpc {
                authority: Some("trojan.example".to_string()),
                service_name: Some("svc".to_string()),
                mode: Some(GRPC_MULTI_MODE.to_string()),
            }),
            Some(tls(TlsMode::Tls, "trojan.example")),
        ),
        profile(
            "ss demo",
            ProfileProtocol::Shadowsocks {
                server: endpoint("1.2.3.4", 8388),
                password: "pass123".to_string(),
                method: "aes-128-gcm".to_string(),
                udp_over_tcp: false,
            },
            Some(raw_transport()),
            None,
        ),
        profile(
            "socks demo",
            ProfileProtocol::Socks {
                server: endpoint("127.0.0.1", 1080),
                username: "user".to_string(),
                password: "pass".to_string(),
            },
            None,
            None,
        ),
        profile(
            "hy2 demo",
            ProfileProtocol::Hysteria2 {
                server: endpoint("hy2.example", 443),
                password: "hy2-pass".to_string(),
                port_hops: Some("1000:2000".to_string()),
                obfuscation_password: Some("obfs-pass".to_string()),
            },
            None,
            Some(TlsSettings {
                certificate_sha256: vec!["sha-pin".to_string(), "second".to_string()],
                ..tls(TlsMode::Tls, "hy2.example")
            }),
        ),
        profile(
            "tuic demo",
            ProfileProtocol::Tuic {
                server: endpoint("tuic.example", 443),
                uuid: "uuid".to_string(),
                password: "tuic-pass".to_string(),
                congestion_control: Some("bbr".to_string()),
            },
            None,
            Some(tls(TlsMode::Tls, "tuic.example")),
        ),
        profile(
            "wg demo",
            ProfileProtocol::WireGuard {
                server: endpoint("2001:db8::1", 51820),
                private_key: "private-key".to_string(),
                peer_public_key: Some("public-key".to_string()),
                preshared_key: Some("psk".to_string()),
                interface_address: Some("10.0.0.2/32".to_string()),
                allowed_ips: None,
                reserved: Some("1,2,3".to_string()),
                mtu: Some(1420),
            },
            None,
            None,
        ),
        profile(
            "anytls demo",
            ProfileProtocol::Anytls {
                server: endpoint("anytls.example", 443),
                password: "anytls-pass".to_string(),
            },
            None,
            Some(tls(TlsMode::Tls, "anytls.example")),
        ),
        profile(
            "naive demo",
            ProfileProtocol::Naive {
                server: endpoint("naive.example", 443),
                username: "user".to_string(),
                password: "pass".to_string(),
                quic: true,
                congestion_control: None,
                insecure_concurrency: Some(4),
                udp_over_tcp: false,
            },
            None,
            Some(tls(TlsMode::Tls, "naive.example")),
        ),
    ]
}

fn profile(
    remarks: &str,
    protocol: ProfileProtocol,
    transport: Option<ProfileTransport>,
    tls: Option<TlsSettings>,
) -> ProfileItem {
    ProfileItem {
        remarks: remarks.to_string(),
        protocol,
        transport,
        tls,
        ..ProfileItem::default()
    }
}

fn endpoint(address: &str, port: i32) -> ServerEndpoint {
    ServerEndpoint {
        address: address.to_string(),
        port,
    }
}

fn raw_transport() -> ProfileTransport {
    ProfileTransport::Tcp {
        header: Some(NONE.to_string()),
        host: None,
        path: None,
    }
}

fn tls(mode: TlsMode, server_name: &str) -> TlsSettings {
    TlsSettings {
        mode,
        server_name: Some(server_name.to_string()),
        alpn: Vec::new(),
        reality_public_key: None,
        reality_short_id: None,
        reality_spider_x: None,
        mldsa65_verify: None,
        certificate_pem: None,
        certificate_sha256: Vec::new(),
        ech_config: Vec::new(),
        final_mask: None,
    }
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
