use sqlx::{sqlite::SqliteRow, Row};
use tokio::sync::Mutex;
use voya_core::ProfileExItem;

use crate::{
    executor::{run_query, RepositoryExecutor},
    Result,
};

#[derive(Debug, Clone, Copy)]
pub struct ProfileExRepository<'executor> {
    executor: RepositoryExecutor<'executor>,
}

impl<'executor> ProfileExRepository<'executor> {
    #[must_use]
    pub(crate) const fn new(pool: &'executor sqlx::SqlitePool) -> Self {
        Self {
            executor: RepositoryExecutor::Pool(pool),
        }
    }

    #[must_use]
    pub(crate) const fn new_in_transaction(
        transaction: &'executor Mutex<sqlx::Transaction<'static, sqlx::Sqlite>>,
    ) -> Self {
        Self {
            executor: RepositoryExecutor::Transaction(transaction),
        }
    }

    #[must_use]
    pub(crate) const fn from_executor(executor: RepositoryExecutor<'executor>) -> Self {
        Self { executor }
    }

    pub async fn upsert(&self, item: &ProfileExItem) -> Result<()> {
        run_query!(
            self.executor,
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
            .bind(&item.ip_info),
            execute
        )?;

        Ok(())
    }

    pub async fn get(&self, index_id: &str) -> Result<Option<ProfileExItem>> {
        let row = run_query!(
            self.executor,
            sqlx::query("SELECT * FROM profile_ex_items WHERE index_id = ?").bind(index_id),
            fetch_optional
        )?;

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
        let rows = run_query!(
            self.executor,
            sqlx::query("SELECT * FROM profile_ex_items ORDER BY sort, index_id"),
            fetch_all
        )?;

        rows.into_iter().map(row_to_profile_ex).collect()
    }

    pub async fn max_sort(&self) -> Result<i32> {
        let max_sort: Option<i32> = run_query!(
            self.executor,
            sqlx::query_scalar("SELECT MAX(sort) FROM profile_ex_items"),
            fetch_one
        )?;

        Ok(max_sort.unwrap_or(0))
    }

    pub async fn set_sort(&self, index_id: &str, sort: i32) -> Result<()> {
        let mut item = self.ensure(index_id).await?;
        item.sort = sort;
        self.upsert(&item).await
    }

    pub async fn delete_orphans(&self) -> Result<u64> {
        let result = run_query!(
            self.executor,
            sqlx::query(
                r#"
            DELETE FROM profile_ex_items
            WHERE index_id NOT IN (SELECT index_id FROM profile_items)
            "#,
            ),
            execute
        )?;

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
