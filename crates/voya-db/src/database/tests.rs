use std::time::{SystemTime, UNIX_EPOCH};

use crate::AppConfigStore;
use sqlx::Row;
use voya_core::{
    AppConfig, ConfigType, ProfileExItem, ProfileItem, ProtocolExtraItem, RoutingItem, RuleType,
    RulesItem, ServerStatItem, SubItem, SysProxyType, TransportExtraItem,
};

use super::*;

#[test]
fn database_name_is_voyavpn_specific() {
    assert_eq!(DATABASE_NAME, "voyavpn.sqlite");
}

#[tokio::test]
async fn migrated_profile_schema_omits_obsolete_columns() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let rows = sqlx::query("PRAGMA table_info(profile_items)")
        .fetch_all(database.pool())
        .await
        .expect("database test operation should succeed");
    let columns = rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();

    for obsolete in [
        "header_type",
        "request_host",
        "path",
        "extra",
        "ports",
        "alter_id",
        "flow",
        "id",
        "security",
        "core_type",
        "allow_insecure",
        "fingerprint",
        "mux_enabled",
    ] {
        assert!(
            !columns.iter().any(|column| column == obsolete),
            "{obsolete} should be absent"
        );
    }

    assert!(columns.iter().any(|column| column == "protocol_extra"));
    assert!(columns.iter().any(|column| column == "transport_extra"));
}

#[tokio::test]
async fn retired_raw_dns_and_full_template_tables_are_absent() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('dns_items', 'full_config_template_items')",
    )
        .fetch_all(database.pool())
        .await
        .expect("database test operation should succeed");

    assert!(rows.is_empty());
}

#[tokio::test]
async fn convergence_migration_discards_node_overrides_and_raw_configuration() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("database test operation should succeed");
    sqlx::raw_sql(include_str!("../../migrations/0001_fresh_schema.sql"))
        .execute(&pool)
        .await
        .expect("initial schema should apply");
    sqlx::raw_sql(include_str!(
        "../../migrations/0002_drop_core_type_columns.sql"
    ))
    .execute(&pool)
    .await
    .expect("second migration should apply");
    sqlx::query(
        r#"INSERT INTO profile_items (
            index_id, config_type, allow_insecure, fingerprint, mux_enabled, protocol_extra
        ) VALUES ('legacy', 7, 'true', 'firefox', 1,
            '{"UpMbps":80,"DownMbps":160,"HopInterval":"20","Ports":"443-445"}')"#,
    )
    .execute(&pool)
    .await
    .expect("legacy profile should insert");
    sqlx::query(
        "INSERT INTO dns_items (id, remarks, enabled, use_system_hosts) VALUES ('dns', 'raw', 1, 0)",
    )
    .execute(&pool)
    .await
    .expect("legacy DNS should insert");
    sqlx::query(
        "INSERT INTO full_config_template_items (id, remarks, enabled) VALUES ('template', 'raw', 1)",
    )
    .execute(&pool)
    .await
    .expect("legacy template should insert");

    sqlx::raw_sql(include_str!(
        "../../migrations/0003_converge_global_profile_dns_templates.sql"
    ))
    .execute(&pool)
    .await
    .expect("convergence migration should apply");

    let protocol_extra: String =
        sqlx::query_scalar("SELECT protocol_extra FROM profile_items WHERE index_id = 'legacy'")
            .fetch_one(&pool)
            .await
            .expect("migrated profile should remain");
    let extra: serde_json::Value =
        serde_json::from_str(&protocol_extra).expect("protocol extra should remain valid JSON");
    assert_eq!(
        extra.get("Ports").and_then(serde_json::Value::as_str),
        Some("443-445")
    );
    for retired in ["UpMbps", "DownMbps", "HopInterval"] {
        assert!(extra.get(retired).is_none(), "{retired} should be removed");
    }
    let retired_tables: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('dns_items', 'full_config_template_items')",
    )
    .fetch_one(&pool)
    .await
    .expect("table catalog should be readable");
    assert_eq!(retired_tables, 0);
}

