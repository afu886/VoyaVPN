use super::*;

#[derive(Debug, Clone, Copy)]
pub struct TuicFmt;

impl ShareFmt for TuicFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::TUIC
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed = parse_uri(input, "tuic")?;
        let mut item = profile_from_uri(ConfigType::TUIC, &parsed);
        if let Some((username, password)) = parsed.user_info.split_once(':') {
            item.username = username.to_string();
            item.password = password.to_string();
        }
        resolve_uri_query(&parsed.query, &mut item);
        item.protocol_extra.congestion_control =
            nonempty(parsed.query.value_or("congestion_control", ""));
        ensure_address_port("tuic", &item)?;
        ensure_nonempty("tuic", "username", &item.username)?;
        ensure_nonempty("tuic", "password", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("tuic", item, ConfigType::TUIC)?;
        ensure_address_port("tuic", item)?;
        ensure_nonempty("tuic", "username", &item.username)?;
        ensure_nonempty("tuic", "password", &item.password)?;
        let mut query = Vec::new();
        to_uri_query_lite(item, &mut query);
        if let Some(congestion) = nonempty_option(&item.protocol_extra.congestion_control) {
            query.push(("congestion_control".to_string(), congestion.to_string()));
        }
        Ok(to_uri(
            ConfigType::TUIC,
            &item.address,
            item.port,
            &format!("{}:{}", item.username, item.password),
            &query,
            &item.remarks,
        ))
    }
}
