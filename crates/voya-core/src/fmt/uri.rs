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
        remarks: parsed.remarks.clone(),
        protocol: ProfileProtocol::empty(
            config_type,
            ServerEndpoint {
                address: parsed.address.clone(),
                port: parsed.port,
            },
        ),
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
    if !item.stream_security().is_empty() {
        query.push(("security".to_string(), item.stream_security().to_string()));
    } else if let Some(default_value) = security_default {
        query.push(("security".to_string(), default_value.to_string()));
    }
    if let Some(tls) = &item.tls {
        push_encoded_str(query, "sni", tls.server_name.as_deref().unwrap_or_default());
        push_encoded_str(
            query,
            "pbk",
            tls.reality_public_key.as_deref().unwrap_or_default(),
        );
        push_encoded_str(
            query,
            "sid",
            tls.reality_short_id.as_deref().unwrap_or_default(),
        );
        push_encoded_str(
            query,
            "spx",
            tls.reality_spider_x.as_deref().unwrap_or_default(),
        );
        push_encoded_str(
            query,
            "pqv",
            tls.mldsa65_verify.as_deref().unwrap_or_default(),
        );
        if tls.mode == TlsMode::Tls {
            push_encoded_str(query, "alpn", &tls.alpn.join(","));
        }
        push_encoded_str(query, "ech", &tls.ech_config.join(","));
        push_encoded_str(query, "pcs", &tls.certificate_sha256.join(","));
        if let Some(final_mask) = nonempty_str(tls.final_mask.as_deref()) {
            query.push((
                "fm".to_string(),
                url_encode(&compact_json_or_self(final_mask)),
            ));
        }
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
            let (header, host, path) = match item.transport.as_ref() {
                Some(ProfileTransport::Tcp { header, host, path }) => (header, host, path),
                _ => return,
            };
            query.push((
                "headerType".to_string(),
                nonempty_option(header).unwrap_or(NONE).to_string(),
            ));
            push_encoded_opt(query, "host", host);
            push_encoded_opt(query, "path", path);
        }
        "kcp" => {
            let (header, seed, mtu) = match item.transport.as_ref() {
                Some(ProfileTransport::Kcp { header, seed, mtu }) => (header, seed, *mtu),
                _ => return,
            };
            query.push((
                "headerType".to_string(),
                nonempty_option(header).unwrap_or(NONE).to_string(),
            ));
            push_encoded_opt(query, "seed", seed);
            if let Some(mtu) = mtu.filter(|value| *value > 0) {
                query.push(("mtu".to_string(), mtu.to_string()));
            }
        }
        "ws" | "httpupgrade" => {
            let (host, path) = match item.transport.as_ref() {
                Some(ProfileTransport::Websocket { host, path })
                | Some(ProfileTransport::HttpUpgrade { host, path }) => (host, path),
                _ => return,
            };
            push_encoded_opt(query, "host", host);
            push_encoded_opt(query, "path", path);
        }
        "xhttp" => {
            let (host, path, mode, extra) = match item.transport.as_ref() {
                Some(ProfileTransport::Xhttp {
                    host,
                    path,
                    mode,
                    extra,
                }) => (host, path, mode, extra),
                _ => return,
            };
            push_encoded_opt(query, "host", host);
            push_encoded_opt(query, "path", path);
            if let Some(mode) = nonempty_option(mode) {
                if XHTTP_MODES.contains(&mode) {
                    query.push(("mode".to_string(), url_encode(mode)));
                }
            }
            if let Some(extra) = nonempty_option(extra) {
                query.push((
                    "extra".to_string(),
                    url_encode(&compact_json_or_self(extra)),
                ));
            }
        }
        "grpc" => {
            let (authority, service_name, mode) = match item.transport.as_ref() {
                Some(ProfileTransport::Grpc {
                    authority,
                    service_name,
                    mode,
                }) => (authority, service_name, mode),
                _ => return,
            };
            if nonempty_option(service_name).is_none() {
                return;
            }
            query.push((
                "authority".to_string(),
                url_encode(authority.as_deref().unwrap_or("")),
            ));
            query.push((
                "serviceName".to_string(),
                url_encode(service_name.as_deref().unwrap_or("")),
            ));
            if let Some(mode) = nonempty_option(mode) {
                if mode == GRPC_GUN_MODE || mode == GRPC_MULTI_MODE {
                    query.push(("mode".to_string(), url_encode(mode)));
                }
            }
        }
        _ => {}
    }
}

