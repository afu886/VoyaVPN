use super::*;

#[derive(Debug, Clone, PartialEq)]
pub(super) enum SingboxServer {
    Outbound(Box<SingboxOutbound>),
    Endpoint(Box<SingboxEndpoint>),
}

impl SingboxServer {
    fn tag(&self) -> &str {
        match self {
            Self::Outbound(outbound) => &outbound.tag,
            Self::Endpoint(endpoint) => &endpoint.tag,
        }
    }

    fn set_tag(&mut self, tag: String) {
        match self {
            Self::Outbound(outbound) => outbound.tag = tag,
            Self::Endpoint(endpoint) => endpoint.tag = tag,
        }
    }

    fn detour(&self) -> Option<&str> {
        match self {
            Self::Outbound(outbound) => outbound.detour.as_deref(),
            Self::Endpoint(endpoint) => endpoint.detour.as_deref(),
        }
    }

    fn set_detour(&mut self, detour: &str) {
        match self {
            Self::Outbound(outbound) => outbound.detour = Some(detour.to_string()),
            Self::Endpoint(endpoint) => endpoint.detour = Some(detour.to_string()),
        }
    }

    fn starts_with(&self, prefix: &str) -> bool {
        self.tag().starts_with(prefix)
    }
}

pub(super) fn gen_outbounds(config: &mut SingboxConfig, context: &CoreConfigContext) {
    let servers = build_all_proxy_servers(context, &context.node, PROXY_TAG, true);
    prepend_servers(config, servers);
}

pub(super) fn build_all_proxy_servers(
    context: &CoreConfigContext,
    node: &ProfileItem,
    base_tag_name: &str,
    with_selector: bool,
) -> Vec<SingboxServer> {
    let mut proxy_servers = if node.config_type.is_group_type() {
        build_group_proxy_servers(context, node, base_tag_name)
    } else {
        build_proxy_server(context, node, base_tag_name)
            .into_iter()
            .collect()
    };

    if with_selector {
        let proxy_tags = ordered_proxy_tags(&proxy_servers, base_tag_name);
        if proxy_tags.len() > 1 {
            let mut selectors = build_selector_servers(node, &proxy_tags, base_tag_name);
            selectors.extend(proxy_servers);
            proxy_servers = selectors;
        }
    }

    proxy_servers
}

fn build_proxy_server(
    context: &CoreConfigContext,
    node: &ProfileItem,
    base_tag_name: &str,
) -> Option<SingboxServer> {
    if node.config_type == ConfigType::WireGuard {
        let mut endpoint = build_wireguard_endpoint(node)?;
        endpoint.tag = base_tag_name.to_string();
        return Some(SingboxServer::Endpoint(Box::new(endpoint)));
    }

    let mut outbound = build_outbound(context, node);
    outbound.tag = base_tag_name.to_string();
    Some(SingboxServer::Outbound(Box::new(outbound)))
}

fn build_group_proxy_servers(
    context: &CoreConfigContext,
    node: &ProfileItem,
    base_tag_name: &str,
) -> Vec<SingboxServer> {
    match node.config_type {
        ConfigType::PolicyGroup => build_outbounds_list(context, node, base_tag_name),
        ConfigType::ProxyChain => build_chain_outbounds_list(context, node, base_tag_name),
        _ => Vec::new(),
    }
}

fn build_outbounds_list(
    context: &CoreConfigContext,
    node: &ProfileItem,
    base_tag_name: &str,
) -> Vec<SingboxServer> {
    let nodes = buildable_child_nodes(context, node);
    let mut result: Vec<SingboxServer> = Vec::new();

    for (index, child_node) in nodes.iter().enumerate() {
        let current_tag = if nodes.len() == 1 {
            base_tag_name.to_string()
        } else {
            format!("{base_tag_name}-{}-{}", index + 1, child_node.remarks)
        };

        if child_node.config_type.is_group_type() {
            result.extend(build_group_proxy_servers(context, child_node, &current_tag));
            continue;
        }

        if let Some(server) = build_proxy_server(context, child_node, &current_tag) {
            result.push(server);
        }
    }

    result
}