#[tokio::test]
async fn subscription_cleanup_migration_preserves_current_columns_and_rows() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("database test operation should succeed");
    for migration in [
        include_str!("../../migrations/0001_fresh_schema.sql"),
        include_str!("../../migrations/0002_drop_core_type_columns.sql"),
        include_str!("../../migrations/0003_converge_global_profile_dns_templates.sql"),
    ] {
        sqlx::raw_sql(migration)
            .execute(&pool)
            .await
            .expect("pre-cleanup migration should apply");
    }
    sqlx::query(
        r#"INSERT INTO subscriptions (
            id, remarks, url, more_url, enabled, user_agent, sort, filter,
            auto_update_interval, update_time, convert_target, prev_profile,
            next_profile, pre_socks_port, memo
        ) VALUES ('sub', 'Kept', 'https://example.test/sub', 'https://example.test/more',
            1, 'Voya/Test', 7, 'US', 30, 123, 'singbox', 'before', 'after', 1080, 'legacy')"#,
    )
    .execute(&pool)
    .await
    .expect("legacy subscription should insert");

    sqlx::raw_sql(include_str!(
        "../../migrations/0004_remove_subscription_scheduler_columns.sql"
    ))
    .execute(&pool)
    .await
    .expect("subscription cleanup migration should apply");

    let columns = sqlx::query("PRAGMA table_info(subscriptions)")
        .fetch_all(&pool)
        .await
        .expect("subscription schema should be readable")
        .into_iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();
    for removed in ["auto_update_interval", "update_time", "memo"] {
        assert!(!columns.iter().any(|column| column == removed));
    }

    let row = sqlx::query("SELECT * FROM subscriptions WHERE id = 'sub'")
        .fetch_one(&pool)
        .await
        .expect("migrated subscription should remain");
    assert_eq!(row.get::<String, _>("id"), "sub");
    assert_eq!(row.get::<String, _>("remarks"), "Kept");
    assert_eq!(row.get::<String, _>("url"), "https://example.test/sub");
    assert_eq!(
        row.get::<String, _>("more_url"),
        "https://example.test/more"
    );
    assert_eq!(row.get::<i32, _>("enabled"), 1);
    assert_eq!(row.get::<String, _>("user_agent"), "Voya/Test");
    assert_eq!(row.get::<i32, _>("sort"), 7);
    assert_eq!(
        row.get::<Option<String>, _>("filter").as_deref(),
        Some("US")
    );
    assert_eq!(row.get::<String, _>("convert_target"), "singbox");
    assert_eq!(
        row.get::<Option<String>, _>("prev_profile").as_deref(),
        Some("before")
    );
    assert_eq!(
        row.get::<Option<String>, _>("next_profile").as_deref(),
        Some("after")
    );
    assert_eq!(row.get::<Option<i32>, _>("pre_socks_port"), Some(1080));
}

#[tokio::test]
async fn statistics_repository_rolls_over_cleans_orphans_and_clones() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let mut source = sample_profile();
    source.index_id = "source".to_string();
    let mut clone = sample_profile();
    clone.index_id = "clone".to_string();
    database
        .profiles()
        .upsert(&source)
        .await
        .expect("database test operation should succeed");
    database
        .profiles()
        .upsert(&clone)
        .await
        .expect("database test operation should succeed");

    database
        .server_stats()
        .upsert(&ServerStatItem {
            index_id: "source".to_string(),
            total_up: 1000,
            total_down: 2000,
            today_up: 300,
            today_down: 400,
            date_now: 1,
        })
        .await
        .expect("database test operation should succeed");
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(database.pool())
        .await
        .expect("database test operation should succeed");
    database
        .server_stats()
        .upsert(&ServerStatItem {
            index_id: "orphan".to_string(),
            total_up: 1,
            total_down: 1,
            today_up: 1,
            today_down: 1,
            date_now: 1,
        })
        .await
        .expect("database test operation should succeed");
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(database.pool())
        .await
        .expect("database test operation should succeed");

    let orphaned = database
        .server_stats()
        .delete_orphans()
        .await
        .expect("database test operation should succeed");
    assert_eq!(orphaned, 1);
    database
        .server_stats()
        .reset_rollover(2)
        .await
        .expect("database test operation should succeed");
    let rolled = database
        .server_stats()
        .get("source")
        .await
        .expect("database test operation should succeed")
        .expect("database test operation should succeed");
    assert_eq!(rolled.today_up, 0);
    assert_eq!(rolled.today_down, 0);
    assert_eq!(rolled.total_up, 1000);
    assert_eq!(rolled.total_down, 2000);
    assert_eq!(rolled.date_now, 2);

    let cloned = database
        .server_stats()
        .clone_stat("source", "clone")
        .await
        .expect("database test operation should succeed")
        .expect("database test operation should succeed");
    assert_eq!(cloned.index_id, "clone");
    assert_eq!(cloned.total_up, 1000);
    assert_eq!(cloned.total_down, 2000);

    let updated = database
        .server_stats()
        .add_traffic("clone", 3, 50, 70)
        .await
        .expect("database test operation should succeed");
    assert_eq!(updated.today_up, 50);
    assert_eq!(updated.today_down, 70);
    assert_eq!(updated.total_up, 1050);
    assert_eq!(updated.total_down, 2070);
    assert_eq!(updated.date_now, 3);
}

