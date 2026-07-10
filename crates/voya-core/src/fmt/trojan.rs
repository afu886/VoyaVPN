use super::*;

#[derive(Debug, Clone, Copy)]
pub struct TrojanFmt;

impl ShareFmt for TrojanFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::Trojan
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed = parse_uri(input, "trojan")?;
        let mut item = profile_from_uri(ConfigType::Trojan, &parsed);
        item.password = parsed.user_info;
        item.protocol_extra.flow = nonempty(parsed.query.value_or("flow", ""));
        resolve_uri_query(&parsed.query, &mut item);
        ensure_address_port("trojan", &item)?;
        ensure_nonempty("trojan", "password", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("trojan", item, ConfigType::Trojan)?;
        ensure_address_port("trojan", item)?;
        ensure_nonempty("trojan", "password", &item.password)?;
        let mut query = Vec::new();
        if let Some(flow) = nonempty_option(&item.protocol_extra.flow) {
            query.push(("flow".to_string(), flow.to_string()));
        }
        to_uri_query(item, None, &mut query);
        Ok(to_uri(
            ConfigType::Trojan,
            &item.address,
            item.port,
            &item.password,
            &query,
            &item.remarks,
        ))
    }
}
