PRAGMA foreign_keys = OFF;

CREATE TABLE subscriptions_next (
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

INSERT INTO subscriptions_next (
    id, remarks, url, more_url, enabled, user_agent, sort, filter,
    convert_target, prev_profile, next_profile, pre_socks_port
)
SELECT
    id, remarks, url, more_url, enabled, user_agent, sort, filter,
    convert_target, prev_profile, next_profile, pre_socks_port
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_next RENAME TO subscriptions;
CREATE INDEX idx_subscriptions_sort ON subscriptions (sort);

PRAGMA foreign_keys = ON;
