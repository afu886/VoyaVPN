use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::DnsItem;

use crate::Result;

#[derive(Debug, Clone, Copy)]
pub struct DnsRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> DnsRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &DnsItem) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO dns_items (
                id, remarks, enabled, use_system_hosts,
                normal_dns, tun_dns, domain_strategy4_freedom, domain_dns_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                remarks = excluded.remarks,
                enabled = excluded.enabled,
                use_system_hosts = excluded.use_system_hosts,
                normal_dns = excluded.normal_dns,
                tun_dns = excluded.tun_dns,
                domain_strategy4_freedom = excluded.domain_strategy4_freedom,
                domain_dns_address = excluded.domain_dns_address
            "#,
        )
        .bind(&item.id)
        .bind(&item.remarks)
        .bind(item.enabled)
        .bind(item.use_system_hosts)
        .bind(&item.normal_dns)
        .bind(&item.tun_dns)
        .bind(&item.domain_strategy4_freedom)
        .bind(&item.domain_dns_address)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<DnsItem>> {
        let row = sqlx::query("SELECT * FROM dns_items WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_dns).transpose()
    }

    pub async fn get_default(&self) -> Result<Option<DnsItem>> {
        let row = sqlx::query(
            r#"
            SELECT *
            FROM dns_items
            ORDER BY enabled DESC, id
            LIMIT 1
            "#,
        )
        .fetch_optional(self.pool)
        .await?;

        row.map(row_to_dns).transpose()
    }

    pub async fn list(&self) -> Result<Vec<DnsItem>> {
        let rows = sqlx::query("SELECT * FROM dns_items ORDER BY id")
            .fetch_all(self.pool)
            .await?;

        rows.into_iter().map(row_to_dns).collect()
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM dns_items WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

fn row_to_dns(row: SqliteRow) -> Result<DnsItem> {
    Ok(DnsItem {
        id: row.try_get("id")?,
        remarks: row.try_get("remarks")?,
        enabled: row.try_get("enabled")?,
        use_system_hosts: row.try_get("use_system_hosts")?,
        normal_dns: row.try_get("normal_dns")?,
        tun_dns: row.try_get("tun_dns")?,
        domain_strategy4_freedom: row.try_get("domain_strategy4_freedom")?,
        domain_dns_address: row.try_get("domain_dns_address")?,
    })
}
