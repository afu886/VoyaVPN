use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::SubItem;

use crate::Result;

#[derive(Debug, Clone, Copy)]
pub struct SubscriptionRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> SubscriptionRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &SubItem) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO subscriptions (
                id, remarks, url, more_url, enabled, user_agent, sort, filter,
                convert_target, prev_profile, next_profile, pre_socks_port
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                remarks = excluded.remarks,
                url = excluded.url,
                more_url = excluded.more_url,
                enabled = excluded.enabled,
                user_agent = excluded.user_agent,
                sort = excluded.sort,
                filter = excluded.filter,
                convert_target = excluded.convert_target,
                prev_profile = excluded.prev_profile,
                next_profile = excluded.next_profile,
                pre_socks_port = excluded.pre_socks_port
            "#,
        )
        .bind(&item.id)
        .bind(&item.remarks)
        .bind(&item.url)
        .bind(&item.more_url)
        .bind(item.enabled)
        .bind(&item.user_agent)
        .bind(item.sort)
        .bind(&item.filter)
        .bind(&item.convert_target)
        .bind(&item.prev_profile)
        .bind(&item.next_profile)
        .bind(item.pre_socks_port)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<SubItem>> {
        let row = sqlx::query("SELECT * FROM subscriptions WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_subscription).transpose()
    }

    pub async fn get_by_url(&self, url: &str) -> Result<Option<SubItem>> {
        let row = sqlx::query("SELECT * FROM subscriptions WHERE url = ?")
            .bind(url)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_subscription).transpose()
    }

    pub async fn list(&self) -> Result<Vec<SubItem>> {
        let rows = sqlx::query("SELECT * FROM subscriptions ORDER BY sort, id")
            .fetch_all(self.pool)
            .await?;

        rows.into_iter().map(row_to_subscription).collect()
    }

    pub async fn max_sort(&self) -> Result<i32> {
        let max_sort: Option<i32> = sqlx::query_scalar("SELECT MAX(sort) FROM subscriptions")
            .fetch_one(self.pool)
            .await?;

        Ok(max_sort.unwrap_or(0))
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM subscriptions WHERE id = ?")
            .bind(id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

fn row_to_subscription(row: SqliteRow) -> Result<SubItem> {
    Ok(SubItem {
        id: row.try_get("id")?,
        remarks: row.try_get("remarks")?,
        url: row.try_get("url")?,
        more_url: row.try_get("more_url")?,
        enabled: row.try_get("enabled")?,
        user_agent: row.try_get("user_agent")?,
        sort: row.try_get("sort")?,
        filter: row.try_get("filter")?,
        convert_target: row.try_get("convert_target")?,
        prev_profile: row.try_get("prev_profile")?,
        next_profile: row.try_get("next_profile")?,
        pre_socks_port: row.try_get("pre_socks_port")?,
    })
}
