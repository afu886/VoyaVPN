use super::*;

#[derive(Debug, Clone, Copy)]
pub struct Hysteria2Fmt;

impl ShareFmt for Hysteria2Fmt {
    fn config_type(&self) -> ConfigType {
        ConfigType::Hysteria2
    }

    fn parse(&self, input: &str) -> Result<ProfileItem, ShareError> {
        let parsed = parse_uri_with_schemes(input, "hysteria2", &["hysteria2", "hy2"])?;
        let mut item = profile_from_uri(ConfigType::Hysteria2, &parsed);
        item.password = parsed.user_info;
        resolve_uri_query(&parsed.query, &mut item);
        if item.cert_sha.is_empty() {
            item.cert_sha = parsed.query.decoded_or("pinSHA256", "");
        }
        item.protocol_extra.ports = nonempty(parsed.query.decoded_or("mport", ""));
        item.protocol_extra.salamander_pass =
            nonempty(parsed.query.decoded_or("obfs-password", ""));
        ensure_address_port("hysteria2", &item)?;
        ensure_nonempty("hysteria2", "password", &item.password)?;
        Ok(item)
    }

    fn export(&self, item: &ProfileItem) -> Result<String, ShareError> {
        ensure_type("hysteria2", item, ConfigType::Hysteria2)?;
        ensure_address_port("hysteria2", item)?;
        ensure_nonempty("hysteria2", "password", &item.password)?;
        let mut query = Vec::new();
        to_uri_query_lite(item, &mut query);
        if let Some(pass) = nonempty_option(&item.protocol_extra.salamander_pass) {
            query.push(("obfs".to_string(), "salamander".to_string()));
            query.push(("obfs-password".to_string(), url_encode(pass)));
        }
        if let Some(ports) = nonempty_option(&item.protocol_extra.ports) {
            query.push(("mport".to_string(), url_encode(&ports.replace(':', "-"))));
        }
        if !item.cert_sha.is_empty() {
            let sha = item.cert_sha.split(',').next().unwrap_or("");
            query.push(("pinSHA256".to_string(), url_encode(sha)));
        }
        Ok(format!(
            "{}{}",
            HYSTERIA2_DEFAULT_SCHEME,
            to_uri_without_scheme(
                &item.address,
                item.port,
                &item.password,
                &query,
                &item.remarks
            )
        ))
    }
}
