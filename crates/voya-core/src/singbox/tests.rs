use std::collections::{BTreeMap, BTreeSet};

use super::*;
use crate::{golden, CoreGenPlatform, CoreType, DnsItem, RoutingItem};

#[test]
fn singbox_outbound_vless_ws_tls_mux_matches_golden() {
    let mut config = AppConfig::default();
    config.core_basic_item.enable_fragment = true;
    config.core_basic_item.mux_enabled = true;
    config.core_basic_item.def_user_agent = "chrome".to_string();

    let node = ProfileItem {
        index_id: "n-vless".to_string(),
        config_type: ConfigType::VLESS,
        remarks: "vless-ws".to_string(),
        address: "server.example".to_string(),
        port: 443,
        password: "00000000-0000-0000-0000-000000000011".to_string(),
        network: "ws".to_string(),
        stream_security: "tls".to_string(),
        sni: "tls.example".to_string(),
        alpn: "h2,http/1.1".to_string(),
        fingerprint: "firefox".to_string(),
        ech_config_list: "ech.example+https://dns.example/dns-query".to_string(),
        mux_enabled: Some(true),
        protocol_extra: ProtocolExtraItem {
            vless_encryption: Some("none".to_string()),
            ..ProtocolExtraItem::default()
        },
        transport_extra: TransportExtraItem {
            host: Some("cdn.example".to_string()),
            path: Some("/ws?ed=2048".to_string()),
            ..TransportExtraItem::default()
        },
        ..ProfileItem::default()
    };

    let generated = generate_singbox_config(&test_context(config, node))
        .expect("sing-box config should generate");
    let proxy = generated
        .outbounds
        .iter()
        .find(|outbound| outbound.tag == PROXY_TAG)
        .expect("proxy outbound");
    let value =
        serde_json::to_value(proxy).expect("sing-box VLESS outbound should serialize to JSON");
    assert_no_nulls(&value);

    let expected: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/outbounds/vless_ws_tls_mux.json"
    ))
    .expect("sing-box VLESS outbound golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-outbound-vless-ws-tls-mux", &expected, &value);

    let full_value =
        serde_json::to_value(generated).expect("sing-box config should serialize to JSON");
    assert_no_nulls(&full_value);
    assert_eq!(
        full_value.pointer("/experimental/clash_api/external_controller"),
        Some(&Value::String("127.0.0.1:10813".to_string()))
    );
    assert_eq!(
        full_value.pointer("/experimental/cache_file/enabled"),
        Some(&Value::Bool(true))
    );
}

#[test]
fn singbox_tls_insecure_requires_application_gate() {
    let node = ProfileItem {
        allow_insecure: "true".to_string(),
        ..base_remote_node()
    };
    let context = test_context(AppConfig::default(), node.clone());
    assert_eq!(
        build_outbound(&context, &node)
            .tls
            .expect("tls settings should be generated")
            .insecure,
        Some(false)
    );

    let mut config = AppConfig::default();
    config.core_basic_item.def_allow_insecure = true;
    let context = test_context(config.clone(), node.clone());
    assert_eq!(
        build_outbound(&context, &node)
            .tls
            .expect("tls settings should be generated")
            .insecure,
        Some(true)
    );

    let node = ProfileItem {
        allow_insecure: "false".to_string(),
        ..node
    };
    let context = test_context(config, node.clone());
    assert_eq!(
        build_outbound(&context, &node)
            .tls
            .expect("tls settings should be generated")
            .insecure,
        Some(false)
    );
}

#[test]
fn singbox_pinned_cert_and_reality_force_insecure_false() {
    let mut config = AppConfig::default();
    config.core_basic_item.def_allow_insecure = true;

    let pinned_node = ProfileItem {
        allow_insecure: "true".to_string(),
        cert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----".to_string(),
        ..base_remote_node()
    };
    let context = test_context(config.clone(), pinned_node.clone());
    let tls = build_outbound(&context, &pinned_node)
        .tls
        .expect("tls settings should be generated");
    assert_eq!(tls.insecure, Some(false));
    assert!(tls.certificate.is_some());

    let reality_node = ProfileItem {
        allow_insecure: "true".to_string(),
        stream_security: STREAM_SECURITY_REALITY.to_string(),
        public_key: "reality-public-key".to_string(),
        short_id: "reality-short-id".to_string(),
        ..base_remote_node()
    };
    let context = test_context(config, reality_node.clone());
    let tls = build_outbound(&context, &reality_node)
        .tls
        .expect("tls settings should be generated");
    assert_eq!(tls.insecure, Some(false));
    assert!(tls.reality.is_some());
}

