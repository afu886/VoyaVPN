use super::*;

pub fn parse_share_link(input: &str) -> Result<ProfileItem, ShareError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(ShareError::EmptyInput);
    }
    if starts_with_ci(trimmed, "vmess://") {
        VmessFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "ss://") {
        ShadowsocksFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "socks://")
        || starts_with_ci(trimmed, "socks5://")
        || starts_with_ci(trimmed, "socks4://")
    {
        SocksFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "trojan://") {
        TrojanFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "vless://") {
        VlessFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, HYSTERIA2_DEFAULT_SCHEME)
        || starts_with_ci(trimmed, HYSTERIA2_ALT_SCHEME)
    {
        Hysteria2Fmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "tuic://") {
        TuicFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "wireguard://") {
        WireguardFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "anytls://") {
        AnytlsFmt.parse(trimmed)
    } else if starts_with_ci(trimmed, "naive://")
        || starts_with_ci(trimmed, NAIVE_HTTPS_SCHEME)
        || starts_with_ci(trimmed, NAIVE_QUIC_SCHEME)
    {
        NaiveFmt.parse(trimmed)
    } else {
        Err(ShareError::UnsupportedProtocol)
    }
}

pub fn export_share_link(item: &ProfileItem) -> Result<String, ShareError> {
    match item.config_type {
        ConfigType::VMess => VmessFmt.export(item),
        ConfigType::Shadowsocks => ShadowsocksFmt.export(item),
        ConfigType::SOCKS => SocksFmt.export(item),
        ConfigType::Trojan => TrojanFmt.export(item),
        ConfigType::VLESS => VlessFmt.export(item),
        ConfigType::Hysteria2 => Hysteria2Fmt.export(item),
        ConfigType::TUIC => TuicFmt.export(item),
        ConfigType::WireGuard => WireguardFmt.export(item),
        ConfigType::Anytls => AnytlsFmt.export(item),
        ConfigType::Naive => NaiveFmt.export(item),
        actual => Err(ShareError::WrongConfigType {
            protocol: "share",
            actual,
        }),
    }
}

pub fn parse_share_lines(input: &str) -> Vec<Result<ProfileItem, ShareError>> {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(parse_share_link)
        .collect()
}

pub fn parse_full_custom_config(
    input: &str,
    sub_remarks: Option<&str>,
) -> Result<Vec<CustomConfigImport>, ShareError> {
    let trimmed = input.trim();
    if trimmed.is_empty() || is_html_page(trimmed) {
        return Err(ShareError::InvalidFullConfig);
    }

    if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(trimmed) {
        let mut imports = Vec::new();
        for value in items {
            let object =
                serde_json::to_string(&value).map_err(|error| ShareError::InvalidJson {
                    protocol: "custom",
                    reason: error.to_string(),
                })?;
            if let Ok(mut nested) = parse_full_custom_config(&object, sub_remarks) {
                imports.append(&mut nested);
            }
        }
        if imports.is_empty() {
            return Err(ShareError::InvalidFullConfig);
        }
        return Ok(imports);
    }

    if let Some(import) = parse_singbox_custom(trimmed, sub_remarks)? {
        return Ok(vec![import]);
    }
    if contains_all_ci(trimmed, &["server", "auth", "up", "down", "listen"]) {
        return Ok(vec![custom_import(
            CustomConfigKind::Hysteria2,
            "json",
            trimmed,
            sub_remarks.unwrap_or("hysteria2_custom"),
        )]);
    }

    Err(ShareError::InvalidFullConfig)
}

