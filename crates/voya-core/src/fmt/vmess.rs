use super::*;

#[derive(Debug, Clone, Copy)]
pub struct VmessFmt;

impl ShareFmt for VmessFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::VMess
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        if input.contains('@') {
            parse_vmess_standard(input).or_else(|_| parse_vmess_base64(input))
        } else {
            parse_vmess_base64(input)
        }
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("vmess", item, ConfigType::VMess)?;
        ensure_address_port("vmess", item)?;
        ensure_nonempty("vmess", "password", &item.password)?;

        let aid = item
            .protocol_extra
            .alter_id
            .as_deref()
            .unwrap_or("0")
            .parse::<i32>()
            .unwrap_or(0);
        let network = item_network(item);
        let transport = &item.transport_extra;
        let vmess = json_object([
            ("v", Value::String("2".to_string())),
            ("ps", Value::String(item.remarks.trim().to_string())),
            ("add", Value::String(item.address.clone())),
            ("port", Value::String(item.port.to_string())),
            ("id", Value::String(item.password.clone())),
            ("aid", Value::String(aid.to_string())),
            (
                "scy",
                Value::String(
                    nonempty_option(&item.protocol_extra.vmess_security)
                        .unwrap_or(DEFAULT_SECURITY)
                        .to_string(),
                ),
            ),
            (
                "net",
                Value::String(if network == DEFAULT_NETWORK {
                    RAW_NETWORK_ALIAS.to_string()
                } else {
                    network.to_string()
                }),
            ),
            (
                "type",
                Value::String(match network {
                    "raw" => option_or(&transport.raw_header_type, NONE),
                    "kcp" => option_or(&transport.kcp_header_type, NONE),
                    "xhttp" => option_or(&transport.xhttp_mode, NONE),
                    "grpc" => option_or(&transport.grpc_mode, NONE),
                    _ => NONE.to_string(),
                }),
            ),
            (
                "host",
                Value::String(match network {
                    "raw" | "ws" | "httpupgrade" | "xhttp" => option_or(&transport.host, ""),
                    "grpc" => option_or(&transport.grpc_authority, ""),
                    _ => String::new(),
                }),
            ),
            (
                "path",
                Value::String(match network {
                    "raw" | "ws" | "httpupgrade" | "xhttp" => option_or(&transport.path, ""),
                    "kcp" => option_or(&transport.kcp_seed, ""),
                    "grpc" => option_or(&transport.grpc_service_name, ""),
                    _ => String::new(),
                }),
            ),
            ("tls", Value::String(item.stream_security.clone())),
            ("sni", Value::String(item.sni.clone())),
            ("alpn", Value::String(item.alpn.clone())),
            ("fp", Value::String(item.fingerprint.clone())),
            (
                "insecure",
                Value::String(if item.allow_insecure == ALLOW_INSECURE_TRUE {
                    "1".to_string()
                } else {
                    "0".to_string()
                }),
            ),
        ]);

        let payload = serde_json::to_string(&vmess).map_err(|error| ShareError::InvalidJson {
            protocol: "vmess",
            reason: error.to_string(),
        })?;
        Ok(format!("vmess://{}", base64_encode(&payload, false)))
    }
}

fn parse_vmess_standard(input: &str) -> Result<ProfileItem, ShareError> {
    let parsed = parse_uri(input, "vmess")?;
    let mut item = profile_from_uri(ConfigType::VMess, &parsed);
    item.password = parsed.user_info;
    item.protocol_extra.vmess_security = Some(DEFAULT_SECURITY.to_string());
    resolve_uri_query(&parsed.query, &mut item);
    ensure_address_port("vmess", &item)?;
    ensure_nonempty("vmess", "password", &item.password)?;
    Ok(item)
}

fn parse_vmess_base64(input: &str) -> Result<ProfileItem, ShareError> {
    let payload = input
        .trim()
        .strip_prefix_ci("vmess://")
        .ok_or(ShareError::UnsupportedProtocol)?;
    let decoded = base64_decode(payload, "vmess")?;
    let value: Value = serde_json::from_str(&decoded).map_err(|error| ShareError::InvalidJson {
        protocol: "vmess",
        reason: error.to_string(),
    })?;
    let object = value.as_object().ok_or_else(|| ShareError::InvalidJson {
        protocol: "vmess",
        reason: "expected object".to_string(),
    })?;

    let mut item = ProfileItem {
        config_type: ConfigType::VMess,
        network: DEFAULT_NETWORK.to_string(),
        remarks: value_string(object, "ps"),
        address: value_string(object, "add"),
        port: value_i32(object, "port").unwrap_or(0),
        password: value_string(object, "id"),
        stream_security: value_string(object, "tls"),
        sni: value_string(object, "sni"),
        alpn: value_string(object, "alpn"),
        fingerprint: value_string(object, "fp"),
        allow_insecure: if value_string(object, "insecure") == "1" {
            ALLOW_INSECURE_TRUE.to_string()
        } else {
            String::new()
        },
        protocol_extra: ProtocolExtraItem {
            alter_id: Some(value_i32(object, "aid").unwrap_or(0).to_string()),
            vmess_security: Some({
                let security = value_string(object, "scy");
                if security.is_empty() {
                    DEFAULT_SECURITY.to_string()
                } else {
                    security
                }
            }),
            ..ProtocolExtraItem::default()
        },
        transport_extra: TransportExtraItem {
            raw_header_type: Some(NONE.to_string()),
            ..TransportExtraItem::default()
        },
        ..ProfileItem::default()
    };

    let network = value_string(object, "net");
    if !network.is_empty() {
        item.network = if network == RAW_NETWORK_ALIAS {
            DEFAULT_NETWORK.to_string()
        } else {
            network
        };
    }
    let vmess_type = value_string(object, "type");
    if !vmess_type.is_empty() {
        match item.network.as_str() {
            "raw" => item.transport_extra.raw_header_type = Some(vmess_type),
            "kcp" => item.transport_extra.kcp_header_type = Some(vmess_type),
            "xhttp" => item.transport_extra.xhttp_mode = Some(vmess_type),
            "grpc" => item.transport_extra.grpc_mode = Some(vmess_type),
            _ => {}
        }
    }
    let host = value_string(object, "host");
    let path = value_string(object, "path");
    match item.network.as_str() {
        "raw" => {
            item.transport_extra.host = nonempty(host);
            item.transport_extra.path = nonempty(path);
        }
        "kcp" => item.transport_extra.kcp_seed = nonempty(path),
        "ws" | "httpupgrade" | "xhttp" => {
            item.transport_extra.host = nonempty(host);
            item.transport_extra.path = nonempty(path);
        }
        "grpc" => {
            item.transport_extra.grpc_authority = nonempty(host);
            item.transport_extra.grpc_service_name = nonempty(path);
        }
        _ => {}
    }

    ensure_address_port("vmess", &item)?;
    ensure_nonempty("vmess", "password", &item.password)?;
    Ok(item)
}