#[test]
fn singbox_transport_hosts_use_first_authority() {
    let node = ProfileItem {
        network: "ws".to_string(),
        sni: String::new(),
        transport_extra: TransportExtraItem {
            host: Some("one.example, two.example".to_string()),
            path: Some("/ws".to_string()),
            ..TransportExtraItem::default()
        },
        ..base_remote_node()
    };
    let context = test_context(AppConfig::default(), node.clone());
    let outbound = build_outbound(&context, &node);
    assert_eq!(
        outbound
            .transport
            .as_ref()
            .and_then(|transport| transport.headers.as_ref())
            .and_then(|headers| headers.host.as_deref()),
        Some("one.example")
    );
    assert_eq!(
        outbound
            .tls
            .as_ref()
            .and_then(|tls| tls.server_name.as_deref()),
        Some("one.example")
    );

    let node = ProfileItem {
        network: "httpupgrade".to_string(),
        sni: String::new(),
        transport_extra: TransportExtraItem {
            host: Some("upgrade.example, backup.example".to_string()),
            path: Some("/up".to_string()),
            ..TransportExtraItem::default()
        },
        ..base_remote_node()
    };
    let context = test_context(AppConfig::default(), node.clone());
    let outbound = build_outbound(&context, &node);
    assert_eq!(
        outbound
            .transport
            .as_ref()
            .and_then(|transport| transport.host.as_ref()),
        Some(&Value::String("upgrade.example".to_string()))
    );
    assert_eq!(
        outbound
            .tls
            .as_ref()
            .and_then(|tls| tls.server_name.as_deref()),
        Some("upgrade.example")
    );

    let node = ProfileItem {
        config_type: ConfigType::Trojan,
        password: "secret".to_string(),
        network: "grpc".to_string(),
        sni: String::new(),
        transport_extra: TransportExtraItem {
            grpc_authority: Some("grpc-one.example, grpc-two.example".to_string()),
            grpc_service_name: Some("svc".to_string()),
            ..TransportExtraItem::default()
        },
        ..base_remote_node()
    };
    let context = test_context(AppConfig::default(), node.clone());
    let outbound = build_outbound(&context, &node);
    assert_eq!(
        outbound
            .tls
            .as_ref()
            .and_then(|tls| tls.server_name.as_deref()),
        Some("grpc-one.example")
    );

    let node = ProfileItem {
        config_type: ConfigType::Shadowsocks,
        password: "secret".to_string(),
        network: "ws".to_string(),
        stream_security: String::new(),
        protocol_extra: ProtocolExtraItem {
            ss_method: Some("aes-128-gcm".to_string()),
            ..ProtocolExtraItem::default()
        },
        transport_extra: TransportExtraItem {
            host: Some("plugin-one.example, plugin-two.example".to_string()),
            path: Some("/plugin".to_string()),
            ..TransportExtraItem::default()
        },
        ..base_remote_node()
    };
    let context = test_context(AppConfig::default(), node.clone());
    let outbound = build_outbound(&context, &node);
    assert_eq!(
        outbound.plugin_opts.as_deref(),
        Some("mode=websocket;host=plugin-one.example;path=/plugin;mux=0")
    );
}

#[test]
fn singbox_invalid_ports_are_rejected_or_skipped() {
    assert!(parse_dns_address("1.1.1.1:70000").is_none());
    assert!(parse_dns_address("https://dns.example:70000/dns-query").is_none());
    assert!(parse_dns_address("8.8.8.8:0").is_none());

    let fallback = parse_dns_address_or_default("1.1.1.1:70000", DEFAULT_DIRECT_DNS);
    assert_ne!(fallback.server_port, Some(70000));

    let node = ProfileItem {
        port: 70000,
        ..base_remote_node()
    };
    let error = generate_singbox_config(&test_context(AppConfig::default(), node))
        .expect_err("invalid node port should be rejected");
    assert!(matches!(
        error,
        SingboxConfigError::InvalidNodePort { port: 70000, .. }
    ));
}

#[test]
fn singbox_hysteria_hop_interval_clamps_without_overflow() {
    assert_eq!(parse_hysteria_hop_interval("10-20"), Some(15));
    assert_eq!(
        parse_hysteria_hop_interval("2147483647-2147483647"),
        Some(i32::MAX)
    );
    assert_eq!(
        parse_hysteria_hop_interval("9223372036854775807-9223372036854775807"),
        Some(i32::MAX)
    );
    assert_eq!(
        parse_hysteria_hop_interval("9223372036854775807"),
        Some(i32::MAX)
    );
}

#[test]
fn singbox_wireguard_reserved_requires_exactly_three_bytes() {
    assert_eq!(
        parse_wireguard_reserved(Some("1, 2, 255")),
        Some(vec![1, 2, 255])
    );

    for value in ["1,2", "1,2,3,4", "1,x,3", "1,256,3", "1,,2,3"] {
        assert_eq!(parse_wireguard_reserved(Some(value)), None);
    }
}

#[test]
fn singbox_outbound_proxy_chain_detour_matches_golden() {
    let n1 = socks_node("n1", "node-1");
    let n2 = socks_node("n2", "node-2");
    let chain = ProfileItem {
        index_id: "chain".to_string(),
        config_type: ConfigType::ProxyChain,
        remarks: "chain".to_string(),
        protocol_extra: ProtocolExtraItem {
            child_items: Some("n1,n2".to_string()),
            group_type: Some("ProxyChain".to_string()),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    };
    let mut context = test_context(AppConfig::default(), chain);
    context.all_proxies_map.insert(n1.index_id.clone(), n1);
    context.all_proxies_map.insert(n2.index_id.clone(), n2);

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let value = serde_json::to_value(&generated.outbounds)
        .expect("sing-box proxy chain outbounds should serialize to JSON");
    assert_no_nulls(&value);

    let expected: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/outbounds/proxy_chain_detour.json"
    ))
    .expect("sing-box proxy chain golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-proxy-chain-detour", &expected, &value);
}

