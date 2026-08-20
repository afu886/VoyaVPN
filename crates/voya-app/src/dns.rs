use thiserror::Error;
pub use voya_contracts::DnsValidationIssue;
use voya_core::{SimpleDnsItem, DEFAULT_BOOTSTRAP_DNS, DEFAULT_DIRECT_DNS, DEFAULT_REMOTE_DNS};
use voya_db::{Database, DatabaseSession, UnitOfWork};

pub type Result<T> = std::result::Result<T, DnsManagerError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DnsSettings {
    pub simple_dns_item: SimpleDnsItem,
}

#[derive(Debug, Error)]
pub enum DnsManagerError {
    #[error("DNS settings validation failed")]
    Validation(Vec<DnsValidationIssue>),
}

#[derive(Debug, Clone, Copy)]
pub struct DnsManager<'db> {
    _database: DatabaseSession<'db>,
}

impl<'db> DnsManager<'db> {
    #[must_use]
    pub fn new(database: &'db Database) -> Self {
        Self {
            _database: DatabaseSession::from_database(database),
        }
    }

    #[must_use]
    pub fn new_in(unit_of_work: &'db UnitOfWork) -> Self {
        Self {
            _database: DatabaseSession::from_unit_of_work(unit_of_work),
        }
    }

    pub async fn load_settings(&self, simple_dns_item: &SimpleDnsItem) -> Result<DnsSettings> {
        Ok(DnsSettings {
            simple_dns_item: normalize_simple_dns(simple_dns_item.clone()),
        })
    }

    pub async fn save_settings(&self, mut settings: DnsSettings) -> Result<DnsSettings> {
        settings.simple_dns_item = normalize_simple_dns(settings.simple_dns_item);
        validate_settings(&settings)?;
        Ok(settings)
    }
}

#[must_use]
pub fn normalize_simple_dns(mut item: SimpleDnsItem) -> SimpleDnsItem {
    let defaults = SimpleDnsItem::default();
    item.use_system_hosts = item.use_system_hosts.or(defaults.use_system_hosts);
    item.add_common_hosts = item.add_common_hosts.or(defaults.add_common_hosts);
    item.fake_ip = item.fake_ip.or(defaults.fake_ip);
    item.global_fake_ip = item.global_fake_ip.or(defaults.global_fake_ip);
    item.block_binding_query = item.block_binding_query.or(defaults.block_binding_query);
    item.direct_dns =
        clean_optional_string(item.direct_dns).or_else(|| Some(DEFAULT_DIRECT_DNS.to_string()));
    item.remote_dns =
        clean_optional_string(item.remote_dns).or_else(|| Some(DEFAULT_REMOTE_DNS.to_string()));
    item.bootstrap_dns = clean_optional_string(item.bootstrap_dns)
        .or_else(|| Some(DEFAULT_BOOTSTRAP_DNS.to_string()));
    item.strategy4_freedom = clean_optional_string(item.strategy4_freedom);
    item.strategy4_proxy = clean_optional_string(item.strategy4_proxy);
    item.serve_stale = item.serve_stale.or(defaults.serve_stale);
    item.parallel_query = item.parallel_query.or(defaults.parallel_query);
    item.hosts = clean_optional_string(item.hosts);
    item.direct_expected_ips = clean_optional_string(item.direct_expected_ips);
    item
}

pub fn validate_settings(settings: &DnsSettings) -> Result<()> {
    let mut issues = Vec::new();
    validate_hosts(
        settings.simple_dns_item.hosts.as_deref(),
        "simpleDnsItem.hosts",
        &mut issues,
    );
    validate_expected_ips(
        settings.simple_dns_item.direct_expected_ips.as_deref(),
        "simpleDnsItem.directExpectedIPs",
        &mut issues,
    );

    if issues.is_empty() {
        Ok(())
    } else {
        Err(DnsManagerError::Validation(issues))
    }
}

fn validate_hosts(value: Option<&str>, field: &str, issues: &mut Vec<DnsValidationIssue>) {
    let Some(value) = value else {
        return;
    };
    for (index, line) in value.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.split_whitespace().count() < 2 {
            issues.push(issue(
                field,
                format!(
                    "Host line {} must contain a domain and at least one answer",
                    index + 1
                ),
            ));
        }
    }
}

fn validate_expected_ips(value: Option<&str>, field: &str, issues: &mut Vec<DnsValidationIssue>) {
    let Some(value) = value else {
        return;
    };
    if value
        .split(',')
        .map(str::trim)
        .any(|part| !part.is_empty() && part.chars().any(char::is_whitespace))
    {
        issues.push(issue(
            field,
            "Expected IPs must be comma-separated without embedded whitespace",
        ));
    }
}

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn issue(field: &str, message: impl Into<String>) -> DnsValidationIssue {
    DnsValidationIssue {
        field: field.to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn dns_manager_normalizes_and_validates_simple_dns_only() {
        let database = Database::connect_in_memory()
            .await
            .expect("DNS manager test operation should succeed");
        let manager = DnsManager::new(&database);
        let settings = manager
            .save_settings(DnsSettings {
                simple_dns_item: SimpleDnsItem {
                    hosts: Some("example.test 192.0.2.1".to_string()),
                    direct_dns: Some(" 1.1.1.1 ".to_string()),
                    ..SimpleDnsItem::default()
                },
            })
            .await
            .expect("DNS manager test operation should succeed");

        assert_eq!(
            settings.simple_dns_item.direct_dns.as_deref(),
            Some("1.1.1.1")
        );
    }
}
