use sqlx::{sqlite::SqliteRow, Row};
use tokio::sync::Mutex;
use voya_core::RoutingItem;

use crate::{
    blob,
    executor::{run_query, RepositoryExecutor},
    Result,
};

#[derive(Debug, Clone, Copy)]
pub struct RoutingRepository<'executor> {
    executor: RepositoryExecutor<'executor>,
}

impl<'executor> RoutingRepository<'executor> {
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

    pub async fn upsert(&self, item: &RoutingItem) -> Result<()> {
        let rule_set = blob::rules_to_text(&item.rule_set)?;
        run_query!(
            self.executor,
            sqlx::query(
                r#"
            INSERT INTO routing_items (
                id, remarks, url, rule_set, enabled, locked,
                custom_icon, custom_ruleset_path4_singbox, domain_strategy,
                domain_strategy4_singbox, sort
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                remarks = excluded.remarks,
                url = excluded.url,
                rule_set = excluded.rule_set,
                enabled = excluded.enabled,
                locked = excluded.locked,
                custom_icon = excluded.custom_icon,
                custom_ruleset_path4_singbox = excluded.custom_ruleset_path4_singbox,
                domain_strategy = excluded.domain_strategy,
                domain_strategy4_singbox = excluded.domain_strategy4_singbox,
                sort = excluded.sort
            "#,
            )
            .bind(&item.id)
            .bind(&item.remarks)
            .bind(&item.url)
            .bind(rule_set)
            .bind(item.enabled)
            .bind(item.locked)
            .bind(&item.custom_icon)
            .bind(&item.custom_ruleset_path4_singbox)
            .bind(&item.domain_strategy)
            .bind(&item.domain_strategy4_singbox)
            .bind(item.sort),
            execute
        )?;

        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<RoutingItem>> {
        let row = run_query!(self.executor, sqlx::query(
            "SELECT r.*, (s.active_routing_id = r.id) AS is_active FROM routing_items r CROSS JOIN app_state s WHERE r.id = ?",
        ).bind(id), fetch_optional)?;

        row.map(row_to_routing).transpose()
    }

    pub async fn list(&self) -> Result<Vec<RoutingItem>> {
        let rows = run_query!(self.executor, sqlx::query(
            "SELECT r.*, (s.active_routing_id = r.id) AS is_active FROM routing_items r CROSS JOIN app_state s ORDER BY r.sort, r.id",
        ), fetch_all)?;

        rows.into_iter().map(row_to_routing).collect()
    }

    pub async fn active(&self) -> Result<Option<RoutingItem>> {
        let row = run_query!(self.executor, sqlx::query(
            "SELECT r.*, 1 AS is_active FROM routing_items r JOIN app_state s ON s.active_routing_id = r.id ORDER BY r.sort, r.id LIMIT 1",
        ), fetch_optional)?;

        row.map(row_to_routing).transpose()
    }

    pub async fn first(&self) -> Result<Option<RoutingItem>> {
        let row = run_query!(self.executor, sqlx::query(
            "SELECT r.*, (s.active_routing_id = r.id) AS is_active FROM routing_items r CROSS JOIN app_state s ORDER BY r.sort, r.id LIMIT 1",
        ), fetch_optional)?;

        row.map(row_to_routing).transpose()
    }

    pub async fn exists(&self, id: &str) -> Result<bool> {
        let exists: i64 = run_query!(
            self.executor,
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM routing_items WHERE id = ?)").bind(id),
            fetch_one
        )?;

        Ok(exists != 0)
    }

    pub async fn max_sort(&self) -> Result<i32> {
        let max_sort: Option<i32> = run_query!(
            self.executor,
            sqlx::query_scalar("SELECT MAX(sort) FROM routing_items"),
            fetch_one
        )?;

        Ok(max_sort.unwrap_or(0))
    }

    pub async fn set_active(&self, id: &str) -> Result<bool> {
        if !self.exists(id).await? {
            return Ok(false);
        }

        let result = run_query!(
            self.executor,
            sqlx::query("UPDATE app_state SET active_routing_id = ? WHERE id = 1").bind(id),
            execute
        )?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete(&self, id: &str) -> Result<bool> {
        let result = run_query!(
            self.executor,
            sqlx::query("DELETE FROM routing_items WHERE id = ?").bind(id),
            execute
        )?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_many(&self, ids: &[String]) -> Result<u64> {
        match self.executor {
            RepositoryExecutor::Pool(pool) => {
                let mut transaction = pool.begin().await?;
                let mut deleted = 0;
                for id in ids {
                    let result = sqlx::query("DELETE FROM routing_items WHERE id = ?")
                        .bind(id)
                        .execute(&mut *transaction)
                        .await?;
                    deleted += result.rows_affected();
                }
                transaction.commit().await?;
                Ok(deleted)
            }
            RepositoryExecutor::Transaction(transaction) => {
                let mut transaction = transaction.lock().await;
                let mut deleted = 0;
                for id in ids {
                    let result = sqlx::query("DELETE FROM routing_items WHERE id = ?")
                        .bind(id)
                        .execute(&mut **transaction)
                        .await?;
                    deleted += result.rows_affected();
                }
                Ok(deleted)
            }
        }
    }
}

fn row_to_routing(row: SqliteRow) -> Result<RoutingItem> {
    let rule_set = row.try_get::<String, _>("rule_set")?;
    let rules = blob::rules_from_text(&rule_set)?;

    Ok(RoutingItem {
        id: row.try_get("id")?,
        remarks: row.try_get("remarks")?,
        url: row.try_get("url")?,
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
