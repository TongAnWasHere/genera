CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cards (
    user_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    server_version INTEGER NOT NULL,
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL,
    card_kind TEXT NOT NULL,
    card_id TEXT NOT NULL,
    box INTEGER NOT NULL DEFAULT 1,
    due_date TEXT NOT NULL,
    last_reviewed TEXT,
    introduced_on TEXT,
    times_right INTEGER NOT NULL DEFAULT 0,
    times_wrong INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    server_version INTEGER NOT NULL,
    PRIMARY KEY (user_id, card_kind, card_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    daily_new_limit INTEGER NOT NULL DEFAULT 10,
    enabled_categories TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    server_version INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('global_version', 0);

CREATE INDEX IF NOT EXISTS idx_user_cards_sync ON user_cards (user_id, server_version);
CREATE INDEX IF NOT EXISTS idx_progress_sync ON progress (user_id, server_version);