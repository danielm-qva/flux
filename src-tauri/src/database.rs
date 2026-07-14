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

        CREATE TABLE IF NOT EXISTS saved_requests (
            id           TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL,
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
            UNIQUE(workspace_id, name COLLATE NOCASE)
        );

        CREATE INDEX IF NOT EXISTS idx_saved_requests_workspace
            ON saved_requests(workspace_id);
        ",
    )?;
    Ok(())
}