#[test]
fn singbox_outbound_live_protocol_matrix_serializes_without_nulls() {
    let cases = vec![
        (
            "vmess",
            ProfileItem {
                index_id: "vmess".to_string(),
                config_type: ConfigType::VMess,
                password: "00000000-0000-0000-0000-000000000021".to_string(),
                protocol_extra: ProtocolExtraItem {
                    alter_id: Some("0".to_string()),
                    vmess_security: Some(DEFAULT_SECURITY.to_string()),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
        (
            "shadowsocks",
            ProfileItem {
                index_id: "ss".to_string(),
                config_type: ConfigType::Shadowsocks,
                password: "secret".to_string(),
                protocol_extra: ProtocolExtraItem {
                    ss_method: Some("2022-blake3-aes-128-gcm".to_string()),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
        ("socks", socks_node("socks", "socks")),
        (
            "http",
            ProfileItem {
                index_id: "http".to_string(),
                config_type: ConfigType::HTTP,
                username: "user".to_string(),
                password: "pass".to_string(),
                ..base_remote_node()
            },
        ),
        (
            "vless",
            ProfileItem {
                index_id: "vless".to_string(),
                config_type: ConfigType::VLESS,
                password: "00000000-0000-0000-0000-000000000022".to_string(),
                protocol_extra: ProtocolExtraItem {
                    vless_encryption: Some("none".to_string()),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
        (
            "trojan",
            ProfileItem {
                index_id: "trojan".to_string(),
                config_type: ConfigType::Trojan,
                password: "secret".to_string(),
                ..base_remote_node()
            },
        ),
        (
            "hysteria2",
            ProfileItem {
                index_id: "hy2".to_string(),
                config_type: ConfigType::Hysteria2,
                password: "secret".to_string(),
                protocol_extra: ProtocolExtraItem {
                    salamander_pass: Some("obfs".to_string()),
                    ports: Some("443,8443-8445".to_string()),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
        (
            "tuic",
            ProfileItem {
                index_id: "tuic".to_string(),
                config_type: ConfigType::TUIC,
                username: "00000000-0000-0000-0000-000000000023".to_string(),
                password: "secret".to_string(),
                protocol_extra: ProtocolExtraItem {
                    congestion_control: Some("bbr".to_string()),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
        (
            "anytls",
            ProfileItem {
                index_id: "anytls".to_string(),
                config_type: ConfigType::Anytls,
                password: "secret".to_string(),
                ..base_remote_node()
            },
        ),
        (
            "naive",
            ProfileItem {
                index_id: "naive".to_string(),
                config_type: ConfigType::Naive,
                username: "user".to_string(),
                password: "pass".to_string(),
                protocol_extra: ProtocolExtraItem {
                    naive_quic: Some(true),
                    congestion_control: Some("bbr".to_string()),
                    insecure_concurrency: Some(2),
                    ..ProtocolExtraItem::default()
                },
                ..base_remote_node()
            },
        ),
    ];

    for (expected_type, node) in cases {
        let generated = generate_singbox_config(&test_context(AppConfig::default(), node))
            .expect("sing-box config should generate");
        let proxy = generated
            .outbounds
            .iter()
            .find(|outbound| outbound.tag == PROXY_TAG)
            .expect("proxy outbound");
        assert_eq!(proxy.r#type, expected_type);
        assert_no_nulls(
            &serde_json::to_value(proxy)
                .expect("sing-box protocol matrix outbound should serialize to JSON"),
        );
    }

    let wireguard = ProfileItem {
        index_id: "wg".to_string(),
        config_type: ConfigType::WireGuard,
        password: "private-key".to_string(),
        protocol_extra: ProtocolExtraItem {
            wg_public_key: Some("public-key".to_string()),
            wg_interface_address: Some("172.16.0.2/32,fd00::2/128".to_string()),
            ..ProtocolExtraItem::default()
        },
        ..base_remote_node()
    };
    let generated = generate_singbox_config(&test_context(AppConfig::default(), wireguard))
        .expect("sing-box config should generate");
    assert_eq!(generated.endpoints.len(), 1);
    assert_eq!(generated.endpoints[0].r#type, "wireguard");
    assert_no_nulls(
        &serde_json::to_value(&generated.endpoints[0])
            .expect("sing-box wireguard endpoint should serialize to JSON"),
    );
}

#[test]
fn singbox_selector_policy_group_order_dedupe_and_urltest_match_golden() {
    let n1 = socks_node("n1", "node-1");
    let n2 = socks_node("n2", "node-2");
    let group = ProfileItem {
        index_id: "group".to_string(),
        config_type: ConfigType::PolicyGroup,
        remarks: "fallback".to_string(),
        protocol_extra: ProtocolExtraItem {
            child_items: Some("n1,n1,n2".to_string()),
            group_type: Some("PolicyGroup".to_string()),
            multiple_load: Some(MultipleLoad::Fallback),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    };
    let mut context = test_context(AppConfig::default(), group);
    context.all_proxies_map.insert(n1.index_id.clone(), n1);
    context.all_proxies_map.insert(n2.index_id.clone(), n2);

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let value = serde_json::to_value(&generated.outbounds)
        .expect("sing-box policy group outbounds should serialize to JSON");
    assert_no_nulls(&value);

    let expected: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/outbounds/policy_group_selector.json"
    ))
    .expect("sing-box policy group golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-policy-group-selector", &expected, &value);
}

#[test]
fn singbox_dns_fakeip_typed_schema_and_rulesets_match_golden() {
    let (dns_context, _) = singbox_routing_dns_snapshot_contexts();
    let dns_generated =
        generate_singbox_config(&dns_context).expect("sing-box config should generate");
    let dns_value = serde_json::to_value(
        dns_generated
            .dns
            .as_ref()
            .expect("sing-box DNS config should be generated"),
    )
    .expect("sing-box DNS config should serialize to JSON");
    assert_no_nulls(&dns_value);
    let expected_dns: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/dns/fakeip_typed.json"
    ))
    .expect("sing-box fakeip DNS golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-dns-fakeip-typed", &expected_dns, &dns_value);

    let ruleset_value = serde_json::to_value(
        dns_generated
            .route
            .rule_set
            .as_ref()
            .expect("sing-box DNS rulesets should be generated"),
    )
    .expect("sing-box DNS rulesets should serialize to JSON");
    let expected_ruleset: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/route/rulesets_from_dns.json"
    ))
    .expect("sing-box DNS ruleset golden fixture should parse as JSON");
    golden::assert_json_eq(
        "singbox-rulesets-from-dns",
        &expected_ruleset,
        &ruleset_value,
    );
}

#[test]
fn singbox_ruleset_generation_prefers_resolved_local_asset_paths() {
    let (mut dns_context, _) = singbox_routing_dns_snapshot_contexts();
    dns_context.singbox_ruleset_paths.insert(
        "geosite-cn".to_string(),
        "/tmp/VoyaVPN/bin/srss/geosite-cn.srs".to_string(),
    );

    let generated = generate_singbox_config(&dns_context).expect("sing-box config should generate");
    let rule_set = generated.route.rule_set.expect("rulesets");
    let local = rule_set
        .iter()
        .find(|ruleset| ruleset.tag.as_deref() == Some("geosite-cn"))
        .expect("geosite-cn");
    let remote = rule_set
        .iter()
        .find(|ruleset| ruleset.tag.as_deref() == Some("geosite-google"))
        .expect("geosite-google");

    assert_eq!(local.r#type.as_deref(), Some("local"));
    assert_eq!(
        local.path.as_deref(),
        Some("/tmp/VoyaVPN/bin/srss/geosite-cn.srs")
    );
    assert_eq!(local.url, None);
    assert_eq!(remote.r#type.as_deref(), Some("remote"));
    assert_eq!(remote.download_detour.as_deref(), Some(PROXY_TAG));
}

#[test]
fn singbox_invalid_inline_custom_rulesets_are_reported() {
    let (mut dns_context, _) = singbox_routing_dns_snapshot_contexts();
    dns_context
        .routing_item
        .as_mut()
        .expect("routing item")
        .custom_ruleset_path4_singbox = "[{\"tag\":\"geosite-cn\"}]".to_string();

    let error = generate_singbox_config(&dns_context)
        .expect_err("missing custom ruleset fields should fail generation");
    assert!(matches!(
        error,
        SingboxConfigError::CustomRulesetMissingRequiredFields { index: 0 }
    ));

    dns_context
        .routing_item
        .as_mut()
        .expect("routing item")
        .custom_ruleset_path4_singbox = "[{\"tag\":\"geosite-cn\"}".to_string();
    let error = generate_singbox_config(&dns_context)
        .expect_err("invalid custom ruleset JSON should fail generation");
    assert!(matches!(error, SingboxConfigError::CustomRulesetJson(_)));
}

#[test]
fn singbox_dns_raw_override_uses_typed_custom_schema_and_protect_rules() {
    let mut context = test_context(AppConfig::default(), base_remote_node());
    context.protect_domain_list = vec!["ech.example".to_string()];
    context.raw_dns_item = Some(DnsItem {
            enabled: true,
            normal_dns: Some(
                r#"{"servers":[{"tag":"remote","type":"udp","server":"1.1.1.1","detour":"proxy"}],"rules":[],"final":"remote"}"#.to_string(),
            ),
            domain_dns_address: Some("9.9.9.9".to_string()),
            ..DnsItem::default()
        });

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let dns = generated.dns.expect("raw dns");

    assert!(dns.servers.iter().any(|server| {
        server.tag == SINGBOX_LOCAL_DNS_TAG && server.server.as_deref() == Some("9.9.9.9")
    }));
    assert!(dns.rules.iter().any(|rule| {
        rule.domain.as_ref() == Some(&vec!["ech.example".to_string()])
            && rule.server.as_deref() == Some(SINGBOX_LOCAL_DNS_TAG)
    }));
    assert!(dns.rules.iter().any(|rule| {
        rule.server.as_deref() == Some("remote") && is_priority_proxy_domain_suffix(rule)
    }));
    assert_no_nulls(
        &serde_json::to_value(&dns).expect("sing-box raw DNS should serialize to JSON"),
    );
}

#[test]
fn singbox_negative_ip_rules_use_and_and_skip_negative_only_rules() {
    let mut context = test_context(AppConfig::default(), base_remote_node());
    context.routing_item = Some(RoutingItem {
        rule_set: vec![
            RulesItem {
                outbound_tag: Some(DIRECT_TAG.to_string()),
                ip: Some(vec!["10.0.0.0/8".to_string(), "!10.1.0.0/16".to_string()]),
                ..RulesItem::default()
            },
            RulesItem {
                outbound_tag: Some(BLOCK_TAG.to_string()),
                ip: Some(vec!["!geoip:private".to_string()]),
                port: Some("443".to_string()),
                ..RulesItem::default()
            },
        ],
        ..RoutingItem::default()
    });

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let logical_rule = generated
        .route
        .rules
        .iter()
        .find(|rule| {
            rule.r#type.as_deref() == Some("logical")
                && rule.outbound.as_deref() == Some(DIRECT_TAG)
        })
        .expect("logical negative IP rule");
    assert_eq!(logical_rule.mode.as_deref(), Some("and"));
    let nested = logical_rule.rules.as_ref().expect("nested rules");
    assert_eq!(nested.len(), 2);
    assert_eq!(
        nested[0].ip_cidr.as_ref(),
        Some(&vec!["10.0.0.0/8".to_string()])
    );
    assert_eq!(nested[1].invert, Some(true));
    assert_eq!(
        nested[1].ip_cidr.as_ref(),
        Some(&vec!["10.1.0.0/16".to_string()])
    );
    assert!(!generated.route.rules.iter().any(|rule| {
        rule.action.as_deref() == Some("reject") && rule.port.as_ref() == Some(&vec![443])
    }));
}

#[test]
fn singbox_custom_dns_protect_rules_reference_existing_server_tags() {
    let mut context = test_context(AppConfig::default(), base_remote_node());
    context.protect_domain_list = vec!["ech.example".to_string()];
    context.raw_dns_item = Some(DnsItem {
            enabled: true,
            normal_dns: Some(
                r#"{"servers":[{"tag":"only-local","type":"udp","server":"1.1.1.1"}],"rules":[],"final":"only-local"}"#.to_string(),
            ),
            domain_dns_address: Some("9.9.9.9".to_string()),
            ..DnsItem::default()
        });

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let dns = generated.dns.expect("raw dns");
    let server_tags = dns
        .servers
        .iter()
        .map(|server| server.tag.as_str())
        .collect::<BTreeSet<_>>();
    for rule in dns.rules.iter().filter_map(|rule| rule.server.as_deref()) {
        assert!(server_tags.contains(rule));
    }
    assert!(dns.rules.iter().any(|rule| {
        rule.clash_mode.as_deref() == Some("Global") && rule.server.as_deref() == Some("only-local")
    }));
}

#[test]
fn singbox_raw_tun_dns_enables_reverse_mapping_and_priority_ipv4() {
    let mut app_config = AppConfig::default();
    app_config.tun_mode_item.enable_tun = true;
    app_config.tun_mode_item.enable_ipv6_address = false;
    let mut context = test_context(app_config, base_remote_node());
    context.is_tun_enabled = true;
    context.raw_dns_item = Some(DnsItem {
            enabled: true,
            tun_dns: Some(
                r#"{"servers":[{"tag":"remote","type":"udp","server":"1.1.1.1","detour":"proxy"}],"rules":[],"final":"remote","reverse_mapping":false}"#.to_string(),
            ),
            domain_dns_address: Some("9.9.9.9".to_string()),
            ..DnsItem::default()
        });

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let dns = generated.dns.expect("raw TUN DNS");

    assert_eq!(dns.reverse_mapping, Some(true));
    let priority_rule = dns
        .rules
        .iter()
        .find(|rule| {
            rule.server.as_deref() == Some("remote") && is_priority_proxy_domain_suffix(rule)
        })
        .expect("priority proxy DNS rule");
    assert_eq!(priority_rule.strategy.as_deref(), Some("ipv4_only"));
}

#[test]
fn singbox_wireguard_uses_allowed_ips_and_rejects_empty_public_key() {
    let wireguard = ProfileItem {
        index_id: "wg".to_string(),
        config_type: ConfigType::WireGuard,
        password: "private-key".to_string(),
        protocol_extra: ProtocolExtraItem {
            wg_public_key: Some("public-key".to_string()),
            wg_allowed_ips: Some("10.0.0.0/8,192.168.0.0/16".to_string()),
            ..ProtocolExtraItem::default()
        },
        ..base_remote_node()
    };
    let generated = generate_singbox_config(&test_context(AppConfig::default(), wireguard))
        .expect("sing-box config should generate");
    assert_eq!(
        generated.endpoints[0].peers[0].allowed_ips,
        vec!["10.0.0.0/8".to_string(), "192.168.0.0/16".to_string()]
    );

    let missing_public_key = ProfileItem {
        index_id: "wg-missing-key".to_string(),
        config_type: ConfigType::WireGuard,
        password: "private-key".to_string(),
        ..base_remote_node()
    };
    let error = generate_singbox_config(&test_context(AppConfig::default(), missing_public_key))
        .expect_err("missing WireGuard public key should fail");
    assert!(matches!(
        error,
        SingboxConfigError::MissingWireGuardPublicKey { .. }
    ));
}

#[test]
fn singbox_tun_inbound_and_route_match_golden() {
    let (_, tun_context) = singbox_routing_dns_snapshot_contexts();
    let generated = generate_singbox_config(&tun_context).expect("sing-box config should generate");
    let inbounds_value = serde_json::to_value(&generated.inbounds)
        .expect("sing-box tun inbounds should serialize to JSON");
    assert_no_nulls(&inbounds_value);
    let expected_inbounds: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/inbounds/tun.json"
    ))
    .expect("sing-box tun inbounds golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-tun-inbounds", &expected_inbounds, &inbounds_value);

    let route_value =
        serde_json::to_value(&generated.route).expect("sing-box route should serialize to JSON");
    assert_no_nulls(&route_value);
    let expected_route: Value = serde_json::from_str(include_str!(
        "../../../../tests/golden/singbox/route/tun.json"
    ))
    .expect("sing-box tun route golden fixture should parse as JSON");
    golden::assert_json_eq("singbox-tun-route", &expected_route, &route_value);
}

#[test]
fn singbox_macos_tun_inbound_lets_singbox_allocate_utun() {
    let mut config = AppConfig::default();
    config.tun_mode_item.enable_tun = true;
    config.tun_mode_item.mtu = 9000;
    config.tun_mode_item.strict_route = true;
    let mut context = test_context(config, base_remote_node());
    context.is_tun_enabled = true;
    context.platform = CoreGenPlatform::MacOS;

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let tun = generated
        .inbounds
        .iter()
        .find(|inbound| inbound.tag == SINGBOX_TUN_INBOUND_TAG)
        .expect("TUN inbound should be generated");

    assert_eq!(tun.interface_name, None);
    assert_eq!(
        tun.address.as_ref(),
        Some(&vec![
            "172.18.0.1/30".to_string(),
            "fdfe:dcba:9876::1/126".to_string()
        ])
    );
    assert_eq!(tun.mtu, Some(1500));
    assert_eq!(tun.strict_route, Some(false));
    let http_proxy = tun
        .platform
        .as_ref()
        .and_then(|platform| platform.http_proxy.as_ref())
        .expect("macOS TUN platform HTTP proxy");
    assert!(http_proxy.enabled);
    assert_eq!(http_proxy.server.as_deref(), Some(LOOPBACK));
    assert_eq!(http_proxy.server_port, Some(crate::DEFAULT_LOCAL_PORT));
}

#[test]
fn singbox_priority_proxy_domains_follow_sniff_and_precede_direct_rules() {
    let mut app_config = AppConfig::default();
    app_config.tun_mode_item.enable_tun = true;
    app_config.tun_mode_item.enable_ipv6_address = false;
    let mut context = test_context(app_config, base_remote_node());
    context.is_tun_enabled = true;
    context.routing_item = Some(RoutingItem {
        rule_set: vec![RulesItem {
            outbound_tag: Some(DIRECT_TAG.to_string()),
            port: Some("0-65535".to_string()),
            rule_type: Some(RuleType::Routing),
            ..RulesItem::default()
        }],
        ..RoutingItem::default()
    });

    let generated = generate_singbox_config(&context).expect("sing-box config should generate");
    let sniff_index = generated
        .route
        .rules
        .iter()
        .position(|rule| rule.action.as_deref() == Some("sniff"))
        .expect("sniff route rule");
    let dns_hijack_index = generated
        .route
        .rules
        .iter()
        .position(|rule| rule.action.as_deref() == Some("hijack-dns"))
        .expect("DNS hijack route rule");
    let priority_route_index = generated
        .route
        .rules
        .iter()
        .position(is_priority_proxy_route_rule)
        .expect("priority proxy route rule");
    let direct_mode_index = generated
        .route
        .rules
        .iter()
        .position(|rule| {
            rule.outbound.as_deref() == Some(DIRECT_TAG)
                && rule.clash_mode.as_deref() == Some("Direct")
        })
        .expect("Direct route mode rule");
    let direct_final_index = generated
        .route
        .rules
        .iter()
        .position(|rule| {
            rule.outbound.as_deref() == Some(DIRECT_TAG)
                && rule.port_range.as_ref() == Some(&vec!["0:65535".to_string()])
        })
        .expect("direct final route rule");
    assert!(sniff_index < priority_route_index);
    assert!(dns_hijack_index < priority_route_index);
    assert!(priority_route_index < direct_mode_index);
    assert!(priority_route_index < direct_final_index);

    let dns = generated.dns.expect("DNS config should be generated");
    assert_eq!(dns.reverse_mapping, Some(true));
    let priority_dns_index = dns
        .rules
        .iter()
        .position(|rule| {
            rule.server.as_deref() == Some(SINGBOX_REMOTE_DNS_TAG)
                && is_priority_proxy_domain_suffix(rule)
        })
        .expect("priority proxy DNS rule");
    let priority_dns_rule = &dns.rules[priority_dns_index];
    assert_eq!(priority_dns_rule.strategy.as_deref(), Some("ipv4_only"));
    let direct_mode_index = dns
        .rules
        .iter()
        .position(|rule| {
            rule.server.as_deref() == Some(SINGBOX_DIRECT_DNS_TAG)
                && rule.clash_mode.as_deref() == Some("Direct")
        })
        .expect("Direct DNS mode rule");
    assert!(priority_dns_index < direct_mode_index);
}

#[test]
fn singbox_speedtest_config_adds_mixed_inbound_proxy_and_route_per_entry() {
    let entries = vec![
        SpeedtestConfigEntry {
            index_id: "a".to_string(),
            port: 12000,
            context: test_context(AppConfig::default(), socks_node("a", "node-a")),
        },
        SpeedtestConfigEntry {
            index_id: "b".to_string(),
            port: 12001,
            context: test_context(AppConfig::default(), socks_node("b", "node-b")),
        },
    ];

    let generated: Value = serde_json::from_str(
        &generate_singbox_speedtest_config_json(&entries)
            .expect("sing-box speedtest config should serialize"),
    )
    .expect("sing-box speedtest config should parse as JSON");
    for port in [12000, 12001] {
        let inbound_tag = format!("mixed{port}");
        let proxy_tag = format!("proxy{port}");
        assert!(generated["inbounds"].as_array().is_some_and(|inbounds| {
            inbounds.iter().any(|inbound| {
                inbound["tag"] == inbound_tag
                    && inbound["listen"] == LOOPBACK
                    && inbound["listen_port"] == port
                    && inbound["type"] == "mixed"
            })
        }));
        assert!(generated["outbounds"].as_array().is_some_and(|outbounds| {
            outbounds
                .iter()
                .any(|outbound| outbound["tag"] == proxy_tag)
        }));
        assert!(generated["route"]["rules"].as_array().is_some_and(|rules| {
            rules.iter().any(|rule| {
                rule["inbound"].as_array().is_some_and(|tags| {
                    tags.iter()
                        .any(|tag| tag == &Value::String(inbound_tag.clone()))
                }) && rule["outbound"] == proxy_tag
            })
        }));
    }
    assert_eq!(
        generated.pointer("/dns/final").and_then(Value::as_str),
        Some(SINGBOX_DIRECT_DNS_TAG)
    );
}

#[test]
fn singbox_speedtest_config_routes_policy_group_and_proxy_chain_entries() {
    let group = ProfileItem {
        index_id: "group".to_string(),
        config_type: ConfigType::PolicyGroup,
        remarks: "group".to_string(),
        protocol_extra: ProtocolExtraItem {
            child_items: Some("g1,g2".to_string()),
            group_type: Some("PolicyGroup".to_string()),
            multiple_load: Some(MultipleLoad::Fallback),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    };
    let mut group_context = test_context(AppConfig::default(), group);
    group_context
        .all_proxies_map
        .insert("g1".to_string(), socks_node("g1", "group-node-1"));
    group_context
        .all_proxies_map
        .insert("g2".to_string(), socks_node("g2", "group-node-2"));

    let chain = ProfileItem {
        index_id: "chain".to_string(),
        config_type: ConfigType::ProxyChain,
        remarks: "chain".to_string(),
        protocol_extra: ProtocolExtraItem {
            child_items: Some("c1,c2".to_string()),
            group_type: Some("ProxyChain".to_string()),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    };
    let mut chain_context = test_context(AppConfig::default(), chain);
    chain_context
        .all_proxies_map
        .insert("c1".to_string(), socks_node("c1", "chain-node-1"));
    chain_context
        .all_proxies_map
        .insert("c2".to_string(), socks_node("c2", "chain-node-2"));

    let generated = generate_singbox_speedtest_config(&[
        SpeedtestConfigEntry {
            index_id: "group".to_string(),
            port: 12100,
            context: group_context,
        },
        SpeedtestConfigEntry {
            index_id: "chain".to_string(),
            port: 12101,
            context: chain_context,
        },
    ]);

    assert_speedtest_singbox_route(&generated, 12100);
    assert_speedtest_singbox_route(&generated, 12101);
    assert!(generated
        .outbounds
        .iter()
        .any(|outbound| outbound.tag.starts_with("proxy12100")));
    assert!(generated
        .outbounds
        .iter()
        .any(|outbound| outbound.tag.starts_with("proxy12101")));
}

fn assert_speedtest_singbox_route(generated: &SingboxConfig, port: i32) {
    let inbound_tag = format!("mixed{port}");
    let proxy_tag = format!("proxy{port}");
    assert!(generated.route.rules.iter().any(|rule| {
        rule.inbound.as_ref() == Some(&vec![inbound_tag.clone()])
            && rule.outbound.as_deref() == Some(proxy_tag.as_str())
    }));
}

fn is_priority_proxy_route_rule(rule: &SingboxRule) -> bool {
    rule.outbound.as_deref() == Some(PROXY_TAG) && is_priority_proxy_domain_suffix(rule)
}

fn is_priority_proxy_domain_suffix(rule: &SingboxRule) -> bool {
    rule.domain_suffix.as_ref() == Some(&priority_proxy_domain_suffixes())
}

fn singbox_routing_dns_snapshot_contexts() -> (CoreConfigContext, CoreConfigContext) {
    let mut dns_config = AppConfig::default();
    dns_config.simple_dns_item.fake_ip = Some(true);
    dns_config.simple_dns_item.global_fake_ip = Some(true);
    dns_config.simple_dns_item.direct_dns = Some("https://resolver.example/dns-query".to_string());
    dns_config.simple_dns_item.remote_dns =
        Some("https://cloudflare-dns.com/dns-query".to_string());
    dns_config.simple_dns_item.hosts =
        Some("resolver.example 1.1.1.1\nblock.test #3\ncname.test target.example".to_string());
    dns_config.simple_dns_item.strategy4_freedom = Some("UseIPv4".to_string());
    dns_config.simple_dns_item.strategy4_proxy = Some("UseIPv6".to_string());
    dns_config.simple_dns_item.direct_expected_ips = Some("geoip:cn,192.0.2.0/24".to_string());
    let mut dns_context = test_context(dns_config, base_remote_node());
    dns_context.routing_item = Some(RoutingItem {
        rule_set: vec![
            RulesItem {
                outbound_tag: Some(DIRECT_TAG.to_string()),
                domain: Some(vec!["geosite:cn".to_string()]),
                rule_type: Some(RuleType::DNS),
                ..RulesItem::default()
            },
            RulesItem {
                outbound_tag: Some(PROXY_TAG.to_string()),
                domain: Some(vec!["geosite:google".to_string()]),
                rule_type: Some(RuleType::DNS),
                ..RulesItem::default()
            },
        ],
        ..RoutingItem::default()
    });

    let mut tun_config = AppConfig::default();
    tun_config.tun_mode_item.enable_tun = true;
    tun_config.tun_mode_item.mtu = 1500;
    tun_config.tun_mode_item.stack = "system".to_string();
    tun_config.tun_mode_item.strict_route = false;
    tun_config.tun_mode_item.enable_ipv6_address = false;
    tun_config.simple_dns_item.add_common_hosts = Some(false);
    tun_config.simple_dns_item.block_binding_query = Some(false);
    let mut tun_context = test_context(tun_config, base_remote_node());
    tun_context.is_tun_enabled = true;

    (dns_context, tun_context)
}

fn test_context(app_config: AppConfig, node: ProfileItem) -> CoreConfigContext {
    let mut all_proxies_map = BTreeMap::new();
    all_proxies_map.insert(node.index_id.clone(), node.clone());
    let simple_dns_item = app_config.simple_dns_item.clone();
    CoreConfigContext {
        node,
        run_core_type: CoreType::sing_box,
        app_config,
        simple_dns_item,
        all_proxies_map,
        platform: CoreGenPlatform::Linux,
        ..CoreConfigContext::default()
    }
}

fn base_remote_node() -> ProfileItem {
    ProfileItem {
        remarks: "remote".to_string(),
        address: "server.example".to_string(),
        port: 443,
        network: DEFAULT_NETWORK.to_string(),
        stream_security: "tls".to_string(),
        sni: "server.example".to_string(),
        ..ProfileItem::default()
    }
}

fn socks_node(index_id: &str, remarks: &str) -> ProfileItem {
    ProfileItem {
        index_id: index_id.to_string(),
        config_type: ConfigType::SOCKS,
        remarks: remarks.to_string(),
        address: LOOPBACK.to_string(),
        port: 1080,
        username: "user".to_string(),
        password: "pass".to_string(),
        network: DEFAULT_NETWORK.to_string(),
        mux_enabled: Some(false),
        ..ProfileItem::default()
    }
}

fn assert_no_nulls(value: &Value) {
    match value {
        Value::Null => panic!("sing-box JSON must not contain null"),
        Value::Array(items) => {
            for item in items {
                assert_no_nulls(item);
            }
        }
        Value::Object(object) => {
            for item in object.values() {
                assert_no_nulls(item);
            }
        }
        Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
}
