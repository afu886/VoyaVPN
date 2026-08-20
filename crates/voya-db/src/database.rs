use std::{
    fs,
    path::{Path, PathBuf},
};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};

use crate::{
    DbError, ProfileExRepository, ProfileRepository, Result, RoutingRepository,
    ServerStatRepository, SubscriptionRepository,
};

pub const DATABASE_NAME: &str = "voyavpn.sqlite";

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone)]
pub struct Database {
    pool: SqlitePool,
    path: Option<PathBuf>,
}

impl Database {
    pub async fn connect(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| DbError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        MIGRATOR.run(&pool).await?;

        Ok(Self {
            pool,
            path: Some(path.to_path_buf()),
        })
    }

    pub async fn connect_in_memory() -> Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(":memory:")
                    .foreign_keys(true),
            )
            .await?;
        MIGRATOR.run(&pool).await?;

        Ok(Self { pool, path: None })
    }

    #[must_use]
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    #[must_use]
    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    #[must_use]
    pub fn profiles(&self) -> ProfileRepository<'_> {
        ProfileRepository::new(&self.pool)
    }

    #[must_use]
    pub fn profile_exs(&self) -> ProfileExRepository<'_> {
        ProfileExRepository::new(&self.pool)
    }

    #[must_use]
    pub fn server_stats(&self) -> ServerStatRepository<'_> {
        ServerStatRepository::new(&self.pool)
    }

    #[must_use]
    pub fn subscriptions(&self) -> SubscriptionRepository<'_> {
        SubscriptionRepository::new(&self.pool)
    }

    #[must_use]
    pub fn routings(&self) -> RoutingRepository<'_> {
        RoutingRepository::new(&self.pool)
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests;