fn build_chain_outbounds_list(
    context: &CoreConfigContext,
    node: &ProfileItem,
    base_tag_name: &str,
) -> Vec<SingboxServer> {
    let nodes = buildable_child_nodes(context, node);
    let nodes_reverse = nodes.into_iter().rev().collect::<Vec<_>>();
    let mut result: Vec<SingboxServer> = Vec::new();

    for (index, child_node) in nodes_reverse.iter().enumerate() {
        let current_tag = if index == 0 {
            base_tag_name.to_string()
        } else {
            format!("chain-{base_tag_name}-{index}-{}", child_node.remarks)
        };
        let detour_tag = (index != nodes_reverse.len().saturating_sub(1)).then(|| {
            format!(
                "chain-{base_tag_name}-{}-{}",
                index + 1,
                nodes_reverse[index + 1].remarks
            )
        });

        if child_node.config_type.is_group_type() {
            let mut child_profiles = build_group_proxy_servers(context, child_node, &current_tag);
            if let Some(detour_tag) = detour_tag.as_deref() {
                for server in child_profiles
                    .iter_mut()
                    .filter(|server| server.detour().is_none_or(str::is_empty))
                {
                    server.set_detour(detour_tag);
                }
            }

            if index != 0 {
                let chain_start_nodes = child_profiles
                    .iter()
                    .filter(|server| server.starts_with(&current_tag))
                    .cloned()
                    .collect::<Vec<_>>();
                if chain_start_nodes.len() == 1 {
                    let first_chain_tag = chain_start_nodes[0].tag().to_string();
                    for server in &mut result {
                        if server.detour() == Some(current_tag.as_str()) {
                            server.set_detour(&first_chain_tag);
                        }
                    }
                } else if chain_start_nodes.len() > 1 {
                    let existed_chain_nodes = result.clone();
                    result.clear();
                    for (branch_index, chain_start_node) in chain_start_nodes.iter().enumerate() {
                        let mut existed_chain_nodes_clone = existed_chain_nodes.clone();
                        for existed_chain_node in &mut existed_chain_nodes_clone {
                            existed_chain_node.set_tag(format!(
                                "{}-clone-{}",
                                existed_chain_node.tag(),
                                branch_index + 1
                            ));
                        }
                        for chain_index in 0..existed_chain_nodes_clone.len() {
                            let previous_detour = existed_chain_nodes_clone[chain_index]
                                .detour()
                                .map(str::to_string);
                            let next_tag = if chain_index + 1 < existed_chain_nodes_clone.len() {
                                existed_chain_nodes_clone[chain_index + 1].tag().to_string()
                            } else {
                                chain_start_node.tag().to_string()
                            };
                            let next_detour =
                                if previous_detour.as_deref() == Some(current_tag.as_str()) {
                                    chain_start_node.tag()
                                } else {
                                    &next_tag
                                };
                            existed_chain_nodes_clone[chain_index].set_detour(next_detour);
                            result.push(existed_chain_nodes_clone[chain_index].clone());
                        }
                    }
                }
            }

            result.extend(child_profiles);
            continue;
        }

        let Some(mut outbound) = build_proxy_server(context, child_node, &current_tag) else {
            continue;
        };
        if let Some(detour_tag) = detour_tag {
            outbound.set_detour(&detour_tag);
        }
        result.push(outbound);
    }

    result
}

