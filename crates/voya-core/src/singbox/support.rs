use super::*;

pub(super) fn apply_outbound_bind_interface(
    config: &mut SingboxConfig,
    context: &CoreConfigContext,
) {
    let Some(bind_interface) =
        nonempty_string(context.app_config.core_basic_item.bind_interface.as_deref())
    else {
        return;
    };
    if !(context.is_tun_enabled || context.is_windows()) {
        return;
    }
    for outbound in &mut config.outbounds {
        if should_bind_outbound(outbound) {
            outbound.bind_interface = Some(bind_interface.clone());
        }
    }
}

pub(super) fn apply_outbound_send_through(config: &mut SingboxConfig, context: &CoreConfigContext) {
    let Some(send_through) =
        nonempty_string(context.app_config.core_basic_item.send_through.as_deref())
    else {
        return;
    };
    for outbound in &mut config.outbounds {
        if should_bind_outbound(outbound) {
            outbound.inet4_bind_address = Some(send_through.clone());
        }
    }
}

fn should_bind_outbound(outbound: &SingboxOutbound) -> bool {
    if matches!(
        outbound.r#type.as_str(),
        "direct" | "block" | "dns" | "selector" | "urltest"
    ) || outbound
        .detour
        .as_deref()
        .is_some_and(|detour| !detour.is_empty())
    {
        return false;
    }
    outbound
        .server
        .as_deref()
        .is_none_or(|server| !is_loopback_address(server))
}

