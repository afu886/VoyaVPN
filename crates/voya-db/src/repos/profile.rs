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
        let protocol_extra = blob::protocol_extra_to_text(&item.protocol_extra)?;
        let transport_extra = blob::transport_extra_to_text(&item.transport_extra)?;

        sqlx::query(
            r#"
            INSERT INTO profile_items (
                index_id, config_type, config_version, subid, is_sub,
                pre_socks_port, display_log, remarks, address, port, password,
                username, network, stream_security, sni, alpn,
                public_key, short_id, spider_x, mldsa65_verify,
                cert, cert_sha, ech_config_list, finalmask,
                protocol_extra, transport_extra
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?
            )
            ON CONFLICT(index_id) DO UPDATE SET
                config_type = excluded.config_type,
                config_version = excluded.config_version,
                subid = excluded.subid,
                is_sub = excluded.is_sub,
                pre_socks_port = excluded.pre_socks_port,
                display_log = excluded.display_log,
                remarks = excluded.remarks,
                address = excluded.address,
                port = excluded.port,
                password = excluded.password,
                username = excluded.username,
                network = excluded.network,
                stream_security = excluded.stream_security,
                sni = excluded.sni,
                alpn = excluded.alpn,
                public_key = excluded.public_key,
                short_id = excluded.short_id,
                spider_x = excluded.spider_x,
                mldsa65_verify = excluded.mldsa65_verify,
                cert = excluded.cert,
                cert_sha = excluded.cert_sha,
                ech_config_list = excluded.ech_config_list,
                finalmask = excluded.finalmask,
                protocol_extra = excluded.protocol_extra,
                transport_extra = excluded.transport_extra
            "#,
        )
        .bind(&item.index_id)
        .bind(item.config_type.as_i32())
        .bind(item.config_version)
        .bind(&item.subid)
        .bind(item.is_sub)
        .bind(item.pre_socks_port)
        .bind(item.display_log)
        .bind(&item.remarks)
        .bind(&item.address)
        .bind(item.port)
        .bind(&item.password)
        .bind(&item.username)
        .bind(&item.network)
        .bind(&item.stream_security)
        .bind(&item.sni)
        .bind(&item.alpn)
        .bind(&item.public_key)
        .bind(&item.short_id)
        .bind(&item.spider_x)
        .bind(&item.mldsa65_verify)
        .bind(&item.cert)
        .bind(&item.cert_sha)
        .bind(&item.ech_config_list)
        .bind(&item.finalmask)
        .bind(protocol_extra)
        .bind(transport_extra)
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

    pub async fn list_by_subid(&self, subid: Option<&str>) -> Result<Vec<ProfileItem>> {
        let rows = if let Some(subid) = subid.filter(|value| !value.is_empty()) {
            sqlx::query(
                r#"
                SELECT p.*
                FROM profile_items p
                LEFT JOIN profile_ex_items e ON p.index_id = e.index_id
                WHERE p.subid = ?
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .bind(subid)
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
        subid: Option<&str>,
    ) -> Result<Vec<(ProfileItem, ProfileExItem)>> {
        let rows = if let Some(subid) = subid.filter(|value| !value.is_empty()) {
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
                WHERE p.subid = ?
                ORDER BY COALESCE(e.sort, 0), p.index_id
                "#,
            )
            .bind(subid)
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

    pub async fn delete_by_subid(&self, subid: &str, is_sub_only: bool) -> Result<u64> {
        let result = if is_sub_only {
            sqlx::query("DELETE FROM profile_items WHERE subid = ? AND is_sub = 1")
                .bind(subid)
                .execute(self.pool)
                .await?
        } else {
            sqlx::query("DELETE FROM profile_items WHERE subid = ?")
                .bind(subid)
                .execute(self.pool)
                .await?
        };

        Ok(result.rows_affected())
    }
}

fn row_to_profile(row: SqliteRow) -> Result<ProfileItem> {
    row_to_profile_ref(&row)
}

fn row_to_profile_ref(row: &SqliteRow) -> Result<ProfileItem> {
    let config_type_value = row.try_get::<i32, _>("config_type")?;
    let protocol_extra = row.try_get::<String, _>("protocol_extra")?;
    let transport_extra = row.try_get::<String, _>("transport_extra")?;

    Ok(ProfileItem {
        index_id: row.try_get("index_id")?,
        config_type: ConfigType::from_i32(config_type_value).ok_or(DbError::InvalidEnum {
            enum_name: "ConfigType",
            value: config_type_value,
        })?,
        config_version: row.try_get("config_version")?,
        subid: row.try_get("subid")?,
        is_sub: row.try_get("is_sub")?,
        pre_socks_port: row.try_get("pre_socks_port")?,
        display_log: row.try_get("display_log")?,
        remarks: row.try_get("remarks")?,
        address: row.try_get("address")?,
        port: row.try_get("port")?,
        password: row.try_get("password")?,
        username: row.try_get("username")?,
        network: row.try_get("network")?,
        stream_security: row.try_get("stream_security")?,
        sni: row.try_get("sni")?,
        alpn: row.try_get("alpn")?,
        public_key: row.try_get("public_key")?,
        short_id: row.try_get("short_id")?,
        spider_x: row.try_get("spider_x")?,
        mldsa65_verify: row.try_get("mldsa65_verify")?,
        cert: row.try_get("cert")?,
        cert_sha: row.try_get("cert_sha")?,
        ech_config_list: row.try_get("ech_config_list")?,
        finalmask: row.try_get("finalmask")?,
        protocol_extra: blob::protocol_extra_from_text(&protocol_extra)?,
        transport_extra: blob::transport_extra_from_text(&transport_extra)?,
    })
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