#[tokio::test]
async fn profile_repository_persists_typed_extra_blobs() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let profile = sample_profile();

    database
        .profiles()
        .upsert(&profile)
        .await
        .expect("database test operation should succeed");
    let loaded = database
        .profiles()
        .get("profile-1")
        .await
        .expect("database test operation should succeed")
        .expect("database test operation should succeed");

    assert_eq!(loaded, profile);

    let raw_protocol_extra: String =
        sqlx::query_scalar("SELECT protocol_extra FROM profile_items WHERE index_id = ?")
            .bind("profile-1")
            .fetch_one(database.pool())
            .await
            .expect("database test operation should succeed");

    assert_eq!(
        raw_protocol_extra,
        r#"{"SsMethod":"2022-blake3-aes-256-gcm","Ports":"443,8443"}"#
    );
}

#[tokio::test]
async fn file_database_persists_profile_across_pool_restart() {
    let path = temp_path("restart.sqlite");
    let profile = sample_profile();

    let first = Database::connect(&path)
        .await
        .expect("database test operation should succeed");
    first
        .profiles()
        .upsert(&profile)
        .await
        .expect("database test operation should succeed");
    first.close().await;

    let second = Database::connect(&path)
        .await
        .expect("database test operation should succeed");
    let loaded = second
        .profiles()
        .get("profile-1")
        .await
        .expect("database test operation should succeed")
        .expect("database test operation should succeed");

    assert_eq!(loaded, profile);
    second.close().await;
    let _ = fs::remove_file(path);
}

#[tokio::test]
async fn profile_repository_orders_by_profile_ex_sort() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let mut first = sample_profile();
    first.index_id = "first".to_string();
    first.subid = "old".to_string();
    let mut second = sample_profile();
    second.index_id = "second".to_string();
    second.subid = "old".to_string();

    database
        .profiles()
        .upsert(&first)
        .await
        .expect("database test operation should succeed");
    database
        .profiles()
        .upsert(&second)
        .await
        .expect("database test operation should succeed");
    database
        .profile_exs()
        .upsert(&ProfileExItem {
            index_id: "first".to_string(),
            sort: 20,
            ..ProfileExItem::default()
        })
        .await
        .expect("database test operation should succeed");
    database
        .profile_exs()
        .upsert(&ProfileExItem {
            index_id: "second".to_string(),
            sort: 10,
            ..ProfileExItem::default()
        })
        .await
        .expect("database test operation should succeed");

    let ordered = database
        .profiles()
        .list_with_profile_ex(None)
        .await
        .expect("database test operation should succeed");
    assert_eq!(ordered[0].0.index_id, "second");
    assert_eq!(ordered[0].1.sort, 10);
}

#[tokio::test]
async fn profile_batch_delete_rolls_back_on_mid_batch_error() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let mut first = sample_profile();
    first.index_id = "first".to_string();
    first.subid = "old".to_string();
    let mut second = sample_profile();
    second.index_id = "second".to_string();
    second.subid = "old".to_string();

    database
        .profiles()
        .upsert(&first)
        .await
        .expect("database test operation should succeed");
    database
        .profiles()
        .upsert(&second)
        .await
        .expect("database test operation should succeed");
    sqlx::query(
        r#"
            CREATE TRIGGER reject_second_profile_delete
            BEFORE DELETE ON profile_items
            WHEN OLD.index_id = 'second'
            BEGIN
                SELECT RAISE(ABORT, 'blocked profile delete');
            END
            "#,
    )
    .execute(database.pool())
    .await
    .expect("database test operation should succeed");

    let delete_error = database
        .profiles()
        .delete_many(&["first".to_string(), "second".to_string()])
        .await;
    assert!(delete_error.is_err());
    assert!(database
        .profiles()
        .exists("first")
        .await
        .expect("database test operation should succeed"));
    assert!(database
        .profiles()
        .exists("second")
        .await
        .expect("database test operation should succeed"));
}

