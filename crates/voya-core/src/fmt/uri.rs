use super::*;

#[derive(Debug, Clone)]
pub(super) struct ParsedUri {
    pub(super) scheme: String,
    pub(super) address: String,
    pub(super) port: i32,
    pub(super) remarks: String,
    pub(super) user_info: String,
    pub(super) query: Query,
}

#[derive(Debug, Clone, Default)]
pub(super) struct Query(Vec<(String, String)>);

impl Query {
    pub(super) fn parse(raw_query: Option<&str>) -> Self {
        let Some(raw_query) = raw_query else {
            return Self::default();
        };
        let mut query = Self::default();
        for part in raw_query.split('&').filter(|part| !part.is_empty()) {
            let Some((key, value)) = part.split_once('=') else {
                continue;
            };
            let key = url_decode(key);
            if query.contains_key(&key) {
                continue;
            }
            query.0.push((key, url_decode(value)));
        }
        query
    }

    pub(super) fn contains_key(&self, wanted: &str) -> bool {
        self.0
            .iter()
            .any(|(key, _)| key.eq_ignore_ascii_case(wanted))
    }

    pub(super) fn value(&self, wanted: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(wanted))
            .map(|(_, value)| value.as_str())
    }

    pub(super) fn value_or(&self, wanted: &str, default_value: &str) -> String {
        self.value(wanted).unwrap_or(default_value).to_string()
    }

    pub(super) fn decoded_or(&self, wanted: &str, default_value: &str) -> String {
        url_decode(self.value(wanted).unwrap_or(default_value))
    }
}

pub(super) type QueryPairs = Vec<(String, String)>;

pub(super) fn parse_uri(input: &str, protocol: &'static str) -> Result<ParsedUri, ShareError> {
    parse_uri_with_schemes(input, protocol, &[protocol])
}

pub(super) fn parse_uri_with_schemes(
    input: &str,
    protocol: &'static str,
    schemes: &[&str],
) -> Result<ParsedUri, ShareError> {
    let url = Url::parse(input).map_err(|error| ShareError::InvalidUri {
        protocol,
        reason: error.to_string(),
    })?;
    if !schemes
        .iter()
        .any(|scheme| url.scheme().eq_ignore_ascii_case(scheme))
    {
        return Err(ShareError::UnsupportedProtocol);
    }
    let address = url
        .host_str()
        .unwrap_or("")
        .trim_matches(['[', ']'])
        .to_string();
    if address.is_empty() {
        return Err(ShareError::MissingField {
            protocol,
            field: "host",
        });
    }
    let port = url.port().ok_or(ShareError::MissingField {
        protocol,
        field: "port",
    })?;
    if port == 0 {
        return Err(ShareError::InvalidPort {
            protocol,
            port: port.to_string(),
        });
    }
    let username = url.username();
    let user_info = if let Some(password) = url.password() {
        format!("{}:{}", url_decode(username), url_decode(password))
    } else {
        url_decode(username)
    };

    Ok(ParsedUri {
        scheme: url.scheme().to_string(),
        address,
        port: i32::from(port),
        remarks: url.fragment().map(url_decode).unwrap_or_default(),
        user_info,
        query: Query::parse(url.query()),
    })
}

pub(super) fn profile_from_uri(config_type: ConfigType, parsed: &ParsedUri) -> ProfileItem {
    ProfileItem {
        config_type,
        address: parsed.address.clone(),
        port: parsed.port,
        remarks: parsed.remarks.clone(),
        ..ProfileItem::default()
    }
}

pub(super) fn to_uri(
    config_type: ConfigType,
    address: &str,
    port: i32,
    user_info: &str,
    query: &[(String, String)],
    remark: &str,
) -> String {
    format!(
        "{}{}",
        protocol_share(config_type),
        to_uri_without_scheme(address, port, user_info, query, remark)
    )
}

pub(super) fn to_uri_without_scheme(
    address: &str,
    port: i32,
    user_info: &str,
    query: &[(String, String)],
    remark: &str,
) -> String {
    to_uri_without_scheme_preencoded_userinfo(address, port, &url_encode(user_info), query, remark)
}

pub(super) fn to_uri_without_scheme_preencoded_userinfo(
    address: &str,
    port: i32,
    user_info: &str,
    query: &[(String, String)],
    remark: &str,
) -> String {
    let query = format_query(query);
    let remark = if remark.is_empty() {
        String::new()
    } else {
        format!("#{}", url_encode(remark))
    };
    format!("{user_info}@{}:{port}{query}{remark}", ipv6_host(address))
}

