use tokio::sync::Mutex;

use crate::{
    executor::{run_query, RepositoryExecutor},
    Result,
};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AppStateRecord {
    pub active_profile_id: Option<String>,
    pub active_routing_id: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct AppStateRepository<'executor> {
    executor: RepositoryExecutor<'executor>,
}

impl<'executor> AppStateRepository<'executor> {
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

    pub async fn load(&self) -> Result<AppStateRecord> {
        let (active_profile_id, active_routing_id) = run_query!(
            self.executor,
            sqlx::query_as::<_, (Option<String>, Option<String>)>(
                "SELECT active_profile_id, active_routing_id FROM app_state WHERE id = 1",
            ),
            fetch_one
        )?;
        Ok(AppStateRecord {
            active_profile_id,
            active_routing_id,
        })
    }

    pub async fn set_active_profile(&self, profile_id: Option<&str>) -> Result<()> {
        run_query!(
            self.executor,
            sqlx::query("UPDATE app_state SET active_profile_id = ? WHERE id = 1").bind(profile_id),
            execute
        )?;
        Ok(())
    }

    pub async fn set_active_routing(&self, routing_id: Option<&str>) -> Result<()> {
        run_query!(
            self.executor,
            sqlx::query("UPDATE app_state SET active_routing_id = ? WHERE id = 1").bind(routing_id),
            execute
        )?;
        Ok(())
    }
}