#[tokio::test]
async fn profile_ex_repository_cascades_with_profile_deletes() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let profile = sample_profile();

    database
        .profiles()
        .upsert(&profile)
        .await
        .expect("database test operation should succeed");
    database
        .profile_exs()
        .upsert(&ProfileExItem {
            index_id: profile.index_id.clone(),
            delay: 42,
            sort: 10,
            ..ProfileExItem::default()
        })
        .await
        .expect("database test operation should succeed");
    assert!(database
        .profile_exs()
        .get(&profile.index_id)
        .await
        .expect("database test operation should succeed")
        .is_some());

    assert!(database
        .profiles()
        .delete(&profile.index_id)
        .await
        .expect("database test operation should succeed"));
    assert!(database
        .profile_exs()
        .get(&profile.index_id)
        .await
        .expect("database test operation should succeed")
        .is_none());
}

#[tokio::test]
async fn subscription_repository_persists_orders_and_deletes_sub_profiles() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let first = SubItem {
        id: "sub-a".to_string(),
        remarks: "A".to_string(),
        url: "https://example.test/a".to_string(),
        sort: 20,
        filter: Some("US|JP".to_string()),
        convert_target: Some("clash".to_string()),
        ..SubItem::default()
    };
    let second = SubItem {
        id: "sub-b".to_string(),
        remarks: "B".to_string(),
        url: "https://example.test/b".to_string(),
        sort: 10,
        ..SubItem::default()
    };
    database
        .subscriptions()
        .upsert(&first)
        .await
        .expect("database test operation should succeed");
    database
        .subscriptions()
        .upsert(&second)
        .await
        .expect("database test operation should succeed");

    let listed = database
        .subscriptions()
        .list()
        .await
        .expect("database test operation should succeed");
    assert_eq!(listed[0].id, "sub-b");
    assert_eq!(listed[1], first);
    assert_eq!(
        database
            .subscriptions()
            .max_sort()
            .await
            .expect("database test operation should succeed"),
        20
    );
    assert_eq!(
        database
            .subscriptions()
            .get_by_url("https://example.test/a")
            .await
            .expect("database test operation should succeed")
            .expect("database test operation should succeed")
            .id,
        "sub-a"
    );

    let mut profile = sample_profile();
    profile.index_id = "sub-profile".to_string();
    profile.subid = "sub-a".to_string();
    profile.is_sub = true;
    database
        .profiles()
        .upsert(&profile)
        .await
        .expect("database test operation should succeed");
    let deleted = database
        .profiles()
        .delete_by_subid("sub-a", true)
        .await
        .expect("database test operation should succeed");
    assert_eq!(deleted, 1);
    assert!(database
        .profiles()
        .get("sub-profile")
        .await
        .expect("database test operation should succeed")
        .is_none());

    assert!(database
        .subscriptions()
        .delete("sub-a")
        .await
        .expect("database test operation should succeed"));
    assert!(database
        .subscriptions()
        .get("sub-a")
        .await
        .expect("database test operation should succeed")
        .is_none());
}

#[tokio::test]
async fn routing_repository_serializes_rules_and_enforces_active_selection() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let first = RoutingItem {
        id: "routing-a".to_string(),
        remarks: "A".to_string(),
        sort: 20,
        is_active: true,
        domain_strategy: "AsIs".to_string(),
        rule_set: vec![RulesItem {
            id: "rule-a".to_string(),
            outbound_tag: Some("direct".to_string()),
            domain: Some(vec!["full:direct.example.com".to_string()]),
            rule_type: Some(RuleType::Routing),
            ..RulesItem::default()
        }],
        ..RoutingItem::default()
    };
    let second = RoutingItem {
        id: "routing-b".to_string(),
        remarks: "B".to_string(),
        sort: 10,
        ..RoutingItem::default()
    };

    database
        .routings()
        .upsert(&first)
        .await
        .expect("database test operation should succeed");
    database
        .routings()
        .upsert(&second)
        .await
        .expect("database test operation should succeed");

    let listed = database
        .routings()
        .list()
        .await
        .expect("database test operation should succeed");
    assert_eq!(listed[0].id, "routing-b");
    assert_eq!(listed[1].rule_num, 1);
    assert_eq!(
        listed[1].rule_set[0].domain.clone(),
        Some(vec!["full:direct.example.com".to_string()])
    );
    assert_eq!(
        database
            .routings()
            .active()
            .await
            .expect("database test operation should succeed")
            .expect("database test operation should succeed")
            .id,
        "routing-a"
    );

    assert!(database
        .routings()
        .set_active("routing-b")
        .await
        .expect("database test operation should succeed"));
    assert_eq!(
        database
            .routings()
            .active()
            .await
            .expect("database test operation should succeed")
            .expect("database test operation should succeed")
            .id,
        "routing-b"
    );
    assert!(database
        .routings()
        .delete("routing-a")
        .await
        .expect("database test operation should succeed"));
    assert!(database
        .routings()
        .get("routing-a")
        .await
        .expect("database test operation should succeed")
        .is_none());
}