pub(super) fn to_uri_query_lite(item: &ProfileItem, query: &mut QueryPairs) {
    if let Some(tls) = &item.tls {
        push_encoded_str(query, "sni", tls.server_name.as_deref().unwrap_or_default());
        push_encoded_str(query, "alpn", &tls.alpn.join(","));
    }
}

pub(super) fn resolve_uri_query(query: &Query, item: &mut ProfileItem) {
    let security = query.value_or("security", "");
    let sni = nonempty(query.value_or("sni", ""));
    let alpn = split_csv(&query.decoded_or("alpn", ""));
    let public_key = nonempty(query.decoded_or("pbk", ""));
    let short_id = nonempty(query.decoded_or("sid", ""));
    let spider_x = nonempty(query.decoded_or("spx", ""));
    let mldsa65_verify = nonempty(query.decoded_or("pqv", ""));
    let ech_config = split_csv(&query.decoded_or("ech", ""));
    let certificate_sha256 = split_csv(&query.decoded_or("pcs", ""));
    let finalmask = query.decoded_or("fm", "");
    let final_mask = (!finalmask.is_empty()).then(|| pretty_json_or_self(&finalmask));
    let has_tls_fields = sni.is_some()
        || !alpn.is_empty()
        || public_key.is_some()
        || short_id.is_some()
        || spider_x.is_some()
        || mldsa65_verify.is_some()
        || !ech_config.is_empty()
        || !certificate_sha256.is_empty()
        || final_mask.is_some();
    item.tls = match security.as_str() {
        STREAM_SECURITY_TLS | "reality" => Some(TlsSettings {
            mode: if security == "reality" {
                TlsMode::Reality
            } else {
                TlsMode::Tls
            },
            server_name: sni,
            alpn,
            reality_public_key: public_key,
            reality_short_id: short_id,
            reality_spider_x: spider_x,
            mldsa65_verify,
            certificate_pem: None,
            certificate_sha256,
            ech_config,
            final_mask,
        }),
        _ if has_tls_fields => Some(TlsSettings {
            mode: TlsMode::Tls,
            server_name: sni,
            alpn,
            reality_public_key: public_key,
            reality_short_id: short_id,
            reality_spider_x: spider_x,
            mldsa65_verify,
            certificate_pem: None,
            certificate_sha256,
            ech_config,
            final_mask,
        }),
        _ => None,
    };

    let mut network = query.value_or("type", DEFAULT_NETWORK);
    if network == RAW_NETWORK_ALIAS {
        network = DEFAULT_NETWORK.to_string();
    }
    if !NETWORKS.contains(&network.as_str()) {
        network = DEFAULT_NETWORK.to_string();
    }
    item.transport = Some(match network.as_str() {
        "raw" => ProfileTransport::Tcp {
            header: nonempty(query.value_or("headerType", NONE)),
            host: nonempty(query.decoded_or("host", "")),
            path: nonempty(query.decoded_or("path", "")),
        },
        "kcp" => ProfileTransport::Kcp {
            header: nonempty(query.value_or("headerType", NONE)),
            seed: nonempty(query.decoded_or("seed", "")),
            mtu: parse_positive_i32(&query.value_or("mtu", "")),
        },
        "ws" => ProfileTransport::Websocket {
            host: nonempty(query.decoded_or("host", "")),
            path: nonempty(query.decoded_or("path", "/")),
        },
        "httpupgrade" => ProfileTransport::HttpUpgrade {
            host: nonempty(query.decoded_or("host", "")),
            path: nonempty(query.decoded_or("path", "/")),
        },
        "xhttp" => {
            let xhttp_extra = query.decoded_or("extra", "");
            ProfileTransport::Xhttp {
                host: nonempty(query.decoded_or("host", "")),
                path: nonempty(query.decoded_or("path", "/")),
                mode: nonempty(query.decoded_or("mode", "")),
                extra: (!xhttp_extra.is_empty()).then(|| pretty_json_or_self(&xhttp_extra)),
            }
        }
        "grpc" => ProfileTransport::Grpc {
            authority: nonempty(query.decoded_or("authority", "")),
            service_name: nonempty(query.decoded_or("serviceName", "")),
            mode: nonempty(query.decoded_or("mode", GRPC_GUN_MODE)),
        },
        _ => ProfileTransport::Tcp {
            header: None,
            host: None,
            path: None,
        },
    });
}
