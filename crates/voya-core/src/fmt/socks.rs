use super::*;

#[derive(Debug, Clone, Copy)]
pub struct SocksFmt;

impl ShareFmt for SocksFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::SOCKS
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let mut item = parse_socks_new(input).or_else(|_| parse_socks_legacy(input))?;
        ensure_address_port("socks", &item)?;
        item.config_type = ConfigType::SOCKS;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("socks", item, ConfigType::SOCKS)?;
        ensure_address_port("socks", item)?;
        let user_info = base64_encode(&format!("{}:{}", item.username, item.password), true);
        Ok(to_uri(
            ConfigType::SOCKS,
            &item.address,
            item.port,
            &user_info,
            &[],
            &item.remarks,
        ))
    }
}

fn parse_socks_new(input: &str) -> Result<ProfileItem, ShareError> {
    let parsed = parse_uri_with_schemes(input, "socks", &["socks", "socks5", "socks4"])?;
    let mut item = profile_from_uri(ConfigType::SOCKS, &parsed);
    if !parsed.user_info.is_empty() {
        if let Some((username, password)) = parsed.user_info.split_once(':') {
            item.username = username.to_string();
            item.password = password.to_string();
        } else {
            let decoded = base64_decode(&parsed.user_info, "socks")?;
            if let Some((username, password)) = decoded.split_once(':') {
                item.username = username.to_string();
                item.password = password.to_string();
            }
        }
    }
    Ok(item)
}

fn parse_socks_legacy(input: &str) -> Result<ProfileItem, ShareError> {
    let mut rest = input
        .trim()
        .strip_prefix_ci("socks://")
        .ok_or(ShareError::UnsupportedProtocol)?
        .to_string();
    let mut remarks = String::new();
    if let Some((before, after)) = rest.split_once('#') {
        remarks = url_decode(after);
        rest = before.to_string();
    }
    if !rest.contains('@') {
        rest = base64_decode(&rest, "socks")?;
    }
    let Some((user_pass, address_port)) = rest.split_once('@') else {
        return Err(ShareError::InvalidUri {
            protocol: "socks",
            reason: "missing @".to_string(),
        });
    };
    let Some((username, password)) = user_pass.split_once(':') else {
        return Err(ShareError::InvalidUri {
            protocol: "socks",
            reason: "missing username/password".to_string(),
        });
    };
    let Some((address, port)) = rsplit_host_port(address_port) else {
        return Err(ShareError::InvalidUri {
            protocol: "socks",
            reason: "missing host/port".to_string(),
        });
    };
    Ok(ProfileItem {
        config_type: ConfigType::SOCKS,
        remarks,
        address,
        port: parse_port("socks", port)?,
        username: username.to_string(),
        password: password.to_string(),
        ..ProfileItem::default()
    })
}
