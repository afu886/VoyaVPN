use super::*;

#[derive(Debug, Clone, Copy)]
pub struct SocksFmt;

impl ShareFmt for SocksFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::SOCKS
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let item = parse_socks_new(input)?;
        ensure_address_port("socks", &item)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("socks", item, ConfigType::SOCKS)?;
        ensure_address_port("socks", item)?;
        let user_info = base64_encode(&format!("{}:{}", item.username(), item.password()), true);
        Ok(to_uri(
            ConfigType::SOCKS,
            item.address(),
            item.port(),
            &user_info,
            &[],
            &item.remarks,
        ))
    }
}

fn parse_socks_new(input: &str) -> Result<ProfileItem, ShareError> {
    let parsed = parse_uri_with_schemes(input, "socks", &["socks", "socks5", "socks4"])?;
    let mut item = profile_from_uri(ConfigType::SOCKS, &parsed);
    let mut parsed_username = String::new();
    let mut parsed_password = String::new();
    if !parsed.user_info.is_empty() {
        if let Some((username, password)) = parsed.user_info.split_once(':') {
            parsed_username = username.to_string();
            parsed_password = password.to_string();
        } else {
            let decoded = base64_decode(&parsed.user_info, "socks")?;
            if let Some((username, password)) = decoded.split_once(':') {
                parsed_username = username.to_string();
                parsed_password = password.to_string();
            }
        }
    }
    if let ProfileProtocol::Socks {
        username, password, ..
    } = &mut item.protocol
    {
        *username = parsed_username;
        *password = parsed_password;
    }
    Ok(item)
}