#[tokio::test]
async fn routing_delete_many_rolls_back_on_mid_batch_error() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let first = RoutingItem {
        id: "routing-a".to_string(),
        remarks: "A".to_string(),
        ..RoutingItem::default()
    };
    let second = RoutingItem {
        id: "routing-b".to_string(),
        remarks: "B".to_string(),
        ..RoutingItem::default()
    };

    database
        .routings()
        .upsert(&first)
        .await
        .expect("database test operation should succeed");
    database
        .routings()
        .upsert(&second)
        .await
        .expect("database test operation should succeed");
    sqlx::query(
        r#"
            CREATE TRIGGER reject_second_routing_delete
            BEFORE DELETE ON routing_items
            WHEN OLD.id = 'routing-b'
            BEGIN
                SELECT RAISE(ABORT, 'blocked routing delete');
            END
            "#,
    )
    .execute(database.pool())
    .await
    .expect("database test operation should succeed");

    let delete_error = database
        .routings()
        .delete_many(&["routing-a".to_string(), "routing-b".to_string()])
        .await;
    assert!(delete_error.is_err());
    assert!(database
        .routings()
        .exists("routing-a")
        .await
        .expect("database test operation should succeed"));
    assert!(database
        .routings()
        .exists("routing-b")
        .await
        .expect("database test operation should succeed"));
}

#[test]
fn app_config_store_defaults_and_persists_across_restart() {
    let path = temp_path("guiNConfig.json");
    let store = AppConfigStore::new(&path);
    let mut config = store
        .load()
        .expect("database test operation should succeed");

    assert_eq!(config.inbound[0].local_port, 10808);
    config.index_id = "active-profile".to_string();
    config.ui_item.current_language = "fa-Ir".to_string();
    config.system_proxy_item.sys_proxy_type = SysProxyType::Unchanged;
    store
        .save(&config)
        .expect("database test operation should succeed");

    let restarted_store = AppConfigStore::new(&path);
    let loaded = restarted_store
        .load()
        .expect("database test operation should succeed");

    assert_eq!(loaded.index_id, "active-profile");
    assert_eq!(loaded.ui_item.current_language, "fa-Ir");
    assert_eq!(
        loaded.system_proxy_item.sys_proxy_type,
        SysProxyType::Unchanged
    );
    let _ = fs::remove_file(path);
}