pub(super) fn apply_full_config_template(
    context: &CoreConfigContext,
    config: &SingboxConfig,
) -> Value {
    let Some(template) = &context.full_config_template else {
        return value_from_config(config);
    };
    if !template.enabled {
        return value_from_config(config);
    }
    let Some(template_json) = template_json_for_context(context) else {
        return value_from_config(config);
    };
    let Ok(mut template_value) = serde_json::from_str::<Value>(template_json) else {
        return value_from_config(config);
    };
    let Some(template_object) = template_value.as_object_mut() else {
        return value_from_config(config);
    };

    let mut generated_outbounds = template_object
        .get("outbounds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for outbound in &config.outbounds {
        if template.add_proxy_only == Some(true)
            && matches!(outbound.r#type.as_str(), "direct" | "block")
        {
            continue;
        }
        let mut outbound = outbound.clone();
        if outbound.detour.as_deref().is_none_or(str::is_empty) {
            if let Some(proxy_detour) = nonempty_str(template.proxy_detour.as_deref()) {
                if outbound
                    .server
                    .as_deref()
                    .is_none_or(|server| !is_private_network(server))
                    && !matches!(outbound.r#type.as_str(), "direct" | "block")
                {
                    outbound.detour = Some(proxy_detour.to_string());
                }
            }
        }
        generated_outbounds.push(serde_json::to_value(outbound).unwrap_or_else(|_| json!({})));
    }
    template_object.insert("outbounds".to_string(), Value::Array(generated_outbounds));

    if !config.endpoints.is_empty() {
        let mut generated_endpoints = template_object
            .get("endpoints")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for endpoint in &config.endpoints {
            let mut endpoint = endpoint.clone();
            if endpoint.detour.as_deref().is_none_or(str::is_empty) {
                if let Some(proxy_detour) = nonempty_str(template.proxy_detour.as_deref()) {
                    endpoint.detour = Some(proxy_detour.to_string());
                }
            }
            generated_endpoints.push(serde_json::to_value(endpoint).unwrap_or_else(|_| json!({})));
        }
        template_object.insert("endpoints".to_string(), Value::Array(generated_endpoints));
    }

    template_value
}

fn template_json_for_context(context: &CoreConfigContext) -> Option<&str> {
    let template = context.full_config_template.as_ref()?;
    if context.is_tun_enabled {
        template.tun_config.as_deref()
    } else {
        template.config.as_deref()
    }
}

fn child_nodes(context: &CoreConfigContext, node: &ProfileItem) -> Vec<ProfileItem> {
    let mut seen = BTreeSet::new();
    split_list(
        node.protocol_extra
            .child_items
            .as_deref()
            .unwrap_or_default(),
    )
    .unwrap_or_default()
    .into_iter()
    .filter(|node_id| seen.insert(node_id.clone()))
    .filter_map(|node_id| context.all_proxies_map.get(&node_id).cloned())
    .collect()
}

pub(super) fn buildable_child_nodes(
    context: &CoreConfigContext,
    node: &ProfileItem,
) -> Vec<ProfileItem> {
    child_nodes(context, node)
        .into_iter()
        .filter(|child| child.config_type.is_group_type() || singbox_can_build_leaf(child))
        .collect()
}

fn singbox_can_build_leaf(node: &ProfileItem) -> bool {
    singbox_supports_config_type(node.config_type)
        && (node.config_type != ConfigType::WireGuard
            || wireguard_public_key(&node.protocol_extra).is_some())
}

pub(super) fn singbox_supports_config_type(config_type: ConfigType) -> bool {
    matches!(
        config_type,
        ConfigType::VMess
            | ConfigType::VLESS
            | ConfigType::Shadowsocks
            | ConfigType::Trojan
            | ConfigType::Hysteria2
            | ConfigType::TUIC
            | ConfigType::Anytls
            | ConfigType::Naive
            | ConfigType::WireGuard
            | ConfigType::SOCKS
            | ConfigType::HTTP
    )
}

pub(super) fn singbox_network(node: &ProfileItem) -> String {
    let network = trimmed(&node.network);
    if network.is_empty() {
        DEFAULT_NETWORK.to_string()
    } else {
        network.to_string()
    }
}

pub(super) fn vmess_security(protocol_extra: &ProtocolExtraItem) -> String {
    let security = protocol_extra.vmess_security.as_deref().unwrap_or_default();
    if VMESS_SECURITIES.contains(&security) {
        security.to_string()
    } else {
        DEFAULT_SECURITY.to_string()
    }
}

pub(super) fn shadowsocks_method(protocol_extra: &ProtocolExtraItem) -> String {
    let method = protocol_extra.ss_method.as_deref().unwrap_or_default();
    if SS_SECURITIES_IN_SINGBOX.contains(&method) {
        method.to_string()
    } else {
        "none".to_string()
    }
}

pub(super) fn allow_insecure(node: &ProfileItem, context: &CoreConfigContext) -> bool {
    if !context.app_config.core_basic_item.def_allow_insecure {
        return false;
    }

    let node_value = trimmed(&node.allow_insecure);
    node_value.is_empty() || node_value.eq_ignore_ascii_case("true")
}

pub(super) fn effective_fingerprint(
    node: &ProfileItem,
    context: &CoreConfigContext,
) -> Option<String> {
    singbox_utls_fingerprint(&node.fingerprint)
        .or_else(|| singbox_utls_fingerprint(&context.app_config.core_basic_item.def_fingerprint))
}

fn singbox_utls_fingerprint(value: &str) -> Option<String> {
    let fingerprint = trimmed(value).to_ascii_lowercase();
    if SINGBOX_UTLS_FINGERPRINTS.contains(&fingerprint.as_str()) {
        Some(fingerprint)
    } else {
        None
    }
}

pub(super) fn transport_host_for_tls(node: &ProfileItem) -> Option<String> {
    let host = match singbox_network(node).as_str() {
        DEFAULT_NETWORK | "ws" | "httpupgrade" | "xhttp" => node.transport_extra.host.clone(),
        "grpc" => node.transport_extra.grpc_authority.clone(),
        _ => None,
    };
    let first_host = first_list_value(host.as_deref());
    nonempty_string(Some(&first_host))
}

pub(super) fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect()
}

pub(super) fn nonempty_string(value: Option<&str>) -> Option<String> {
    nonempty_str(value).map(str::to_string)
}

pub(super) fn state_port2(app_config: &AppConfig, is_tun_enabled: bool) -> i32 {
    inbound_port(app_config, InboundProtocol::api2) + i32::from(is_tun_enabled)
}

pub(super) fn exe_name(process: &str) -> String {
    process
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(process)
        .trim_end_matches(".exe")
        .to_string()
}

fn is_loopback_address(address: &str) -> bool {
    let address = address.trim_matches(['[', ']']);
    address.eq_ignore_ascii_case("localhost")
        || address
            .parse::<IpAddr>()
            .is_ok_and(|ip_address| ip_address.is_loopback())
}

fn is_private_network(address: &str) -> bool {
    let address = address.trim_matches(['[', ']']);
    if address.eq_ignore_ascii_case("localhost") {
        return true;
    }
    match address.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => address.is_private() || address.is_loopback(),
        Ok(IpAddr::V6(address)) => {
            address.is_loopback() || (address.segments()[0] & 0xfe00) == 0xfc00
        }
        Err(_) => false,
    }
}

fn value_from_config(config: &SingboxConfig) -> Value {
    serde_json::to_value(config).unwrap_or_else(|_| json!({}))
}