pub(super) fn build_outbound(context: &CoreConfigContext, node: &ProfileItem) -> SingboxOutbound {
    let protocol_extra = &node.protocol_extra;
    let transport_extra = &node.transport_extra;
    let network = singbox_network(node);
    let mut outbound = SingboxOutbound {
        r#type: protocol_name(node.config_type).to_string(),
        tag: PROXY_TAG.to_string(),
        server: Some(node.address.clone()),
        server_port: Some(node.port),
        ..SingboxOutbound::default()
    };

    match node.config_type {
        ConfigType::VMess => {
            outbound.uuid = Some(node.password.clone());
            outbound.alter_id = Some(parse_i32(protocol_extra.alter_id.as_deref()).unwrap_or(0));
            outbound.security = Some(vmess_security(protocol_extra));
            fill_outbound_mux(&mut outbound, context, node);
            fill_outbound_transport(&mut outbound, context, node, &network, transport_extra);
        }
        ConfigType::Shadowsocks => {
            outbound.method = Some(shadowsocks_method(protocol_extra));
            outbound.password = Some(node.password.clone());
            outbound.udp_over_tcp = (protocol_extra.uot == Some(true)).then_some(true);
            fill_shadowsocks_plugin(&mut outbound, node, &network, transport_extra);
            fill_outbound_mux(&mut outbound, context, node);
        }
        ConfigType::SOCKS => {
            outbound.version = Some("5".to_string());
            if !trimmed(&node.username).is_empty() && !trimmed(&node.password).is_empty() {
                outbound.username = Some(node.username.clone());
                outbound.password = Some(node.password.clone());
            }
        }
        ConfigType::HTTP => {
            if !trimmed(&node.username).is_empty() && !trimmed(&node.password).is_empty() {
                outbound.username = Some(node.username.clone());
                outbound.password = Some(node.password.clone());
            }
        }
        ConfigType::VLESS => {
            outbound.uuid = Some(node.password.clone());
            outbound.packet_encoding = Some("xudp".to_string());
            if let Some(flow) = nonempty_string(protocol_extra.flow.as_deref()) {
                outbound.flow = Some(flow);
            } else {
                fill_outbound_mux(&mut outbound, context, node);
            }
            fill_outbound_transport(&mut outbound, context, node, &network, transport_extra);
        }
        ConfigType::Trojan => {
            outbound.password = Some(node.password.clone());
            fill_outbound_mux(&mut outbound, context, node);
            fill_outbound_transport(&mut outbound, context, node, &network, transport_extra);
        }
        ConfigType::Hysteria2 => {
            outbound.password = Some(node.password.clone());
            fill_hysteria2_fields(&mut outbound, context, protocol_extra);
        }
        ConfigType::TUIC => {
            outbound.uuid = nonempty_string(Some(&node.username));
            outbound.password = Some(node.password.clone());
            outbound.congestion_control =
                nonempty_string(protocol_extra.congestion_control.as_deref());
        }
        ConfigType::Anytls => {
            outbound.password = Some(node.password.clone());
        }
        ConfigType::Naive => {
            outbound.username = nonempty_string(Some(&node.username));
            outbound.password = Some(node.password.clone());
            if protocol_extra.naive_quic == Some(true) {
                outbound.quic = Some(true);
                outbound.quic_congestion_control =
                    nonempty_string(protocol_extra.congestion_control.as_deref());
            }
            outbound.insecure_concurrency = protocol_extra
                .insecure_concurrency
                .filter(|value| *value > 0);
            outbound.udp_over_tcp = (protocol_extra.uot == Some(true)).then_some(true);
        }
        ConfigType::WireGuard
        | ConfigType::Custom
        | ConfigType::PolicyGroup
        | ConfigType::ProxyChain => {}
    }

    fill_outbound_tls(&mut outbound, context, node);
    outbound
}

fn build_wireguard_endpoint(node: &ProfileItem) -> Option<SingboxEndpoint> {
    let protocol_extra = &node.protocol_extra;
    let public_key = wireguard_public_key(protocol_extra)?;
    Some(SingboxEndpoint {
        r#type: protocol_name(node.config_type).to_string(),
        tag: PROXY_TAG.to_string(),
        address: split_list(
            protocol_extra
                .wg_interface_address
                .as_deref()
                .unwrap_or_default(),
        )
        .filter(|items| !items.is_empty())
        .unwrap_or_else(|| vec![WIREGUARD_DEFAULT_ADDRESS.to_string()]),
        private_key: node.password.clone(),
        mtu: Some(
            protocol_extra
                .wg_mtu
                .filter(|mtu| *mtu > 0)
                .unwrap_or(WIREGUARD_DEFAULT_MTU),
        ),
        peers: vec![SingboxPeer {
            address: node.address.clone(),
            port: node.port,
            public_key,
            pre_shared_key: protocol_extra.wg_preshared_key.clone(),
            allowed_ips: wireguard_allowed_ips(protocol_extra),
            reserved: parse_wireguard_reserved(protocol_extra.wg_reserved.as_deref()),
            persistent_keepalive_interval: None,
        }],
        ..SingboxEndpoint::default()
    })
}