#[test]
fn app_config_store_converges_retired_voya_fields_and_preserves_live_settings() {
    let path = temp_path("guiNConfig-retired-fields.json");
    let mut value =
        serde_json::to_value(AppConfig::default()).expect("default app config should serialize");
    *value
        .pointer_mut("/IndexId")
        .expect("default profile index should exist") = serde_json::json!("active-profile");
    *value
        .pointer_mut("/TunModeItem/EnableTun")
        .expect("default TUN setting should exist") = serde_json::json!(true);
    *value
        .pointer_mut("/UIItem/CurrentLanguage")
        .expect("default language should exist") = serde_json::json!("zh-Hans");

    let root = value
        .as_object_mut()
        .expect("app config JSON should be an object");
    for key in [
        "KcpItem",
        "MsgUIItem",
        "Mux4RayItem",
        "CheckUpdateItem",
        "DiagnosticsItem",
        "Fragment4RayItem",
    ] {
        root.insert(key.to_string(), serde_json::json!({}));
    }
    for (pointer, fields) in [
        ("/TunModeItem", &["EnableLegacyProtect"][..]),
        ("/GrpcItem", &["InitialWindowsSize"]),
        (
            "/GUIItem",
            &[
                "KeepOlderDedupl",
                "AutoUpdateInterval",
                "TrayMenuServersLimit",
                "EnableHWA",
                "EnableLog",
            ],
        ),
        (
            "/UIItem",
            &[
                "EnableAutoAdjustMainLvColWidth",
                "MainGirdHeight1",
                "MainGirdHeight2",
                "MainGirdOrientation",
                "ColorPrimaryName",
                "EnableDragDropSort",
                "DoubleClick2Activate",
                "AutoHideStartup",
                "Hide2TrayWhenClose",
                "MacOSShowInDock",
                "MainColumnItem",
                "WindowSizeItem",
            ],
        ),
        (
            "/ConstItem",
            &["CdnBaseUrl", "CdnReleaseIndexUrl", "CdnCoreManifestUrl"],
        ),
        (
            "/ProxyUIItem",
            &[
                "RuleMode",
                "EnableIPv6",
                "EnableMixinContent",
                "ProxiesSorting",
                "ProxiesAutoRefresh",
                "ProxiesAutoDelayTestInterval",
                "ConnectionsAutoRefresh",
                "ConnectionsRefreshInterval",
                "ConnectionsColumnItem",
            ],
        ),
        ("/Inbound/0", &["UdpEnabled", "DestOverride", "RouteOnly"]),
    ] {
        let section = value
            .pointer_mut(pointer)
            .and_then(serde_json::Value::as_object_mut)
            .expect("retired field parent should be an object");
        for field in fields {
            section.insert((*field).to_string(), serde_json::json!(false));
        }
    }
    fs::write(
        &path,
        serde_json::to_vec_pretty(&value).expect("retired app config should serialize"),
    )
    .expect("retired app config fixture should be written");

    let loaded = AppConfigStore::new(&path)
        .load()
        .expect("retired Voya config should converge");

    assert_eq!(loaded.index_id, "active-profile");
    assert!(loaded.tun_mode_item.enable_tun);
    assert_eq!(loaded.ui_item.current_language, "zh-Hans");

    let persisted = fs::read_to_string(&path).expect("converged app config should be readable");
    let persisted_value: serde_json::Value =
        serde_json::from_str(&persisted).expect("converged app config should remain valid JSON");
    assert!(persisted_value.get("KcpItem").is_none());
    assert!(persisted_value
        .pointer("/TunModeItem/EnableLegacyProtect")
        .is_none());
    assert!(persisted_value.pointer("/Inbound/0/UdpEnabled").is_none());
    serde_json::from_value::<AppConfig>(persisted_value)
        .expect("converged app config should match the current strict schema");

    let _ = fs::remove_file(path);
}

#[test]
fn app_config_store_rejects_old_schema_without_changing_the_file() {
    let path = temp_path("guiNConfig-invalid.json");
    let original = br#"{"CoreBasicItem":{"Loglevel":"debug"},"EnableLegacyProtect":true}"#;
    fs::write(&path, original).expect("invalid app config fixture should be written");

    let store = AppConfigStore::new(&path);
    assert!(store.load().is_err());
    assert_eq!(
        fs::read(&path).expect("invalid app config fixture should remain readable"),
        original
    );

    let _ = fs::remove_file(path);
}

fn sample_profile() -> ProfileItem {
    ProfileItem {
        index_id: "profile-1".to_string(),
        config_type: ConfigType::Shadowsocks,
        remarks: "Demo".to_string(),
        address: "example.com".to_string(),
        port: 443,
        password: "secret".to_string(),
        network: "ws".to_string(),
        stream_security: "tls".to_string(),
        sni: "example.com".to_string(),
        protocol_extra: ProtocolExtraItem {
            ss_method: Some("2022-blake3-aes-256-gcm".to_string()),
            ports: Some("443,8443".to_string()),
            ..ProtocolExtraItem::default()
        },
        transport_extra: TransportExtraItem {
            host: Some("example.com".to_string()),
            path: Some("/ws".to_string()),
            ..TransportExtraItem::default()
        },
        ..ProfileItem::default()
    }
}

fn temp_path(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("database test operation should succeed")
        .as_nanos();
    let root = std::env::temp_dir().join("voyavpn-tests");
    fs::create_dir_all(&root).expect("database test directory should exist");

    root.join(format!("{}-{}-{name}", std::process::id(), nanos))
}
