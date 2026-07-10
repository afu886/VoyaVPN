use super::*;

#[derive(Debug, Clone, Copy)]
pub struct ShadowsocksFmt;

impl ShareFmt for ShadowsocksFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::Shadowsocks
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let mut item =
            parse_shadowsocks_legacy(input).or_else(|_| parse_shadowsocks_sip002(input))?;
        ensure_address_port("ss", &item)?;
        if nonempty_option(&item.protocol_extra.ss_method).is_none() {
            return Err(ShareError::MissingField {
                protocol: "ss",
                field: "method",
            });
        }
        ensure_nonempty("ss", "password", &item.password)?;
        item.config_type = ConfigType::Shadowsocks;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("ss", item, ConfigType::Shadowsocks)?;
        ensure_address_port("ss", item)?;
        let method =
            nonempty_option(&item.protocol_extra.ss_method).ok_or(ShareError::MissingField {
                protocol: "ss",
                field: "method",
            })?;
        ensure_nonempty("ss", "password", &item.password)?;

        let user_info = base64_encode(&format!("{method}:{}", item.password), true);
        let mut query = Vec::new();
        if let Some(plugin) = shadowsocks_plugin(item) {
            query.push(("plugin".to_string(), url_encode(&plugin)));
        }

        Ok(to_uri(
            ConfigType::Shadowsocks,
            &item.address,
            item.port,
            &user_info,
            &query,
            &item.remarks,
        ))
    }
}

