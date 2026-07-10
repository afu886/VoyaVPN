use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::ProfileExItem;

use crate::Result;

#[derive(Debug, Clone, Copy)]
pub struct ProfileExRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> ProfileExRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &ProfileExItem) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO profile_ex_items (
                index_id, delay, speed, sort, message, ip_info
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(index_id) DO UPDATE SET
                delay = excluded.delay,
                speed = excluded.speed,
                sort = excluded.sort,
                message = excluded.message,
                ip_info = excluded.ip_info
            "#,
        )
        .bind(&item.index_id)
        .bind(item.delay)
        .bind(item.speed)
        .bind(item.sort)
        .bind(&item.message)
        .bind(&item.ip_info)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn get(&self, index_id: &str) -> Result<Option<ProfileExItem>> {
        let row = sqlx::query("SELECT * FROM profile_ex_items WHERE index_id = ?")
            .bind(index_id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_profile_ex).transpose()
    }

    pub async fn ensure(&self, index_id: &str) -> Result<ProfileExItem> {
        if let Some(item) = self.get(index_id).await? {
            return Ok(item);
        }

        let item = ProfileExItem {
            index_id: index_id.to_string(),
            ..ProfileExItem::default()
        };
        self.upsert(&item).await?;

        Ok(item)
    }

    pub async fn list(&self) -> Result<Vec<ProfileExItem>> {
        let rows = sqlx::query("SELECT * FROM profile_ex_items ORDER BY sort, index_id")
            .fetch_all(self.pool)
            .await?;

        rows.into_iter().map(row_to_profile_ex).collect()
    }

    pub async fn max_sort(&self) -> Result<i32> {
        let max_sort: Option<i32> = sqlx::query_scalar("SELECT MAX(sort) FROM profile_ex_items")
            .fetch_one(self.pool)
            .await?;

        Ok(max_sort.unwrap_or(0))
    }

    pub async fn set_sort(&self, index_id: &str, sort: i32) -> Result<()> {
        let mut item = self.ensure(index_id).await?;
        item.sort = sort;
        self.upsert(&item).await
    }

    pub async fn delete_orphans(&self) -> Result<u64> {
        let result = sqlx::query(
            r#"
            DELETE FROM profile_ex_items
            WHERE index_id NOT IN (SELECT index_id FROM profile_items)
            "#,
        )
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}

fn row_to_profile_ex(row: SqliteRow) -> Result<ProfileExItem> {
    Ok(ProfileExItem {
        index_id: row.try_get("index_id")?,
        delay: row.try_get("delay")?,
        speed: row.try_get("speed")?,
        sort: row.try_get("sort")?,
        message: row.try_get("message")?,
        ip_info: row.try_get("ip_info")?,
    })
}
