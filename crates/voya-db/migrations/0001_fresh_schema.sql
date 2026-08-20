CREATE TABLE profile_items (
    index_id TEXT PRIMARY KEY NOT NULL,
    config_type INTEGER NOT NULL,
    config_version INTEGER NOT NULL DEFAULT 4,
    subid TEXT NOT NULL DEFAULT '',
    is_sub INTEGER NOT NULL DEFAULT 1 CHECK (is_sub IN (0, 1)),
    pre_socks_port INTEGER,
    display_log INTEGER NOT NULL DEFAULT 1 CHECK (display_log IN (0, 1)),
    remarks TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 0,
    password TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    network TEXT NOT NULL DEFAULT '',
    stream_security TEXT NOT NULL DEFAULT '',
    sni TEXT NOT NULL DEFAULT '',
    alpn TEXT NOT NULL DEFAULT '',
    public_key TEXT NOT NULL DEFAULT '',
    short_id TEXT NOT NULL DEFAULT '',
    spider_x TEXT NOT NULL DEFAULT '',
    mldsa65_verify TEXT NOT NULL DEFAULT '',
    cert TEXT NOT NULL DEFAULT '',
    cert_sha TEXT NOT NULL DEFAULT '',
    ech_config_list TEXT NOT NULL DEFAULT '',
    finalmask TEXT NOT NULL DEFAULT '',
    protocol_extra TEXT NOT NULL DEFAULT '{}',
    transport_extra TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_profile_items_subid ON profile_items (subid);
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
    prev_profile TEXT,
    next_profile TEXT,
    pre_socks_port INTEGER
);

CREATE INDEX idx_subscriptions_sort ON subscriptions (sort);

CREATE TABLE routing_items (
    id TEXT PRIMARY KEY NOT NULL,
    remarks TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    rule_set TEXT NOT NULL DEFAULT '[]',
    rule_num INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    custom_icon TEXT NOT NULL DEFAULT '',
    custom_ruleset_path4_singbox TEXT NOT NULL DEFAULT '',
    domain_strategy TEXT NOT NULL DEFAULT '',
    domain_strategy4_singbox TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1))
);

CREATE INDEX idx_routing_items_active ON routing_items (is_active);
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
