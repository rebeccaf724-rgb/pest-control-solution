CREATE TABLE IF NOT EXISTS visits (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 ip TEXT NOT NULL,
 occurred_at INTEGER NOT NULL,
 landing_path TEXT NOT NULL,
 campaign_tag TEXT,
 click_id_kind TEXT,
 session_id TEXT NOT NULL,
 country TEXT,
 user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_ip_time ON visits(ip,occurred_at);
CREATE INDEX IF NOT EXISTS idx_visits_time ON visits(occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_session ON visits(ip,session_id);
CREATE TABLE IF NOT EXISTS reviews (
 ip TEXT PRIMARY KEY,
 status TEXT NOT NULL DEFAULT 'flagged',
 note TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exclusions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 ip TEXT NOT NULL,
 campaign_id TEXT NOT NULL,
 state TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 UNIQUE(ip,campaign_id)
);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT PRIMARY KEY, attempts INTEGER NOT NULL, last_at INTEGER NOT NULL);
