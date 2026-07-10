use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::FullConfigTemplateItem;

use crate::Result;

#[derive(Debug, Clone, Copy)]
pub struct FullConfigTemplateRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> FullConfigTemplateRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &FullConfigTemplateItem) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO full_config_template_items (
                id, remarks, enabled, config,
                tun_config, add_proxy_only, proxy_detour
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                remarks = excluded.remarks,
                enabled = excluded.enabled,
                config = excluded.config,
                tun_config = excluded.tun_config,
                add_proxy_only = excluded.add_proxy_only,
                proxy_detour = excluded.proxy_detour
            "#,
        )
        .bind(&item.id)
        .bind(&item.remarks)
        .bind(item.enabled)
        .bind(&item.config)
        .bind(&item.tun_config)
        .bind(item.add_proxy_only)
        .bind(&item.proxy_detour)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<FullConfigTemplateItem>> {
        let row = sqlx::query("SELECT * FROM full_config_template_items WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_full_config_template).transpose()
    }

    pub async fn get_default(&self) -> Result<Option<FullConfigTemplateItem>> {
        let row = sqlx::query(
            r#"
            SELECT *
            FROM full_config_template_items
            ORDER BY enabled DESC, id
            LIMIT 1
            "#,
        )
        .fetch_optional(self.pool)
        .await?;

        row.map(row_to_full_config_template).transpose()
    }

    pub async fn list(&self) -> Result<Vec<FullConfigTemplateItem>> {
        let rows = sqlx::query("SELECT * FROM full_config_template_items ORDER BY id")
            .fetch_all(self.pool)
            .await?;

        rows.into_iter().map(row_to_full_config_template).collect()
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM full_config_template_items WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

fn row_to_full_config_template(row: SqliteRow) -> Result<FullConfigTemplateItem> {
    Ok(FullConfigTemplateItem {
        id: row.try_get("id")?,
        remarks: row.try_get("remarks")?,
        enabled: row.try_get("enabled")?,
        config: row.try_get("config")?,
        tun_config: row.try_get("tun_config")?,
        add_proxy_only: row.try_get("add_proxy_only")?,
        proxy_detour: row.try_get("proxy_detour")?,
    })
}
