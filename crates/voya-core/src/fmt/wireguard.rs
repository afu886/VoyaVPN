use super::*;

#[derive(Debug, Clone, Copy)]
pub struct WireguardFmt;

impl ShareFmt for WireguardFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::WireGuard
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed = parse_uri(input, "wireguard")?;
        let mut item = profile_from_uri(ConfigType::WireGuard, &parsed);
        item.password = parsed.user_info;
        item.protocol_extra.wg_public_key = nonempty(parsed.query.decoded_or("publickey", ""));
        item.protocol_extra.wg_preshared_key =
            nonempty(parsed.query.decoded_or("presharedkey", ""));
        item.protocol_extra.wg_reserved = nonempty(parsed.query.decoded_or("reserved", ""));
        item.protocol_extra.wg_interface_address = nonempty(parsed.query.decoded_or("address", ""));
        let allowed_ips = parsed.query.decoded_or("allowedips", "");
        item.protocol_extra.wg_allowed_ips = nonempty(if allowed_ips.is_empty() {
            parsed.query.decoded_or("allowed_ips", "")
        } else {
            allowed_ips
        });
        item.protocol_extra.wg_mtu = parse_positive_i32(&parsed.query.decoded_or("mtu", ""));
        ensure_address_port("wireguard", &item)?;
        ensure_nonempty("wireguard", "private key", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("wireguard", item, ConfigType::WireGuard)?;
        ensure_address_port("wireguard", item)?;
        ensure_nonempty("wireguard", "private key", &item.password)?;
        let mut query = Vec::new();
        push_encoded_opt(&mut query, "publickey", &item.protocol_extra.wg_public_key);
        push_encoded_opt(
            &mut query,
            "presharedkey",
            &item.protocol_extra.wg_preshared_key,
        );
        push_encoded_opt(&mut query, "reserved", &item.protocol_extra.wg_reserved);
        push_encoded_opt(
            &mut query,
            "address",
            &item.protocol_extra.wg_interface_address,
        );
        push_encoded_opt(
            &mut query,
            "allowedips",
            &item.protocol_extra.wg_allowed_ips,
        );
        if let Some(mtu) = item.protocol_extra.wg_mtu.filter(|value| *value > 0) {
            query.push(("mtu".to_string(), mtu.to_string()));
        }
        Ok(to_uri(
            ConfigType::WireGuard,
            &item.address,
            item.port,
            &item.password,
            &query,
            &item.remarks,
        ))
    }
}

pub fn parse_wireguard_config(input: &str) -> Result<Vec<ProfileItem>, ShareError> {
    let mut interface = BTreeMap::<String, String>::new();
    let mut peers = Vec::<BTreeMap<String, String>>::new();
    let mut in_peer = false;

    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.eq_ignore_ascii_case("[Interface]") {
            in_peer = false;
            continue;
        }
        if trimmed.eq_ignore_ascii_case("[Peer]") {
            peers.push(BTreeMap::new());
            in_peer = true;
            continue;
        }
        if trimmed.starts_with('[') || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let mut value = raw_value.trim().to_string();
        if let Some(position) = value.find(['#', ';']) {
            value.truncate(position);
            value = value.trim_end().to_string();
        }
        if in_peer {
            if let Some(peer) = peers.last_mut() {
                peer.insert(key.trim().to_ascii_lowercase(), value);
            }
        } else {
            interface.insert(key.trim().to_ascii_lowercase(), value);
        }
    }

    let private_key = nonempty_str(interface.get("privatekey").map(String::as_str)).ok_or(
        ShareError::MissingField {
            protocol: "wireguard-config",
            field: "PrivateKey",
        },
    )?;
    let wg_mtu = interface
        .get("mtu")
        .and_then(|value| value.parse::<i32>().ok())
        .filter(|value| *value > 0);
    let wg_interface_address = interface.get("address").cloned().unwrap_or_default();

    let mut result = Vec::new();
    for peer in peers {
        let Some(endpoint) = nonempty_str(peer.get("endpoint").map(String::as_str)) else {
            continue;
        };
        let Some((address, port)) = parse_wireguard_endpoint(endpoint) else {
            continue;
        };
        let item = ProfileItem {
            remarks: format!("WireGuard Peer {}", result.len() + 1),
            config_type: ConfigType::WireGuard,
            address,
            port,
            password: private_key.to_string(),
            protocol_extra: ProtocolExtraItem {
                wg_public_key: peer
                    .get("publickey")
                    .and_then(|value| nonempty(value.clone())),
                wg_preshared_key: peer
                    .get("presharedkey")
                    .and_then(|value| nonempty(value.clone())),
                wg_interface_address: nonempty(wg_interface_address.clone()),
                wg_allowed_ips: peer
                    .get("allowedips")
                    .and_then(|value| nonempty(value.clone())),
                wg_reserved: peer
                    .get("reserved")
                    .and_then(|value| nonempty(value.clone())),
                wg_mtu,
                ..ProtocolExtraItem::default()
            },
            ..ProfileItem::default()
        };
        result.push(item);
    }

    if result.is_empty() {
        Err(ShareError::InvalidFullConfig)
    } else {
        Ok(result)
    }
}
