use sqlx::SqlitePool;
use voya_contracts::{AppSettingsV1, CURRENT_SCHEMA_VERSION};

use crate::{AppStateRecord, DbError, Result};

#[derive(Debug, Clone, Copy)]
pub struct SettingsRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> SettingsRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load(&self) -> Result<AppSettingsV1> {
        let row = sqlx::query_as::<_, (i64, String)>(
            "SELECT schema_version, payload FROM app_settings WHERE id = 1",
        )
        .fetch_optional(self.pool)
        .await?;
        let Some((version, payload)) = row else {
            return Ok(AppSettingsV1::default());
        };
        if version != i64::from(CURRENT_SCHEMA_VERSION) {
            return Err(DbError::UnsupportedDatabaseSchema {
                path: "app_settings".into(),
                found: Some(version),
                expected: i64::from(CURRENT_SCHEMA_VERSION),
                manual_reset_command: settings_reset_command(),
            });
        }
        let settings =
            serde_json::from_str::<AppSettingsV1>(&payload).map_err(|source| DbError::Json {
                path: "app_settings.payload".into(),
                source,
            })?;
        if settings.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(DbError::UnsupportedDatabaseSchema {
                path: "app_settings.payload".into(),
                found: Some(i64::from(settings.schema_version)),
                expected: i64::from(CURRENT_SCHEMA_VERSION),
                manual_reset_command: settings_reset_command(),
            });
        }
        Ok(settings)
    }

    pub async fn save(&self, settings: &AppSettingsV1) -> Result<()> {
        let payload = validated_payload(settings)?;
        save_settings(self.pool, &payload).await?;
        Ok(())
    }

    pub async fn save_with_state(
        &self,
        settings: &AppSettingsV1,
        state: &AppStateRecord,
    ) -> Result<()> {
        let payload = validated_payload(settings)?;
        let mut transaction = self.pool.begin().await?;
        save_settings(&mut *transaction, &payload).await?;
        sqlx::query(
            "UPDATE app_state SET active_profile_id = ?, active_routing_id = ? WHERE id = 1",
        )
        .bind(state.active_profile_id.as_deref())
        .bind(state.active_routing_id.as_deref())
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }
}

fn validated_payload(settings: &AppSettingsV1) -> Result<String> {
    if settings.schema_version != CURRENT_SCHEMA_VERSION {
        return Err(DbError::UnsupportedDatabaseSchema {
            path: "app_settings.payload".into(),
            found: Some(i64::from(settings.schema_version)),
            expected: i64::from(CURRENT_SCHEMA_VERSION),
            manual_reset_command: settings_reset_command(),
        });
    }
    let payload = serde_json::to_string(settings).map_err(|source| DbError::Json {
        path: "app_settings.payload".into(),
        source,
    })?;
    Ok(payload)
}

fn settings_reset_command() -> String {
    "remove the Voya database file reported at startup, then restart VoyaVPN".to_string()
}

async fn save_settings<'executor, E>(executor: E, payload: &str) -> Result<()>
where
    E: sqlx::Executor<'executor, Database = sqlx::Sqlite>,
{
    sqlx::query(
        r#"
            INSERT INTO app_settings (id, schema_version, payload)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                schema_version = excluded.schema_version,
                payload = excluded.payload
            "#,
    )
    .bind(i64::from(CURRENT_SCHEMA_VERSION))
    .bind(payload)
    .execute(executor)
    .await?;
    Ok(())
}
