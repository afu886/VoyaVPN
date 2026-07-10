use std::{
    fs,
    path::{Path, PathBuf},
};

use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    Acquire, SqliteConnection, SqlitePool,
};

use crate::{
    DbError, DnsRepository, FullConfigTemplateRepository, ProfileExRepository, ProfileRepository,
    Result, RoutingRepository, ServerStatRepository, SubscriptionRepository,
};

pub const DATABASE_NAME: &str = "voyavpn.sqlite";

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

const IMPORT_DELETE_STATEMENTS: &[&str] = &[
    "DELETE FROM main.server_stat_items",
    "DELETE FROM main.profile_ex_items",
    "DELETE FROM main.profile_items",
    "DELETE FROM main.subscriptions",
    "DELETE FROM main.routing_items",
    "DELETE FROM main.dns_items",
    "DELETE FROM main.full_config_template_items",
];

const IMPORT_INSERT_STATEMENTS: &[&str] = &[
    r#"
    INSERT INTO main.profile_items (
        index_id, config_type, config_version, subid, is_sub,
        pre_socks_port, display_log, remarks, address, port, password,
        username, network, stream_security, allow_insecure, sni, alpn,
        fingerprint, public_key, short_id, spider_x, mldsa65_verify,
        mux_enabled, cert, cert_sha, ech_config_list, finalmask,
        protocol_extra, transport_extra
    )
    SELECT
        index_id, config_type, config_version, subid, is_sub,
        pre_socks_port, display_log, remarks, address, port, password,
        username, network, stream_security, allow_insecure, sni, alpn,
        fingerprint, public_key, short_id, spider_x, mldsa65_verify,
        mux_enabled, cert, cert_sha, ech_config_list, finalmask,
        protocol_extra, transport_extra
    FROM backup.profile_items
    "#,
    r#"
    INSERT INTO main.profile_ex_items (
        index_id, delay, speed, sort, message, ip_info
    )
    SELECT
        index_id, delay, speed, sort, message, ip_info
    FROM backup.profile_ex_items
    "#,
    r#"
    INSERT INTO main.server_stat_items (
        index_id, total_up, total_down, today_up, today_down, date_now
    )
    SELECT
        index_id, total_up, total_down, today_up, today_down, date_now
    FROM backup.server_stat_items
    "#,
    r#"
    INSERT INTO main.subscriptions (
        id, remarks, url, more_url, enabled, user_agent, sort, filter,
        auto_update_interval, update_time, convert_target, prev_profile,
        next_profile, pre_socks_port, memo
    )
    SELECT
        id, remarks, url, more_url, enabled, user_agent, sort, filter,
        auto_update_interval, update_time, convert_target, prev_profile,
        next_profile, pre_socks_port, memo
    FROM backup.subscriptions
    "#,
    r#"
    INSERT INTO main.routing_items (
        id, remarks, url, rule_set, rule_num, enabled, locked,
        custom_icon, custom_ruleset_path4_singbox, domain_strategy,
        domain_strategy4_singbox, sort, is_active
    )
    SELECT
        id, remarks, url, rule_set, rule_num, enabled, locked,
        custom_icon, custom_ruleset_path4_singbox, domain_strategy,
        domain_strategy4_singbox, sort, is_active
    FROM backup.routing_items
    "#,
    r#"
    INSERT INTO main.dns_items (
        id, remarks, enabled, use_system_hosts, normal_dns,
        tun_dns, domain_strategy4_freedom, domain_dns_address
    )
    SELECT
        id, remarks, enabled, use_system_hosts, normal_dns,
        tun_dns, domain_strategy4_freedom, domain_dns_address
    FROM backup.dns_items
    "#,
    r#"
    INSERT INTO main.full_config_template_items (
        id, remarks, enabled, config, tun_config,
        add_proxy_only, proxy_detour
    )
    SELECT
        id, remarks, enabled, config, tun_config,
        add_proxy_only, proxy_detour
    FROM backup.full_config_template_items
    "#,
];

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
            .connect("sqlite::memory:")
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

    pub async fn backup_to(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| DbError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }
        if path.exists() {
            fs::remove_file(path).map_err(|source| DbError::Io {
                path: path.to_path_buf(),
                source,
            })?;
        }

        let target = path.to_string_lossy().into_owned();
        sqlx::query("VACUUM INTO ?")
            .bind(target)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn replace_from_file(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        validate_backup_file(path).await?;

        let source = path.to_string_lossy().into_owned();
        let mut conn = self.pool.acquire().await?;

        sqlx::query("ATTACH DATABASE ? AS backup")
            .bind(source)
            .execute(&mut *conn)
            .await?;

        let import_result = async {
            validate_attached_backup_migrations(&mut conn).await?;
            sqlx::query("PRAGMA foreign_keys = OFF")
                .execute(&mut *conn)
                .await?;

            let mut tx = conn.begin().await?;

            for statement in IMPORT_DELETE_STATEMENTS
                .iter()
                .chain(IMPORT_INSERT_STATEMENTS.iter())
            {
                sqlx::query(*statement).execute(&mut *tx).await?;
            }

            ensure_foreign_key_check_clean(&mut tx).await?;
            tx.commit().await?;
            Result::<()>::Ok(())
        }
        .await;

        let foreign_keys_result = sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&mut *conn)
            .await;
        let post_import_check_result = if import_result.is_ok() && foreign_keys_result.is_ok() {
            ensure_foreign_key_check_clean(&mut conn).await
        } else {
            Ok(())
        };
        let detach_result = sqlx::query("DETACH DATABASE backup")
            .execute(&mut *conn)
            .await;

        import_result?;
        foreign_keys_result?;
        post_import_check_result?;
        detach_result?;

        Ok(())
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

    #[must_use]
    pub fn dns(&self) -> DnsRepository<'_> {
        DnsRepository::new(&self.pool)
    }

    #[must_use]
    pub fn full_config_templates(&self) -> FullConfigTemplateRepository<'_> {
        FullConfigTemplateRepository::new(&self.pool)
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }
}

