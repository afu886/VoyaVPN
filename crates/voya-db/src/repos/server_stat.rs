use sqlx::{sqlite::SqliteRow, Row};
use tokio::sync::Mutex;
use voya_core::ServerStatItem;

use crate::{
    executor::{run_query, RepositoryExecutor},
    Result,
};

#[derive(Debug, Clone, Copy)]
pub struct ServerStatRepository<'executor> {
    executor: RepositoryExecutor<'executor>,
}

impl<'executor> ServerStatRepository<'executor> {
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

    pub async fn upsert(&self, item: &ServerStatItem) -> Result<()> {
        run_query!(
            self.executor,
            sqlx::query(
                r#"
            INSERT INTO server_stat_items (
                index_id, total_up, total_down, today_up, today_down, date_now
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(index_id) DO UPDATE SET
                total_up = excluded.total_up,
                total_down = excluded.total_down,
                today_up = excluded.today_up,
                today_down = excluded.today_down,
                date_now = excluded.date_now
            "#,
            )
            .bind(&item.index_id)
            .bind(item.total_up)
            .bind(item.total_down)
            .bind(item.today_up)
            .bind(item.today_down)
            .bind(item.date_now),
            execute
        )?;

        Ok(())
    }

    pub async fn get(&self, index_id: &str) -> Result<Option<ServerStatItem>> {
        let row = run_query!(
            self.executor,
            sqlx::query("SELECT * FROM server_stat_items WHERE index_id = ?").bind(index_id),
            fetch_optional
        )?;

        row.map(row_to_server_stat).transpose()
    }

    pub async fn ensure(&self, index_id: &str, date_now: i64) -> Result<ServerStatItem> {
        if let Some(mut item) = self.get(index_id).await? {
            if item.date_now != date_now {
                item.today_up = 0;
                item.today_down = 0;
                item.date_now = date_now;
                self.upsert(&item).await?;
            }

            return Ok(item);
        }

        let item = ServerStatItem {
            index_id: index_id.to_string(),
            date_now,
            ..ServerStatItem::default()
        };
        self.upsert(&item).await?;

        Ok(item)
    }

    pub async fn list(&self) -> Result<Vec<ServerStatItem>> {
        let rows = run_query!(
            self.executor,
            sqlx::query("SELECT * FROM server_stat_items ORDER BY index_id"),
            fetch_all
        )?;

        rows.into_iter().map(row_to_server_stat).collect()
    }

    pub async fn delete_orphans(&self) -> Result<u64> {
        let result = run_query!(
            self.executor,
            sqlx::query(
                r#"
            DELETE FROM server_stat_items
            WHERE index_id NOT IN (SELECT index_id FROM profile_items)
            "#,
            ),
            execute
        )?;

        Ok(result.rows_affected())
    }

    pub async fn reset_rollover(&self, date_now: i64) -> Result<u64> {
        let result = run_query!(
            self.executor,
            sqlx::query(
                r#"
            UPDATE server_stat_items
            SET today_up = 0, today_down = 0, date_now = ?
            WHERE date_now <> ?
            "#,
            )
            .bind(date_now)
            .bind(date_now),
            execute
        )?;

        Ok(result.rows_affected())
    }

    pub async fn add_traffic(
        &self,
        index_id: &str,
        date_now: i64,
        proxy_up: i64,
        proxy_down: i64,
    ) -> Result<ServerStatItem> {
        let mut item = self.ensure(index_id, date_now).await?;
        item.today_up = item.today_up.saturating_add(proxy_up.max(0));
        item.today_down = item.today_down.saturating_add(proxy_down.max(0));
        item.total_up = item.total_up.saturating_add(proxy_up.max(0));
        item.total_down = item.total_down.saturating_add(proxy_down.max(0));
        item.date_now = date_now;
        self.upsert(&item).await?;

        Ok(item)
    }

    pub async fn clone_stat(
        &self,
        index_id: &str,
        to_index_id: &str,
    ) -> Result<Option<ServerStatItem>> {
        if index_id == to_index_id {
            return self.get(index_id).await;
        }

        let Some(mut item) = self.get(index_id).await? else {
            return Ok(None);
        };

        item.index_id = to_index_id.to_string();
        self.upsert(&item).await?;

        Ok(Some(item))
    }
}

fn row_to_server_stat(row: SqliteRow) -> Result<ServerStatItem> {
    Ok(ServerStatItem {
        index_id: row.try_get("index_id")?,
        total_up: row.try_get("total_up")?,
        total_down: row.try_get("total_down")?,
        today_up: row.try_get("today_up")?,
        today_down: row.try_get("today_down")?,
        date_now: row.try_get("date_now")?,
    })
}