fn fill_shadowsocks_plugin(
    outbound: &mut SingboxOutbound,
    node: &ProfileItem,
    network: &str,
    transport_extra: &TransportExtraItem,
) {
    if network == DEFAULT_NETWORK
        && transport_extra.raw_header_type.as_deref() == Some(RAW_HEADER_HTTP)
    {
        outbound.plugin = Some("obfs-local".to_string());
        outbound.plugin_opts = Some(format!(
            "obfs=http;obfs-host={};",
            transport_extra.host.as_deref().unwrap_or_default()
        ));
        return;
    }

    let mut plugin_args = String::new();
    if network == "ws" {
        plugin_args.push_str("mode=websocket;");
        plugin_args.push_str(&format!(
            "host={};",
            first_list_value(transport_extra.host.as_deref())
        ));
        let path = transport_extra
            .path
            .as_deref()
            .unwrap_or_default()
            .replace('\\', "\\\\")
            .replace('=', "\\=")
            .replace(',', "\\,");
        plugin_args.push_str(&format!("path={path};"));
    }
    if node.stream_security == STREAM_SECURITY_TLS {
        plugin_args.push_str("tls;");
        let certs = parse_pem_chain(&node.cert);
        if let Some(cert) = certs.first() {
            let base64_content = cert
                .replace("-----BEGIN CERTIFICATE-----\n", "")
                .replace("\n-----END CERTIFICATE-----\n", "")
                .trim()
                .replace('=', "\\=");
            plugin_args.push_str(&format!("certRaw={base64_content};"));
        }
    }
    if !plugin_args.is_empty() {
        plugin_args.push_str("mux=0;");
        plugin_args.pop();
        outbound.plugin = Some("v2ray-plugin".to_string());
        outbound.plugin_opts = Some(plugin_args);
    }
}

fn fill_hysteria2_fields(
    outbound: &mut SingboxOutbound,
    context: &CoreConfigContext,
    protocol_extra: &ProtocolExtraItem,
) {
    if let Some(salamander_pass) = nonempty_str(protocol_extra.salamander_pass.as_deref()) {
        outbound.obfs = Some(SingboxHyObfs {
            r#type: Some("salamander".to_string()),
            password: Some(salamander_pass.to_string()),
        });
    }

    let up_mbps = protocol_extra
        .up_mbps
        .filter(|value| *value >= 0)
        .unwrap_or(context.app_config.hysteria_item.up_mbps);
    let down_mbps = protocol_extra
        .down_mbps
        .filter(|value| *value >= 0)
        .unwrap_or(context.app_config.hysteria_item.down_mbps);
    outbound.up_mbps = (up_mbps > 0).then_some(up_mbps);
    outbound.down_mbps = (down_mbps > 0).then_some(down_mbps);

    let Some(ports) = nonempty_str(protocol_extra.ports.as_deref()) else {
        return;
    };
    if !ports.contains([':', '-', ',']) {
        return;
    }

    let server_ports = ports
        .split(',')
        .map(str::trim)
        .filter(|port| !port.is_empty())
        .map(|port| {
            let port = port.replace('-', ":");
            if port.contains(':') {
                port
            } else {
                format!("{port}:{port}")
            }
        })
        .collect::<Vec<_>>();
    if !server_ports.is_empty() {
        outbound.server_port = None;
        outbound.server_ports = Some(server_ports);
    }

    let default_interval = if context.app_config.hysteria_item.hop_interval >= 5 {
        context.app_config.hysteria_item.hop_interval
    } else {
        DEFAULT_HYSTERIA2_HOP_INTERVAL
    };
    let interval = protocol_extra
        .hop_interval
        .as_deref()
        .and_then(parse_hysteria_hop_interval)
        .filter(|value| *value >= 5)
        .unwrap_or(default_interval);
    outbound.hop_interval = Some(format!("{interval}s"));
}

pub(super) fn parse_hysteria_hop_interval(value: &str) -> Option<i32> {
    let value = value.trim();
    if let Ok(value) = value.parse::<i64>() {
        return Some(clamp_i64_to_i32(value));
    }
    let (left, right) = value.split_once('-')?;
    let left = left.trim().parse::<i64>().ok()?;
    let right = right.trim().parse::<i64>().ok()?;
    let midpoint = left.checked_add(right).map_or_else(
        || {
            if left.is_negative() && right.is_negative() {
                i64::MIN
            } else {
                i64::MAX
            }
        },
        |sum| sum / 2,
    );
    Some(clamp_i64_to_i32(midpoint))
}

fn clamp_i64_to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

fn fill_outbound_mux(
    outbound: &mut SingboxOutbound,
    context: &CoreConfigContext,
    node: &ProfileItem,
) {
    let mux_enabled = node
        .mux_enabled
        .unwrap_or(context.app_config.core_basic_item.mux_enabled);
    if !mux_enabled {
        return;
    }
    let protocol = trimmed(&context.app_config.mux4_sbox_item.protocol);
    if protocol.is_empty() {
        return;
    }
    outbound.multiplex = Some(SingboxMultiplex {
        enabled: true,
        protocol: protocol.to_string(),
        max_connections: context.app_config.mux4_sbox_item.max_connections,
        padding: context.app_config.mux4_sbox_item.padding,
    });
}