async fn validate_backup_file(path: &Path) -> Result<()> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    let has_migrations: i64 = sqlx::query_scalar(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = '_sqlx_migrations'
        )
        "#,
    )
    .fetch_one(&pool)
    .await?;

    if has_migrations != 1 {
        pool.close().await;
        return Err(DbError::InvalidBackup {
            reason: "missing _sqlx_migrations table",
        });
    }

    let migration_result = MIGRATOR.run(&pool).await;
    pool.close().await;
    migration_result?;

    Ok(())
}

async fn validate_attached_backup_migrations(conn: &mut SqliteConnection) -> Result<()> {
    let expected_migrations = current_migration_count()?;
    let successful_migrations: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM backup._sqlx_migrations WHERE success = 1")
            .fetch_one(&mut *conn)
            .await?;
    let total_migrations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM backup._sqlx_migrations")
        .fetch_one(&mut *conn)
        .await?;

    if successful_migrations != expected_migrations || total_migrations != expected_migrations {
        return Err(DbError::InvalidBackup {
            reason: "backup migration set does not match current schema",
        });
    }

    Ok(())
}

fn current_migration_count() -> Result<i64> {
    i64::try_from(
        MIGRATOR
            .iter()
            .filter(|migration| migration.migration_type.is_up_migration())
            .count(),
    )
    .map_err(|_| DbError::InvalidBackup {
        reason: "local migration count overflow",
    })
}

async fn ensure_foreign_key_check_clean(conn: &mut SqliteConnection) -> Result<()> {
    let violations = sqlx::query("PRAGMA main.foreign_key_check")
        .fetch_all(&mut *conn)
        .await?;

    if violations.is_empty() {
        Ok(())
    } else {
        Err(DbError::BackupForeignKeyViolation {
            violations: violations.len(),
        })
    }
}

#[cfg(test)]
mod tests;
