use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::RoutingItem;

use crate::{blob, Result};

#[derive(Debug, Clone, Copy)]
pub struct RoutingRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> RoutingRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &RoutingItem) -> Result<()> {
        let rule_set = blob::rules_to_text(&item.rule_set)?;
        let rule_num = i32::try_from(item.rule_set.len()).unwrap_or(i32::MAX);

        sqlx::query(
            r#"
            INSERT INTO routing_items (
                id, remarks, url, rule_set, rule_num, enabled, locked,
                custom_icon, custom_ruleset_path4_singbox, domain_strategy,
                domain_strategy4_singbox, sort, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                remarks = excluded.remarks,
                url = excluded.url,
                rule_set = excluded.rule_set,
                rule_num = excluded.rule_num,
                enabled = excluded.enabled,
                locked = excluded.locked,
                custom_icon = excluded.custom_icon,
                custom_ruleset_path4_singbox = excluded.custom_ruleset_path4_singbox,
                domain_strategy = excluded.domain_strategy,
                domain_strategy4_singbox = excluded.domain_strategy4_singbox,
                sort = excluded.sort,
                is_active = excluded.is_active
            "#,
        )
        .bind(&item.id)
        .bind(&item.remarks)
        .bind(&item.url)
        .bind(rule_set)
        .bind(rule_num)
        .bind(item.enabled)
        .bind(item.locked)
        .bind(&item.custom_icon)
        .bind(&item.custom_ruleset_path4_singbox)
        .bind(&item.domain_strategy)
        .bind(&item.domain_strategy4_singbox)
        .bind(item.sort)
        .bind(item.is_active)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<RoutingItem>> {
        let row = sqlx::query("SELECT * FROM routing_items WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_routing).transpose()
    }

    pub async fn list(&self) -> Result<Vec<RoutingItem>> {
        let rows = sqlx::query("SELECT * FROM routing_items ORDER BY sort, id")
            .fetch_all(self.pool)
            .await?;

        rows.into_iter().map(row_to_routing).collect()
    }

    pub async fn active(&self) -> Result<Option<RoutingItem>> {
        let row = sqlx::query(
            "SELECT * FROM routing_items WHERE is_active = 1 ORDER BY sort, id LIMIT 1",
        )
        .fetch_optional(self.pool)
        .await?;

        row.map(row_to_routing).transpose()
    }

    pub async fn first(&self) -> Result<Option<RoutingItem>> {
        let row = sqlx::query("SELECT * FROM routing_items ORDER BY sort, id LIMIT 1")
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_routing).transpose()
    }

    pub async fn exists(&self, id: &str) -> Result<bool> {
        let exists: i64 =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM routing_items WHERE id = ?)")
                .bind(id)
                .fetch_one(self.pool)
                .await?;

        Ok(exists != 0)
    }

    pub async fn max_sort(&self) -> Result<i32> {
        let max_sort: Option<i32> = sqlx::query_scalar("SELECT MAX(sort) FROM routing_items")
            .fetch_one(self.pool)
            .await?;

        Ok(max_sort.unwrap_or(0))
    }

    pub async fn set_active(&self, id: &str) -> Result<bool> {
        if !self.exists(id).await? {
            return Ok(false);
        }

        sqlx::query("UPDATE routing_items SET is_active = 0")
            .execute(self.pool)
            .await?;
        let result = sqlx::query("UPDATE routing_items SET is_active = 1 WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM routing_items WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_many(&self, ids: &[String]) -> Result<u64> {
        let mut tx = self.pool.begin().await?;
        let mut deleted = 0;
        for id in ids {
            let result = sqlx::query("DELETE FROM routing_items WHERE id = ?")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            deleted += result.rows_affected();
        }

        tx.commit().await?;
        Ok(deleted)
    }
}

fn row_to_routing(row: SqliteRow) -> Result<RoutingItem> {
    let rule_set = row.try_get::<String, _>("rule_set")?;
    let rules = blob::rules_from_text(&rule_set)?;

    Ok(RoutingItem {
        id: row.try_get("id")?,
        remarks: row.try_get("remarks")?,
        url: row.try_get("url")?,
        rule_num: i32::try_from(rules.len()).unwrap_or(i32::MAX),
        rule_set: rules,
        enabled: row.try_get("enabled")?,
        locked: row.try_get("locked")?,
        custom_icon: row.try_get("custom_icon")?,
        custom_ruleset_path4_singbox: row.try_get("custom_ruleset_path4_singbox")?,
        domain_strategy: row.try_get("domain_strategy")?,
        domain_strategy4_singbox: row.try_get("domain_strategy4_singbox")?,
        sort: row.try_get("sort")?,
        is_active: row.try_get("is_active")?,
    })
}
