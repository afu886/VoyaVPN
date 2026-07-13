use std::time::{SystemTime, UNIX_EPOCH};

use crate::AppConfigStore;
use sqlx::Row;
use voya_core::{
    ConfigType, FullConfigTemplateItem, ProfileExItem, ProfileItem, ProtocolExtraItem, RoutingItem,
    RuleType, RulesItem, ServerStatItem, SubItem, SysProxyType, TransportExtraItem,
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
async fn full_config_template_repository_round_trips_default_template() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let item = FullConfigTemplateItem {
        id: "template-sing-box".to_string(),
        remarks: "sing-box template".to_string(),
        enabled: true,
        config: Some(r#"{"outbounds":[]}"#.to_string()),
        tun_config: Some(r#"{"inbounds":[]}"#.to_string()),
        add_proxy_only: Some(true),
        proxy_detour: Some("proxy".to_string()),
    };

    database
        .full_config_templates()
        .upsert(&item)
        .await
        .expect("database test operation should succeed");
    let loaded = database
        .full_config_templates()
        .get_default()
        .await
        .expect("database test operation should succeed")
        .expect("template should be present");

    assert_eq!(loaded, item);
}

#[tokio::test]
async fn dns_schema_omits_core_type_column() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let rows = sqlx::query("PRAGMA table_info(dns_items)")
        .fetch_all(database.pool())
        .await
        .expect("database test operation should succeed");
    let columns = rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();

    assert!(!columns.iter().any(|column| column == "core_type"));
}

#[tokio::test]
async fn full_config_template_schema_omits_core_type_column() {
    let database = Database::connect_in_memory()
        .await
        .expect("database test operation should succeed");
    let rows = sqlx::query("PRAGMA table_info(full_config_template_items)")
        .fetch_all(database.pool())
        .await
        .expect("database test operation should succeed");
    let columns = rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();

    assert!(!columns.iter().any(|column| column == "core_type"));
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
async fn profile_repository_orders_by_profile_ex_sort_and_updates_groups() {
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

    let updated = database
        .profiles()
        .update_subid_many(&["first".to_string(), "second".to_string()], "new")
        .await
        .expect("database test operation should succeed");
    assert_eq!(updated, 2);
    assert_eq!(
        database
            .profiles()
            .list_by_subid(Some("new"))
            .await
            .expect("database test operation should succeed")
            .len(),
        2
    );
}

#[tokio::test]
async fn profile_batch_operations_roll_back_on_mid_batch_error() {
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
            CREATE TRIGGER reject_second_profile_subid_update
            BEFORE UPDATE OF subid ON profile_items
            WHEN OLD.index_id = 'second'
            BEGIN
                SELECT RAISE(ABORT, 'blocked profile update');
            END
            "#,
    )
    .execute(database.pool())
    .await
    .expect("database test operation should succeed");

    let update_error = database
        .profiles()
        .update_subid_many(&["first".to_string(), "second".to_string()], "new")
        .await;
    assert!(update_error.is_err());
    assert_eq!(
        database
            .profiles()
            .get("first")
            .await
            .expect("database test operation should succeed")
            .expect("database test operation should succeed")
            .subid,
        "old"
    );
    assert_eq!(
        database
            .profiles()
            .get("second")
            .await
            .expect("database test operation should succeed")
            .expect("database test operation should succeed")
            .subid,
        "old"
    );

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
        auto_update_interval: 30,
        update_time: 123,
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

    std::env::temp_dir().join("voyavpn-tests").join(format!(
        "{}-{}-{name}",
        std::process::id(),
        nanos
    ))
}