pub fn parse_ss_sip008(input: &str) -> Result<Vec<ProfileItem>, ShareError> {
    let value: Value = serde_json::from_str(input).map_err(|error| ShareError::InvalidJson {
        protocol: "ss-sip008",
        reason: error.to_string(),
    })?;
    let servers = match value {
        Value::Array(items) => items,
        Value::Object(mut object) => match object.remove("servers") {
            Some(Value::Array(items)) => items,
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };
    if servers.is_empty() {
        return Err(ShareError::InvalidJson {
            protocol: "ss-sip008",
            reason: "missing servers".to_string(),
        });
    }

    let mut result = Vec::new();
    for server in servers {
        let object = server.as_object().ok_or_else(|| ShareError::InvalidJson {
            protocol: "ss-sip008",
            reason: "server entry must be an object".to_string(),
        })?;
        let mut item = ProfileItem {
            config_type: ConfigType::Shadowsocks,
            remarks: string_field(object, "remarks"),
            password: string_field(object, "password"),
            address: string_field(object, "server"),
            port: string_field(object, "server_port").parse().unwrap_or(0),
            ..ProfileItem::default()
        };
        item.protocol_extra.ss_method = nonempty(string_field(object, "method"));
        ensure_address_port("ss-sip008", &item)?;
        result.push(item);
    }
    Ok(result)
}

fn parse_shadowsocks_legacy(input: &str) -> Result<ProfileItem, ShareError> {
    let mut rest = input
        .trim()
        .strip_prefix_ci("ss://")
        .ok_or(ShareError::UnsupportedProtocol)?
        .to_string();
    let mut remarks = String::new();
    if let Some((before, after)) = rest.split_once('#') {
        remarks = url_decode(after);
        rest = before.to_string();
    }
    if rest.contains('@') {
        return Err(ShareError::InvalidUri {
            protocol: "ss",
            reason: "not a legacy shadowsocks link".to_string(),
        });
    }
    let decoded = base64_decode(rest.trim_end_matches('/'), "ss")?;
    let Some((method_password, address_port)) = decoded.split_once('@') else {
        return Err(ShareError::InvalidUri {
            protocol: "ss",
            reason: "missing @".to_string(),
        });
    };
    let Some((method, password)) = method_password.split_once(':') else {
        return Err(ShareError::InvalidUri {
            protocol: "ss",
            reason: "missing method/password".to_string(),
        });
    };
    let Some((address, port)) = rsplit_host_port(address_port) else {
        return Err(ShareError::InvalidUri {
            protocol: "ss",
            reason: "missing host/port".to_string(),
        });
    };

    Ok(ProfileItem {
        config_type: ConfigType::Shadowsocks,
        remarks,
        address,
        port: parse_port("ss", port)?,
        password: password.to_string(),
        protocol_extra: ProtocolExtraItem {
            ss_method: Some(method.to_string()),
            ..ProtocolExtraItem::default()
        },
        ..ProfileItem::default()
    })
}

fn parse_shadowsocks_sip002(input: &str) -> Result<ProfileItem, ShareError> {
    let parsed = parse_uri(input, "ss")?;
    let mut item = profile_from_uri(ConfigType::Shadowsocks, &parsed);
    if parsed.user_info.contains(':') {
        let Some((method, password)) = parsed.user_info.split_once(':') else {
            return Err(ShareError::InvalidUri {
                protocol: "ss",
                reason: "invalid user info".to_string(),
            });
        };
        item.protocol_extra.ss_method = Some(method.to_string());
        item.password = url_decode(password);
    } else {
        let decoded = base64_decode(&parsed.user_info, "ss")?;
        let Some((method, password)) = decoded.split_once(':') else {
            return Err(ShareError::InvalidUri {
                protocol: "ss",
                reason: "invalid encoded user info".to_string(),
            });
        };
        item.protocol_extra.ss_method = Some(method.to_string());
        item.password = password.to_string();
    }

    if let Some(plugin) = parsed.query.value("plugin") {
        parse_shadowsocks_plugin(plugin, &mut item)?;
    }

    Ok(item)
}

fn parse_shadowsocks_plugin(plugin: &str, item: &mut ProfileItem) -> Result<(), ShareError> {
    let plugin_parts = plugin
        .split(';')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if plugin_parts.is_empty() {
        return Err(ShareError::InvalidUri {
            protocol: "ss",
            reason: "empty plugin".to_string(),
        });
    }
    let plugin_name = if plugin_parts[0] == "simple-obfs" {
        "obfs-local"
    } else {
        plugin_parts[0]
    };

    if plugin_name == "obfs-local" {
        let obfs_mode = plugin_parts.iter().find(|part| part.starts_with("obfs="));
        let obfs_host = plugin_parts
            .iter()
            .find_map(|part| part.strip_prefix("obfs-host="));
        if obfs_mode.is_some_and(|part| part.contains("obfs=http"))
            && obfs_host.is_some_and(|host| !host.is_empty())
        {
            item.network = DEFAULT_NETWORK.to_string();
            item.transport_extra.raw_header_type = Some(RAW_HEADER_HTTP.to_string());
            item.transport_extra.host = obfs_host.map(str::to_string);
        }
    } else if plugin_name == "v2ray-plugin" {
        let mode = plugin_parts
            .iter()
            .find_map(|part| part.strip_prefix("mode="))
            .unwrap_or("websocket");
        if mode == "websocket" {
            item.network = "ws".to_string();
            if let Some(host) = plugin_parts
                .iter()
                .find_map(|part| part.strip_prefix("host="))
            {
                item.transport_extra.host = Some(host.to_string());
                item.sni = host.to_string();
            }
            if let Some(path) = plugin_parts
                .iter()
                .find_map(|part| part.strip_prefix("path="))
            {
                item.transport_extra.path = Some(
                    path.replace("\\=", "=")
                        .replace("\\,", ",")
                        .replace("\\\\", "\\"),
                );
            }
        }
        if plugin_parts.contains(&"tls") {
            item.stream_security = STREAM_SECURITY_TLS.to_string();
            if let Some(cert) = plugin_parts
                .iter()
                .find_map(|part| part.strip_prefix("certRaw="))
            {
                let cert = cert.replace("\\=", "=");
                item.cert =
                    format!("-----BEGIN CERTIFICATE-----\n{cert}\n-----END CERTIFICATE-----");
            }
        }
        if let Some(mux) = plugin_parts
            .iter()
            .find_map(|part| part.strip_prefix("mux="))
            .and_then(|value| value.parse::<i32>().ok())
        {
            if mux > 0 {
                return Err(ShareError::InvalidUri {
                    protocol: "ss",
                    reason: "v2ray-plugin mux must be 0".to_string(),
                });
            }
        }
    }
    Ok(())
}

fn shadowsocks_plugin(item: &ProfileItem) -> Option<String> {
    let transport = &item.transport_extra;
    let mut plugin = String::new();
    let mut plugin_args = String::new();

    if item.network == DEFAULT_NETWORK
        && transport.raw_header_type.as_deref() == Some(RAW_HEADER_HTTP)
    {
        plugin = "obfs-local".to_string();
        plugin_args = format!(
            "obfs=http;obfs-host={};",
            transport.host.as_deref().unwrap_or("")
        );
    } else {
        if item.network == "ws" {
            plugin_args.push_str("mode=websocket;");
            plugin_args.push_str(&format!(
                "host={};",
                transport.host.as_deref().unwrap_or("")
            ));
            let path = transport
                .path
                .as_deref()
                .unwrap_or("")
                .replace('\\', "\\\\")
                .replace('=', "\\=")
                .replace(',', "\\,");
            plugin_args.push_str(&format!("path={path};"));
        }
        if item.stream_security == STREAM_SECURITY_TLS {
            plugin_args.push_str("tls;");
            if let Some(cert_raw) = extract_first_pem_body(&item.cert) {
                plugin_args.push_str(&format!("certRaw={};", cert_raw.replace('=', "\\=")));
            }
        }
        if !plugin_args.is_empty() {
            plugin = "v2ray-plugin".to_string();
            plugin_args.push_str("mux=0;");
        }
    }

    if plugin.is_empty() {
        None
    } else {
        let mut result = format!("{plugin};{plugin_args}");
        if result.ends_with(';') {
            result.pop();
        }
        Some(result)
    }
}