pub fn export_inner_share_links(items: &[ProfileItem]) -> Result<String, ShareError> {
    let mut id_map = BTreeMap::<String, String>::new();
    for item in items
        .iter()
        .filter(|item| item.config_type != ConfigType::Custom)
    {
        if !item.index_id.is_empty() {
            let export_id = format!("inner-export-{}", id_map.len() + 1);
            id_map.entry(item.index_id.clone()).or_insert(export_id);
        }
    }

    let mut lines = Vec::new();
    for item in items
        .iter()
        .filter(|item| item.config_type != ConfigType::Custom)
    {
        let mut clone = item.clone();
        if let Some(mapped) = id_map.get(&clone.index_id) {
            clone.index_id.clone_from(mapped);
        }
        if is_group_type(clone.config_type) {
            if nonempty_option(&clone.protocol_extra.sub_child_items).is_some() {
                clone.protocol_extra.sub_child_items = Some("self".to_string());
            }
            if let Some(children) = nonempty_option(&clone.protocol_extra.child_items) {
                let mapped_children = split_csv(children)
                    .into_iter()
                    .filter_map(|child| id_map.get(&child).cloned())
                    .collect::<Vec<_>>();
                clone.protocol_extra.child_items = if mapped_children.is_empty() {
                    None
                } else {
                    Some(mapped_children.join(","))
                };
            }
        }
        lines.push(export_inner_single(&clone)?);
    }

    if lines.is_empty() {
        Err(ShareError::InvalidInner {
            reason: "no exportable profiles".to_string(),
        })
    } else {
        Ok(format!("{}\n", lines.join("\n")))
    }
}

pub fn parse_inner_share_links(input: &str, subid: &str) -> Result<Vec<ProfileItem>, ShareError> {
    let mut parsed = Vec::<ProfileItem>::new();
    let mut id_map = BTreeMap::<String, String>::new();

    for line in input.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if !starts_with_ci(line, INNER_URI_PROTOCOL) {
            continue;
        }
        let mut item = parse_inner_single(line)?;
        if item.config_type == ConfigType::Custom {
            continue;
        }
        let new_id = format!("inner-import-{}", parsed.len() + 1);
        if !item.index_id.is_empty() {
            id_map.insert(item.index_id.clone(), new_id.clone());
        }
        item.index_id = new_id;
        parsed.push(item);
    }

    let mut result = Vec::new();
    for mut item in parsed {
        if is_group_type(item.config_type) {
            if item.protocol_extra.sub_child_items.as_deref() == Some("self") {
                item.protocol_extra.sub_child_items = Some(subid.to_string());
            } else {
                item.protocol_extra.sub_child_items = None;
            }

            item.protocol_extra.child_items =
                item.protocol_extra
                    .child_items
                    .as_deref()
                    .and_then(|children| {
                        let mapped = split_csv(children)
                            .into_iter()
                            .filter_map(|id| id_map.get(&id).cloned())
                            .collect::<Vec<_>>();
                        if mapped.is_empty() {
                            None
                        } else {
                            Some(mapped.join(","))
                        }
                    });

            if item.protocol_extra.sub_child_items.is_none()
                && item.protocol_extra.child_items.is_none()
            {
                continue;
            }
        }
        result.push(item);
    }

    if result.is_empty() {
        Err(ShareError::InvalidInner {
            reason: "no valid profiles".to_string(),
        })
    } else {
        Ok(result)
    }
}

fn parse_singbox_custom(
    input: &str,
    sub_remarks: Option<&str>,
) -> Result<Option<CustomConfigImport>, ShareError> {
    let value = match serde_json::from_str::<Value>(input) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let Some(object) = value.as_object() else {
        return Ok(None);
    };
    if !(object.contains_key("inbounds")
        && object.contains_key("outbounds")
        && object.contains_key("route")
        && object.contains_key("dns"))
    {
        return Ok(None);
    }
    Ok(Some(custom_import(
        CustomConfigKind::SingBox,
        "json",
        input,
        sub_remarks.unwrap_or("singbox_custom"),
    )))
}

fn custom_import(
    kind: CustomConfigKind,
    extension: &str,
    contents: &str,
    remarks: &str,
) -> CustomConfigImport {
    CustomConfigImport {
        kind,
        extension: extension.to_string(),
        contents: contents.to_string(),
        profile: ProfileItem {
            config_type: ConfigType::Custom,
            address: String::new(),
            remarks: remarks.to_string(),
            ..ProfileItem::default()
        },
    }
}