fn fill_outbound_transport(
    outbound: &mut SingboxOutbound,
    context: &CoreConfigContext,
    node: &ProfileItem,
    network: &str,
    transport_extra: &TransportExtraItem,
) {
    let user_agent = raw_http_user_agent(&context.app_config.core_basic_item.def_user_agent);
    let mut transport = SingboxTransport::default();

    match network {
        DEFAULT_NETWORK => {
            if transport_extra.raw_header_type.as_deref() == Some(RAW_HEADER_HTTP) {
                transport.r#type = Some("http".to_string());
                transport.host = split_list(transport_extra.host.as_deref().unwrap_or_default())
                    .filter(|items| !items.is_empty())
                    .map(|items| json!(items));
                transport.path = nonempty_string(transport_extra.path.as_deref());
                if !user_agent.is_empty() {
                    transport.headers = Some(SingboxHeaders {
                        host: None,
                        user_agent: Some(user_agent),
                    });
                }
            }
        }
        "ws" => {
            transport.r#type = Some("ws".to_string());
            let mut ws_path = transport_extra.path.clone().unwrap_or_default();
            let (path, early_data, early_header) = parse_ws_early_data(&ws_path);
            ws_path = path;
            transport.path = nonempty_string(Some(&ws_path));
            transport.max_early_data = early_data;
            transport.early_data_header_name = early_header;
            let host = first_list_value(transport_extra.host.as_deref());
            if !host.is_empty() || !user_agent.is_empty() {
                transport.headers = Some(SingboxHeaders {
                    host: nonempty_string(Some(&host)),
                    user_agent: nonempty_string(Some(&user_agent)),
                });
            }
        }
        "httpupgrade" => {
            transport.r#type = Some("httpupgrade".to_string());
            transport.path = nonempty_string(transport_extra.path.as_deref());
            let host = first_list_value(transport_extra.host.as_deref());
            transport.host = nonempty_string(Some(&host)).map(Value::String);
            if !user_agent.is_empty() {
                transport.headers = Some(SingboxHeaders {
                    host: None,
                    user_agent: Some(user_agent),
                });
            }
        }
        "grpc" => {
            transport.r#type = Some("grpc".to_string());
            transport.service_name = Some(
                transport_extra
                    .grpc_service_name
                    .clone()
                    .unwrap_or_default(),
            );
            transport.idle_timeout = context
                .app_config
                .grpc_item
                .idle_timeout
                .map(|value| format!("{value}s"));
            transport.ping_timeout = context
                .app_config
                .grpc_item
                .health_check_timeout
                .map(|value| format!("{value}s"));
            transport.permit_without_stream = context.app_config.grpc_item.permit_without_stream;
        }
        _ => {}
    }

    if transport.r#type.is_some() {
        outbound.transport = Some(transport);
    }

    if node.config_type == ConfigType::Shadowsocks {
        outbound.transport = None;
    }
}

fn parse_ws_early_data(path: &str) -> (String, Option<i32>, Option<String>) {
    let mut result_path = path.to_string();
    let mut early_data = None;
    let mut early_header = None;

    if let Ok(ed_regex) = Regex::new(r"[?&]ed=(\d+)") {
        if let Some(captures) = ed_regex.captures(&result_path) {
            early_data = captures
                .get(1)
                .and_then(|value| value.as_str().parse::<i32>().ok());
            if early_data.is_some() {
                early_header = Some(USER_AGENT_HEADER.to_string());
                result_path = ed_regex.replace(&result_path, "").to_string();
                result_path = result_path.replace("?&", "?");
                if result_path.ends_with('?') {
                    result_path.pop();
                }
            }
        }
    }

    if let Ok(eh_regex) = Regex::new(r"[?&]eh=([^&]+)") {
        if let Some(captures) = eh_regex.captures(&result_path) {
            if let Some(value) = captures.get(1) {
                early_header = percent_encoding::percent_decode_str(value.as_str())
                    .decode_utf8()
                    .ok()
                    .map(|value| value.to_string());
            }
        }
    }

    (result_path, early_data, early_header)
}

