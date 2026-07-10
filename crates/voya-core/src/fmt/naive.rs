use super::*;

#[derive(Debug, Clone, Copy)]
pub struct NaiveFmt;

impl ShareFmt for NaiveFmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::Naive
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed =
            parse_uri_with_schemes(input, "naive", &["naive", "naive+https", "naive+quic"])?;
        let mut item = profile_from_uri(ConfigType::Naive, &parsed);
        if parsed.scheme.contains("quic") {
            item.protocol_extra.naive_quic = Some(true);
        }
        if let Some((username, password)) = parsed.user_info.split_once(':') {
            item.username = username.to_string();
            item.password = password.to_string();
        } else {
            item.password = parsed.user_info;
        }
        resolve_uri_query(&parsed.query, &mut item);
        if let Some(value) = parse_positive_i32(&parsed.query.value_or("insecure-concurrency", ""))
        {
            item.protocol_extra.insecure_concurrency = Some(value);
        }
        ensure_address_port("naive", &item)?;
        ensure_nonempty("naive", "password", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("naive", item, ConfigType::Naive)?;
        ensure_address_port("naive", item)?;
        ensure_nonempty("naive", "password", &item.password)?;
        let mut query = Vec::new();
        to_uri_query(item, Some(NONE), &mut query);
        if let Some(concurrency) = item
            .protocol_extra
            .insecure_concurrency
            .filter(|value| *value > 0)
        {
            query.push(("insecure-concurrency".to_string(), concurrency.to_string()));
        }
        let user_info = if item.username.is_empty() {
            url_encode(&item.password)
        } else {
            format!(
                "{}:{}",
                url_encode(&item.username),
                url_encode(&item.password)
            )
        };
        let scheme = if item.protocol_extra.naive_quic == Some(true) {
            NAIVE_QUIC_SCHEME
        } else {
            NAIVE_HTTPS_SCHEME
        };
        Ok(format!(
            "{scheme}{}",
            to_uri_without_scheme_preencoded_userinfo(
                &item.address,
                item.port,
                &user_info,
                &query,
                &item.remarks
            )
        ))
    }
}
