use std::path::{Path, PathBuf};

use anyhow::Result;
use rusqlite::Connection;

pub struct DatabaseState {
    path: PathBuf,
}

impl DatabaseState {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn connect(&self) -> rusqlite::Result<Connection> {
        let connection = Connection::open(&self.path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(connection)
    }
}

pub fn initialize(path: &Path) -> Result<()> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY NOT NULL,
            name          TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
            email         TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS workspaces (
            id         TEXT PRIMARY KEY NOT NULL,
            user_id    TEXT NOT NULL,
            name       TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 60),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, name COLLATE NOCASE)
        );

        CREATE TABLE IF NOT EXISTS environments (
            id           TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
            color        TEXT NOT NULL DEFAULT '#8b5cf6',
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
        CREATE INDEX IF NOT EXISTS idx_environments_workspace ON environments(workspace_id);

        CREATE TABLE IF NOT EXISTS environment_variables (
            id             TEXT PRIMARY KEY NOT NULL,
            environment_id TEXT NOT NULL,
            key            TEXT NOT NULL CHECK(length(key) BETWEEN 1 AND 100),
            value          TEXT NOT NULL DEFAULT '',
            created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(environment_id) REFERENCES environments(id) ON DELETE CASCADE,
            UNIQUE(environment_id, key COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_environment_variables_environment
            ON environment_variables(environment_id);

        CREATE TABLE IF NOT EXISTS request_folders (
            id           TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            parent_id    TEXT,
            name         TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_id) REFERENCES request_folders(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, parent_id, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_request_folders_workspace
            ON request_folders(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_request_folders_parent
            ON request_folders(parent_id);

        CREATE TABLE IF NOT EXISTS saved_requests (
            id           TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            folder_id    TEXT,
            name         TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
            method       TEXT NOT NULL DEFAULT 'GET',
            url          TEXT NOT NULL DEFAULT '',
            params_json  TEXT NOT NULL DEFAULT '[]',
            headers_json TEXT NOT NULL DEFAULT '[]',
            auth_type    TEXT NOT NULL DEFAULT 'none',
            auth_json    TEXT NOT NULL DEFAULT '{}',
            body_type    TEXT NOT NULL DEFAULT 'json',
            body         TEXT NOT NULL DEFAULT '',
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(folder_id) REFERENCES request_folders(id) ON DELETE SET NULL,
            UNIQUE(workspace_id, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_saved_requests_workspace
            ON saved_requests(workspace_id);

        CREATE TABLE IF NOT EXISTS request_history (
            id               TEXT PRIMARY KEY NOT NULL,
            workspace_id     TEXT NOT NULL,
            request_id       TEXT,
            request_name     TEXT NOT NULL,
            method           TEXT NOT NULL,
            resolved_url     TEXT NOT NULL,
            status           INTEGER,
            status_text      TEXT NOT NULL DEFAULT '',
            duration_ms      INTEGER,
            size_bytes       INTEGER,
            response_headers TEXT NOT NULL DEFAULT '[]',
            response_body    TEXT NOT NULL DEFAULT '',
            error            TEXT,
            created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY(request_id) REFERENCES saved_requests(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_request_history_workspace_created
            ON request_history(workspace_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS request_flows (
            id           TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
            graph_json   TEXT NOT NULL DEFAULT '{\"nodes\":[],\"edges\":[]}',
            created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_request_flows_workspace
            ON request_flows(workspace_id);
        ",
    )?;

    let has_folder_id = connection
        .prepare("PRAGMA table_info(saved_requests)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|column| column == "folder_id");
    if !has_folder_id {
        connection.execute(
            "ALTER TABLE saved_requests ADD COLUMN folder_id TEXT REFERENCES request_folders(id) ON DELETE SET NULL",
            [],
        )?;
    }
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_requests_folder ON saved_requests(folder_id)",
        [],
    )?;
    Ok(())
}