fn fill_outbound_tls(
    outbound: &mut SingboxOutbound,
    context: &CoreConfigContext,
    node: &ProfileItem,
) {
    if !matches!(
        node.stream_security.as_str(),
        STREAM_SECURITY_TLS | STREAM_SECURITY_REALITY
    ) || matches!(
        node.config_type,
        ConfigType::Shadowsocks | ConfigType::SOCKS | ConfigType::WireGuard
    ) {
        return;
    }

    let transport_host = transport_host_for_tls(node);
    let server_name = nonempty_string(Some(&node.sni)).or_else(|| {
        split_list(transport_host.as_deref().unwrap_or_default()).and_then(|items| {
            items
                .into_iter()
                .map(|item| item.trim().to_string())
                .find(|item| !item.is_empty())
        })
    });
    let mut tls = SingboxTls {
        enabled: true,
        server_name,
        insecure: Some(allow_insecure(node, context)),
        alpn: split_list(&node.alpn).filter(|items| !items.is_empty()),
        record_fragment: context
            .app_config
            .core_basic_item
            .enable_fragment
            .then_some(true),
        ech: parse_ech(&node.ech_config_list),
        ..SingboxTls::default()
    };

    if let Some(fingerprint) = effective_fingerprint(node, context) {
        tls.utls = Some(SingboxUtls {
            enabled: true,
            fingerprint,
        });
    }

    if node.stream_security == STREAM_SECURITY_TLS {
        let certs = parse_pem_chain(&node.cert);
        if !certs.is_empty() {
            tls.certificate = Some(certs);
            tls.insecure = Some(false);
        }
    } else if node.stream_security == STREAM_SECURITY_REALITY {
        tls.reality = Some(SingboxReality {
            enabled: true,
            public_key: node.public_key.clone(),
            short_id: node.short_id.clone(),
        });
        tls.insecure = Some(false);
    }

    outbound.tls = Some(tls);
}

fn parse_ech(ech_config: &str) -> Option<SingboxEch> {
    let ech_config = ech_config.trim();
    if ech_config.is_empty() {
        return None;
    }
    if !ech_config.contains("://") {
        return Some(SingboxEch {
            enabled: true,
            config: Some(vec![format!(
                "-----BEGIN ECH CONFIGS-----\n{ech_config}\n-----END ECH CONFIGS-----"
            )]),
            query_server_name: None,
        });
    }

    let query_server_name = ech_config
        .split_once('+')
        .map(|(query_server_name, _)| query_server_name)
        .and_then(|value| nonempty_string(Some(value)));

    Some(SingboxEch {
        enabled: true,
        config: None,
        query_server_name,
    })
}

fn build_selector_servers(
    node: &ProfileItem,
    proxy_tags: &[String],
    base_tag_name: &str,
) -> Vec<SingboxServer> {
    let multiple_load = node
        .protocol_extra
        .multiple_load
        .unwrap_or(MultipleLoad::LeastPing);
    let auto_tag = format!("{base_tag_name}-auto");
    let out_urltest = SingboxOutbound {
        r#type: "urltest".to_string(),
        tag: auto_tag.clone(),
        outbounds: Some(proxy_tags.to_vec()),
        interrupt_exist_connections: Some(false),
        tolerance: (multiple_load == MultipleLoad::Fallback).then_some(5000),
        ..SingboxOutbound::default()
    };
    let mut selector_outbounds = proxy_tags.to_vec();
    selector_outbounds.insert(0, auto_tag);
    let out_selector = SingboxOutbound {
        r#type: "selector".to_string(),
        tag: base_tag_name.to_string(),
        outbounds: Some(selector_outbounds),
        interrupt_exist_connections: Some(false),
        ..SingboxOutbound::default()
    };

    vec![
        SingboxServer::Outbound(Box::new(out_selector)),
        SingboxServer::Outbound(Box::new(out_urltest)),
    ]
}

fn ordered_proxy_tags(servers: &[SingboxServer], base_tag_name: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut tags = Vec::new();
    for server in servers {
        let tag = server.tag();
        if tag.starts_with(base_tag_name) && seen.insert(tag.to_string()) {
            tags.push(tag.to_string());
        }
    }
    tags
}

fn prepend_servers(config: &mut SingboxConfig, servers: Vec<SingboxServer>) {
    let mut outbounds = Vec::new();
    let mut endpoints = Vec::new();
    for server in servers {
        match server {
            SingboxServer::Outbound(outbound) => outbounds.push(*outbound),
            SingboxServer::Endpoint(endpoint) => endpoints.push(*endpoint),
        }
    }
    config.outbounds.splice(0..0, outbounds);
    config.endpoints.splice(0..0, endpoints);
}

pub(super) fn append_servers(config: &mut SingboxConfig, servers: Vec<SingboxServer>) {
    for server in servers {
        match server {
            SingboxServer::Outbound(outbound) => config.outbounds.push(*outbound),
            SingboxServer::Endpoint(endpoint) => config.endpoints.push(*endpoint),
        }
    }
}
