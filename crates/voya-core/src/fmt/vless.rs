use super::*;

#[derive(Debug, Clone, Copy)]
pub struct VlessFmt;

impl ShareFmt for VlessFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::VLESS
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed = parse_uri(input, "vless")?;
        let mut item = profile_from_uri(ConfigType::VLESS, &parsed);
        item.password = parsed.user_info;
        item.protocol_extra.vless_encryption = Some(parsed.query.value_or("encryption", NONE));
        item.protocol_extra.flow = nonempty(parsed.query.value_or("flow", ""));
        resolve_uri_query(&parsed.query, &mut item);
        ensure_address_port("vless", &item)?;
        ensure_nonempty("vless", "password", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("vless", item, ConfigType::VLESS)?;
        ensure_address_port("vless", item)?;
        ensure_nonempty("vless", "password", &item.password)?;
        let mut query = Vec::new();
        query.push((
            "encryption".to_string(),
            nonempty_option(&item.protocol_extra.vless_encryption)
                .unwrap_or(NONE)
                .to_string(),
        ));
        if let Some(flow) = nonempty_option(&item.protocol_extra.flow) {
            query.push(("flow".to_string(), flow.to_string()));
        }
        to_uri_query(item, Some(NONE), &mut query);
        Ok(to_uri(
            ConfigType::VLESS,
            &item.address,
            item.port,
            &item.password,
            &query,
            &item.remarks,
        ))
    }
}
