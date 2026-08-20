CREATE TABLE profile_items (
    index_id TEXT PRIMARY KEY NOT NULL,
    config_type TEXT NOT NULL,
    subscription_id TEXT,
    display_log INTEGER NOT NULL DEFAULT 1 CHECK (display_log IN (0, 1)),
    remarks TEXT NOT NULL DEFAULT '',
    protocol TEXT NOT NULL,
    transport TEXT,
    tls TEXT,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX idx_profile_items_subscription_id ON profile_items (subscription_id);
CREATE INDEX idx_profile_items_config_type ON profile_items (config_type);

CREATE TABLE profile_ex_items (
    index_id TEXT PRIMARY KEY NOT NULL,
    delay INTEGER NOT NULL DEFAULT 0,
    speed REAL NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    ip_info TEXT,
    FOREIGN KEY (index_id) REFERENCES profile_items(index_id) ON DELETE CASCADE
);

CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    remarks TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    more_url TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    user_agent TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    filter TEXT,
    convert_target TEXT,
    pre_socks_port INTEGER
);

CREATE INDEX idx_subscriptions_sort ON subscriptions (sort);

CREATE TABLE routing_items (
    id TEXT PRIMARY KEY NOT NULL,
    remarks TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    rule_set TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    custom_icon TEXT NOT NULL DEFAULT '',
    custom_ruleset_path4_singbox TEXT NOT NULL DEFAULT '',
    domain_strategy TEXT NOT NULL DEFAULT '',
    domain_strategy4_singbox TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_routing_items_sort ON routing_items (sort);

CREATE TABLE server_stat_items (
    index_id TEXT PRIMARY KEY NOT NULL,
    total_up INTEGER NOT NULL DEFAULT 0,
    total_down INTEGER NOT NULL DEFAULT 0,
    today_up INTEGER NOT NULL DEFAULT 0,
    today_down INTEGER NOT NULL DEFAULT 0,
    date_now INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (index_id) REFERENCES profile_items(index_id) ON DELETE CASCADE
);

CREATE TABLE app_state (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    active_profile_id TEXT,
    active_routing_id TEXT,
    FOREIGN KEY (active_profile_id) REFERENCES profile_items(index_id) ON DELETE SET NULL,
    FOREIGN KEY (active_routing_id) REFERENCES routing_items(id) ON DELETE SET NULL
);

INSERT INTO app_state (id, active_profile_id, active_routing_id)
VALUES (1, NULL, NULL);
CREATE TABLE schema_metadata (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version = 1)
);

INSERT INTO schema_metadata (id, version) VALUES (1, 1);

CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    payload TEXT NOT NULL
);