pub(super) fn to_uri_query(
    item: &ProfileItem,
    security_default: Option<&str>,
    query: &mut QueryPairs,
) {
    let transport = &item.transport_extra;
    if !item.stream_security.is_empty() {
        query.push(("security".to_string(), item.stream_security.clone()));
    } else if let Some(default_value) = security_default {
        query.push(("security".to_string(), default_value.to_string()));
    }
    push_encoded_str(query, "sni", &item.sni);
    push_encoded_str(query, "pbk", &item.public_key);
    push_encoded_str(query, "sid", &item.short_id);
    push_encoded_str(query, "spx", &item.spider_x);
    push_encoded_str(query, "pqv", &item.mldsa65_verify);

    if item.stream_security == STREAM_SECURITY_TLS {
        push_encoded_str(query, "alpn", &item.alpn);
    }
    push_encoded_str(query, "ech", &item.ech_config_list);
    push_encoded_str(query, "pcs", &item.cert_sha);
    if !item.finalmask.is_empty() {
        query.push((
            "fm".to_string(),
            url_encode(&compact_json_or_self(&item.finalmask)),
        ));
    }

    let network = item_network(item);
    query.push((
        "type".to_string(),
        if network == DEFAULT_NETWORK {
            RAW_NETWORK_ALIAS.to_string()
        } else {
            network.to_string()
        },
    ));

    match network {
        "raw" => {
            query.push((
                "headerType".to_string(),
                nonempty_option(&transport.raw_header_type)
                    .unwrap_or(NONE)
                    .to_string(),
            ));
            push_encoded_opt(query, "host", &transport.host);
            push_encoded_opt(query, "path", &transport.path);
        }
        "kcp" => {
            query.push((
                "headerType".to_string(),
                nonempty_option(&transport.kcp_header_type)
                    .unwrap_or(NONE)
                    .to_string(),
            ));
            push_encoded_opt(query, "seed", &transport.kcp_seed);
            if let Some(mtu) = transport.kcp_mtu.filter(|value| *value > 0) {
                query.push(("mtu".to_string(), mtu.to_string()));
            }
        }
        "ws" | "httpupgrade" => {
            push_encoded_opt(query, "host", &transport.host);
            push_encoded_opt(query, "path", &transport.path);
        }
        "xhttp" => {
            push_encoded_opt(query, "host", &transport.host);
            push_encoded_opt(query, "path", &transport.path);
            if let Some(mode) = nonempty_option(&transport.xhttp_mode) {
                if XHTTP_MODES.contains(&mode) {
                    query.push(("mode".to_string(), url_encode(mode)));
                }
            }
            if let Some(extra) = nonempty_option(&transport.xhttp_extra) {
                query.push((
                    "extra".to_string(),
                    url_encode(&compact_json_or_self(extra)),
                ));
            }
        }
        "grpc" if nonempty_option(&transport.grpc_service_name).is_some() => {
            query.push((
                "authority".to_string(),
                url_encode(transport.grpc_authority.as_deref().unwrap_or("")),
            ));
            query.push((
                "serviceName".to_string(),
                url_encode(transport.grpc_service_name.as_deref().unwrap_or("")),
            ));
            if let Some(mode) = nonempty_option(&transport.grpc_mode) {
                if mode == GRPC_GUN_MODE || mode == GRPC_MULTI_MODE {
                    query.push(("mode".to_string(), url_encode(mode)));
                }
            }
        }
        _ => {}
    }
}

pub(super) fn to_uri_query_lite(item: &ProfileItem, query: &mut QueryPairs) {
    push_encoded_str(query, "sni", &item.sni);
    push_encoded_str(query, "alpn", &item.alpn);
}

pub(super) fn resolve_uri_query(query: &Query, item: &mut ProfileItem) {
    item.stream_security = query.value_or("security", "");
    item.sni = query.value_or("sni", "");
    item.alpn = query.decoded_or("alpn", "");
    item.public_key = query.decoded_or("pbk", "");
    item.short_id = query.decoded_or("sid", "");
    item.spider_x = query.decoded_or("spx", "");
    item.mldsa65_verify = query.decoded_or("pqv", "");
    item.ech_config_list = query.decoded_or("ech", "");
    item.cert_sha = query.decoded_or("pcs", "");

    let finalmask = query.decoded_or("fm", "");
    item.finalmask = if finalmask.is_empty() {
        String::new()
    } else {
        pretty_json_or_self(&finalmask)
    };

    let mut network = query.value_or("type", DEFAULT_NETWORK);
    if network == RAW_NETWORK_ALIAS {
        network = DEFAULT_NETWORK.to_string();
    }
    if !NETWORKS.contains(&network.as_str()) {
        network = DEFAULT_NETWORK.to_string();
    }
    item.network = network;

    match item.network.as_str() {
        "raw" => {
            item.transport_extra.raw_header_type = Some(query.value_or("headerType", NONE));
            item.transport_extra.host = Some(query.decoded_or("host", ""));
            item.transport_extra.path = Some(query.decoded_or("path", ""));
        }
        "kcp" => {
            item.transport_extra.kcp_header_type = Some(query.value_or("headerType", NONE));
            item.transport_extra.kcp_seed = Some(query.decoded_or("seed", ""));
            item.transport_extra.kcp_mtu = parse_positive_i32(&query.value_or("mtu", ""));
        }
        "ws" | "httpupgrade" => {
            item.transport_extra.host = Some(query.decoded_or("host", ""));
            item.transport_extra.path = Some(query.decoded_or("path", "/"));
        }
        "xhttp" => {
            let xhttp_extra = query.decoded_or("extra", "");
            item.transport_extra.host = Some(query.decoded_or("host", ""));
            item.transport_extra.path = Some(query.decoded_or("path", "/"));
            item.transport_extra.xhttp_mode = Some(query.decoded_or("mode", ""));
            item.transport_extra.xhttp_extra = Some(if xhttp_extra.is_empty() {
                String::new()
            } else {
                pretty_json_or_self(&xhttp_extra)
            });
        }
        "grpc" => {
            item.transport_extra.grpc_authority = Some(query.decoded_or("authority", ""));
            item.transport_extra.grpc_service_name = Some(query.decoded_or("serviceName", ""));
            item.transport_extra.grpc_mode = Some(query.decoded_or("mode", GRPC_GUN_MODE));
        }
        _ => {
            item.network = DEFAULT_NETWORK.to_string();
        }
    }
}
