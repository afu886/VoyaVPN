use sqlx::SqlitePool;

use crate::Result;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AppStateRecord {
    pub active_profile_id: Option<String>,
    pub active_routing_id: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct AppStateRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> AppStateRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load(&self) -> Result<AppStateRecord> {
        let (active_profile_id, active_routing_id) =
            sqlx::query_as::<_, (Option<String>, Option<String>)>(
                "SELECT active_profile_id, active_routing_id FROM app_state WHERE id = 1",
            )
            .fetch_one(self.pool)
            .await?;
        Ok(AppStateRecord {
            active_profile_id,
            active_routing_id,
        })
    }

    pub async fn set_active_profile(&self, profile_id: Option<&str>) -> Result<()> {
        sqlx::query("UPDATE app_state SET active_profile_id = ? WHERE id = 1")
            .bind(profile_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn set_active_routing(&self, routing_id: Option<&str>) -> Result<()> {
        sqlx::query("UPDATE app_state SET active_routing_id = ? WHERE id = 1")
            .bind(routing_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}