fn export_inner_single(item: &ProfileItem) -> Result<String, ShareError> {
    let mut value = serde_json::to_value(item).map_err(|error| ShareError::InvalidInner {
        reason: error.to_string(),
    })?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| ShareError::InvalidInner {
            reason: "profile must serialize to object".to_string(),
        })?;
    if let Some(protocol_extra) = object.remove("ProtocolExtra") {
        object.insert("ProtoExtraObj".to_string(), protocol_extra);
    }
    if let Some(transport_extra) = object.remove("TransportExtra") {
        object.insert("TransportExtraObj".to_string(), transport_extra);
    }
    object.remove("Subid");
    object.remove("IsSub");
    remove_empty_json(&mut value);
    let json = serde_json::to_string(&value).map_err(|error| ShareError::InvalidInner {
        reason: error.to_string(),
    })?;
    let encoded = base64_encode(&json, false)
        .replace('+', "-")
        .replace('/', "_")
        .replace('=', "");
    Ok(format!(
        "{}{}/{}",
        INNER_URI_PROTOCOL,
        config_type_name(item.config_type),
        encoded
    ))
}

fn parse_inner_single(input: &str) -> Result<ProfileItem, ShareError> {
    let parsed = Url::parse(input).map_err(|error| ShareError::InvalidInner {
        reason: error.to_string(),
    })?;
    if !parsed.scheme().eq_ignore_ascii_case("v2rayn") {
        return Err(ShareError::InvalidInner {
            reason: "invalid scheme".to_string(),
        });
    }
    let segment = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .ok_or_else(|| ShareError::InvalidInner {
            reason: "missing payload".to_string(),
        })?;
    let decoded = base64_decode(segment, "inner").map_err(|error| ShareError::InvalidInner {
        reason: error.to_string(),
    })?;
    let mut value: Value =
        serde_json::from_str(&decoded).map_err(|error| ShareError::InvalidInner {
            reason: error.to_string(),
        })?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| ShareError::InvalidInner {
            reason: "profile JSON must be an object".to_string(),
        })?;
    if let Some(protocol_extra) = object.remove("ProtoExtraObj") {
        object.insert("ProtocolExtra".to_string(), protocol_extra);
    } else if let Some(protocol_extra) = object.remove("ProtoExtra") {
        if let Some(protocol_extra) = decode_json_string_value(protocol_extra)? {
            object.insert("ProtocolExtra".to_string(), protocol_extra);
        }
    }
    if let Some(transport_extra) = object.remove("TransportExtraObj") {
        object.insert("TransportExtra".to_string(), transport_extra);
    } else if let Some(transport_extra) = object.remove("TransportExtra") {
        if let Some(transport_extra) = decode_json_string_value(transport_extra)? {
            object.insert("TransportExtra".to_string(), transport_extra);
        }
    }
    let item: ProfileItem =
        serde_json::from_value(value).map_err(|error| ShareError::InvalidInner {
            reason: error.to_string(),
        })?;
    if item.config_version != 4 {
        return Err(ShareError::InvalidInner {
            reason: "unsupported config version".to_string(),
        });
    }
    if item.protocol_extra.multiple_load.is_some_and(|load| {
        !matches!(
            load,
            MultipleLoad::LeastPing
                | MultipleLoad::Fallback
                | MultipleLoad::Random
                | MultipleLoad::RoundRobin
                | MultipleLoad::LeastLoad
        )
    }) {
        return Err(ShareError::InvalidInner {
            reason: "unsupported multiple load".to_string(),
        });
    }
    Ok(item)
}

fn decode_json_string_value(value: Value) -> Result<Option<Value>, ShareError> {
    match value {
        Value::String(text) if !text.is_empty() => {
            serde_json::from_str(&text)
                .map(Some)
                .map_err(|error| ShareError::InvalidInner {
                    reason: error.to_string(),
                })
        }
        Value::Object(_) => Ok(Some(value)),
        _ => Ok(None),
    }
}

fn remove_empty_json(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for child in object.values_mut() {
                remove_empty_json(child);
            }
            object.retain(|_, child| !is_empty_json(child));
        }
        Value::Array(array) => {
            for child in array.iter_mut() {
                remove_empty_json(child);
            }
            array.retain(|child| !is_empty_json(child));
        }
        _ => {}
    }
}

fn is_empty_json(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::String(text) => text.is_empty(),
        Value::Array(items) => items.is_empty(),
        Value::Object(object) => object.is_empty(),
        _ => false,
    }
}
