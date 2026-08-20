use sqlx::{
    sqlite::{SqlitePool, SqliteRow},
    Row,
};
use voya_core::{ConfigType, ProfileExItem, ProfileItem};

use crate::{blob, DbError, ProfileExRepository, Result};

#[derive(Debug, Clone, Copy)]
pub struct ProfileRepository<'pool> {
    pool: &'pool SqlitePool,
}

impl<'pool> ProfileRepository<'pool> {
    #[must_use]
    pub fn new(pool: &'pool SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, item: &ProfileItem) -> Result<()> {
        let protocol = blob::profile_protocol_to_text(&item.protocol)?;
        let transport = item
            .transport
            .as_ref()
            .map(blob::profile_transport_to_text)
            .transpose()?;
        let tls = item
            .tls
            .as_ref()
            .map(blob::tls_settings_to_text)
            .transpose()?;

        sqlx::query(
            r#"
            INSERT INTO profile_items (
                index_id, config_type, subscription_id,
                display_log, remarks, protocol, transport, tls
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(index_id) DO UPDATE SET
                config_type = excluded.config_type,
                subscription_id = excluded.subscription_id,
                display_log = excluded.display_log,
                remarks = excluded.remarks,
                protocol = excluded.protocol,
                transport = excluded.transport,
                tls = excluded.tls
            "#,
        )
        .bind(&item.index_id)
        .bind(config_type_to_str(item.config_type()))
        .bind(item.subscription_id.as_deref())
        .bind(item.display_log)
        .bind(&item.remarks)
        .bind(protocol)
        .bind(transport)
        .bind(tls)
        .execute(self.pool)
        .await?;

        Ok(())
    }

    pub async fn upsert_with_profile_ex(
        &self,
        item: &ProfileItem,
        profile_ex: &ProfileExItem,
    ) -> Result<()> {
        self.upsert(item).await?;
        ProfileExRepository::new(self.pool).upsert(profile_ex).await
    }

    pub async fn get(&self, index_id: &str) -> Result<Option<ProfileItem>> {
        let row = sqlx::query("SELECT * FROM profile_items WHERE index_id = ?")
            .bind(index_id)
            .fetch_optional(self.pool)
            .await?;

        row.map(row_to_profile).transpose()
    }

    pub async fn list(&self) -> Result<Vec<ProfileItem>> {
        let rows = sqlx::query(
            r#"
            SELECT p.*
            FROM profile_items p
            LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
            ORDER BY COALESCE(e.sort, 0), p.index_id
            "#,
        )
        .fetch_all(self.pool)
        .await?;

        rows.into_iter().map(row_to_profile).collect()
    }

    pub async fn list_by_subscription_id(
        &self,
        subscription_id: Option<&str>,
    ) -> Result<Vec<ProfileItem>> {
        let rows = if let Some(subscription_id) = subscription_id.filter(|value| !value.is_empty())
        {
            sqlx::query(
                r#"
                SELECT p.*
                FROM profile_items p
                LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
                WHERE p.subscription_id = ?
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .bind(subscription_id)
            .fetch_all(self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT p.*
                FROM profile_items p
                LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .fetch_all(self.pool)
            .await?
        };

        rows.into_iter().map(row_to_profile).collect()
    }

    pub async fn list_with_profile_ex(
        &self,
        subscription_id: Option<&str>,
    ) -> Result<Vec<(ProfileItem, ProfileExItem)>> {
        let rows = if let Some(subscription_id) = subscription_id.filter(|value| !value.is_empty())
        {
            sqlx::query(
                r#"
                SELECT
                    p.*,
                    COALESCE(e.delay, 0) AS ex_delay,
                    COALESCE(e.speed, 0.0) AS ex_speed,
                    COALESCE(e.sort, 0) AS ex_sort,
                    e.message AS ex_message,
                    e.ip_info AS ex_ip_info
                FROM profile_items p
                LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
                WHERE p.subscription_id = ?
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .bind(subscription_id)
            .fetch_all(self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT
                    p.*,
                    COALESCE(e.delay, 0) AS ex_delay,
                    COALESCE(e.speed, 0.0) AS ex_speed,
                    COALESCE(e.sort, 0) AS ex_sort,
                    e.message AS ex_message,
                    e.ip_info AS ex_ip_info
                FROM profile_items p
                LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .fetch_all(self.pool)
            .await?
        };

        rows.into_iter()
            .map(|row| {
                let profile = row_to_profile_ref(&row)?;
                let profile_ex = row_to_profile_ex_joined(&row)?;

                Ok((profile, profile_ex))
            })
            .collect()
    }

    pub async fn exists(&self, index_id: &str) -> Result<bool> {
        let exists: i64 =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profile_items WHERE index_id = ?)")
                .bind(index_id)
                .fetch_one(self.pool)
                .await?;

        Ok(exists != 0)
    }

    pub async fn delete(&self, index_id: &str) -> Result<bool> {
        let result = sqlx::query("DELETE FROM profile_items WHERE index_id = ?")
            .bind(index_id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_many(&self, index_ids: &[String]) -> Result<u64> {
        let mut tx = self.pool.begin().await?;
        let mut deleted = 0;
        for index_id in index_ids {
            let result = sqlx::query("DELETE FROM profile_items WHERE index_id = ?")
                .bind(index_id)
                .execute(&mut *tx)
                .await?;
            deleted += result.rows_affected();
        }

        tx.commit().await?;
        Ok(deleted)
    }

    pub async fn delete_by_subscription_id(&self, subscription_id: &str) -> Result<u64> {
        let result = sqlx::query("DELETE FROM profile_items WHERE subscription_id = ?")
            .bind(subscription_id)
            .execute(self.pool)
            .await?;

        Ok(result.rows_affected())
    }
}

fn row_to_profile(row: SqliteRow) -> Result<ProfileItem> {
    row_to_profile_ref(&row)
}

fn row_to_profile_ref(row: &SqliteRow) -> Result<ProfileItem> {
    let config_type_value = row.try_get::<String, _>("config_type")?;
    let subscription_id = row.try_get::<Option<String>, _>("subscription_id")?;
    let protocol = blob::profile_protocol_from_text(&row.try_get::<String, _>("protocol")?)?;
    let transport = row
        .try_get::<Option<String>, _>("transport")?
        .as_deref()
        .map(blob::profile_transport_from_text)
        .transpose()?;
    let tls = row
        .try_get::<Option<String>, _>("tls")?
        .as_deref()
        .map(blob::tls_settings_from_text)
        .transpose()?;
    let config_type = config_type_from_str(&config_type_value)?;
    if protocol.config_type() != config_type {
        return Err(DbError::InvalidEnum {
            enum_name: "ProfileProtocol/config_type",
            value: config_type_value,
        });
    }

    Ok(ProfileItem {
        index_id: row.try_get("index_id")?,
        subscription_id,
        display_log: row.try_get("display_log")?,
        remarks: row.try_get("remarks")?,
        protocol,
        transport,
        tls,
    })
}

const fn config_type_to_str(value: ConfigType) -> &'static str {
    match value {
        ConfigType::VMess => "vmess",
        ConfigType::Custom => "custom",
        ConfigType::Shadowsocks => "shadowsocks",
        ConfigType::SOCKS => "socks",
        ConfigType::VLESS => "vless",
        ConfigType::Trojan => "trojan",
        ConfigType::Hysteria2 => "hysteria2",
        ConfigType::TUIC => "tuic",
        ConfigType::WireGuard => "wireGuard",
        ConfigType::HTTP => "http",
        ConfigType::Anytls => "anytls",
        ConfigType::Naive => "naive",
        ConfigType::PolicyGroup => "policyGroup",
        ConfigType::ProxyChain => "proxyChain",
    }
}

fn config_type_from_str(value: &str) -> Result<ConfigType> {
    match value {
        "vmess" => Ok(ConfigType::VMess),
        "custom" => Ok(ConfigType::Custom),
        "shadowsocks" => Ok(ConfigType::Shadowsocks),
        "socks" => Ok(ConfigType::SOCKS),
        "vless" => Ok(ConfigType::VLESS),
        "trojan" => Ok(ConfigType::Trojan),
        "hysteria2" => Ok(ConfigType::Hysteria2),
        "tuic" => Ok(ConfigType::TUIC),
        "wireGuard" => Ok(ConfigType::WireGuard),
        "http" => Ok(ConfigType::HTTP),
        "anytls" => Ok(ConfigType::Anytls),
        "naive" => Ok(ConfigType::Naive),
        "policyGroup" => Ok(ConfigType::PolicyGroup),
        "proxyChain" => Ok(ConfigType::ProxyChain),
        _ => Err(DbError::InvalidEnum {
            enum_name: "ConfigType",
            value: value.to_string(),
        }),
    }
}

fn row_to_profile_ex_joined(row: &SqliteRow) -> Result<ProfileExItem> {
    Ok(ProfileExItem {
        index_id: row.try_get("index_id")?,
        delay: row.try_get("ex_delay")?,
        speed: row.try_get("ex_speed")?,
        sort: row.try_get("ex_sort")?,
        message: row.try_get("ex_message")?,
        ip_info: row.try_get("ex_ip_info")?,
    })
}
