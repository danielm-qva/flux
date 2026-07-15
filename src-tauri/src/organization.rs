use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFolder {
    id: String,
    workspace_id: String,
    parent_id: Option<String>,
    name: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    id: String,
    workspace_id: String,
    request_id: Option<String>,
    request_name: String,
    method: String,
    resolved_url: String,
    status: Option<u16>,
    status_text: String,
    duration_ms: Option<u64>,
    size_bytes: Option<usize>,
    response_headers: String,
    response_body: String,
    error: Option<String>,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInput {
    user_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    user_id: String,
    workspace_id: String,
    parent_id: Option<String>,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderInput {
    user_id: String,
    folder_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInput {
    user_id: String,
    folder_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordHistoryInput {
    user_id: String,
    workspace_id: String,
    request_id: Option<String>,
    request_name: String,
    method: String,
    resolved_url: String,
    status: Option<u16>,
    status_text: Option<String>,
    duration_ms: Option<u64>,
    size_bytes: Option<usize>,
    response_headers: Option<String>,
    response_body: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub fn list_request_folders(
    state: State<'_, DatabaseState>,
    input: WorkspaceInput,
) -> Result<Vec<RequestFolder>, String> {
    let connection = state.connect().map_err(db_error)?;
    ensure_workspace(&connection, &input.user_id, &input.workspace_id)?;
    let mut statement = connection.prepare(
        "SELECT id, workspace_id, parent_id, name, created_at, updated_at FROM request_folders WHERE workspace_id = ?1 ORDER BY name COLLATE NOCASE"
    ).map_err(db_error)?;
    let items = statement
        .query_map([input.workspace_id], map_folder)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(items)
}

#[tauri::command]
pub fn create_request_folder(
    state: State<'_, DatabaseState>,
    input: CreateFolderInput,
) -> Result<RequestFolder, String> {
    let name = validate_name(&input.name)?;
    let connection = state.connect().map_err(db_error)?;
    ensure_workspace(&connection, &input.user_id, &input.workspace_id)?;
    if let Some(parent_id) = &input.parent_id {
        let valid = connection
            .query_row(
                "SELECT 1 FROM request_folders WHERE id = ?1 AND workspace_id = ?2",
                params![parent_id, input.workspace_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(db_error)?
            .is_some();
        if !valid {
            return Err("La carpeta padre no pertenece a este workspace.".to_string());
        }
    }
    let duplicate = connection
        .query_row(
            "SELECT 1 FROM request_folders WHERE workspace_id = ?1 AND parent_id IS ?2 AND name = ?3 COLLATE NOCASE",
            params![input.workspace_id, input.parent_id, name],
            |_| Ok(()),
        )
        .optional()
        .map_err(db_error)?
        .is_some();
    if duplicate {
        return Err("Ya existe una carpeta con ese nombre en este nivel.".to_string());
    }
    let id = Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO request_folders (id, workspace_id, parent_id, name) VALUES (?1, ?2, ?3, ?4)",
        params![id, input.workspace_id, input.parent_id, name]
    ).map_err(db_error)?;
    find_folder(&connection, &id)
}

#[tauri::command]
pub fn rename_request_folder(
    state: State<'_, DatabaseState>,
    input: RenameFolderInput,
) -> Result<RequestFolder, String> {
    let name = validate_name(&input.name)?;
    let connection = state.connect().map_err(db_error)?;
    let changed = connection.execute(
        "UPDATE request_folders SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?3)",
        params![name, input.folder_id, input.user_id]
    ).map_err(db_error)?;
    if changed == 0 {
        return Err("No se encontró la carpeta.".to_string());
    }
    find_folder(&connection, &input.folder_id)
}

#[tauri::command]
pub fn delete_request_folder(
    state: State<'_, DatabaseState>,
    input: FolderInput,
) -> Result<(), String> {
    let connection = state.connect().map_err(db_error)?;
    let changed = connection.execute(
        "DELETE FROM request_folders WHERE id = ?1 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?2)",
        params![input.folder_id, input.user_id]
    ).map_err(db_error)?;
    if changed == 0 {
        return Err("No se encontró la carpeta.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn list_request_history(
    state: State<'_, DatabaseState>,
    input: WorkspaceInput,
) -> Result<Vec<HistoryEntry>, String> {
    let connection = state.connect().map_err(db_error)?;
    ensure_workspace(&connection, &input.user_id, &input.workspace_id)?;
    let mut statement = connection.prepare(
        "SELECT id, workspace_id, request_id, request_name, method, resolved_url, status, status_text, duration_ms, size_bytes, response_headers, response_body, error, created_at FROM request_history WHERE workspace_id = ?1 ORDER BY created_at DESC LIMIT 200"
    ).map_err(db_error)?;
    let items = statement
        .query_map([input.workspace_id], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                request_id: row.get(2)?,
                request_name: row.get(3)?,
                method: row.get(4)?,
                resolved_url: row.get(5)?,
                status: row.get(6)?,
                status_text: row.get(7)?,
                duration_ms: row.get(8)?,
                size_bytes: row.get(9)?,
                response_headers: row.get(10)?,
                response_body: row.get(11)?,
                error: row.get(12)?,
                created_at: row.get(13)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(items)
}

#[tauri::command]
pub fn record_request_history(
    state: State<'_, DatabaseState>,
    input: RecordHistoryInput,
) -> Result<HistoryEntry, String> {
    let connection = state.connect().map_err(db_error)?;
    ensure_workspace(&connection, &input.user_id, &input.workspace_id)?;
    let id = Uuid::new_v4().to_string();
    let body: String = input
        .response_body
        .unwrap_or_default()
        .chars()
        .take(1_000_000)
        .collect();
    connection.execute(
        "INSERT INTO request_history (id, workspace_id, request_id, request_name, method, resolved_url, status, status_text, duration_ms, size_bytes, response_headers, response_body, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![id, input.workspace_id, input.request_id, input.request_name, input.method, input.resolved_url, input.status, input.status_text.unwrap_or_default(), input.duration_ms, input.size_bytes, input.response_headers.unwrap_or_else(|| "[]".to_string()), body, input.error]
    ).map_err(db_error)?;
    find_history(&connection, &id)
}

#[tauri::command]
pub fn clear_request_history(
    state: State<'_, DatabaseState>,
    input: WorkspaceInput,
) -> Result<(), String> {
    let connection = state.connect().map_err(db_error)?;
    ensure_workspace(&connection, &input.user_id, &input.workspace_id)?;
    connection
        .execute(
            "DELETE FROM request_history WHERE workspace_id = ?1",
            [input.workspace_id],
        )
        .map_err(db_error)?;
    Ok(())
}

fn ensure_workspace(
    connection: &rusqlite::Connection,
    user_id: &str,
    workspace_id: &str,
) -> Result<(), String> {
    let valid = connection
        .query_row(
            "SELECT 1 FROM workspaces WHERE id = ?1 AND user_id = ?2",
            params![workspace_id, user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(db_error)?
        .is_some();
    if valid {
        Ok(())
    } else {
        Err("No se encontró el workspace.".to_string())
    }
}

fn find_folder(connection: &rusqlite::Connection, id: &str) -> Result<RequestFolder, String> {
    connection.query_row("SELECT id, workspace_id, parent_id, name, created_at, updated_at FROM request_folders WHERE id = ?1", [id], map_folder).map_err(db_error)
}

fn map_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<RequestFolder> {
    Ok(RequestFolder {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        parent_id: row.get(2)?,
        name: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn find_history(connection: &rusqlite::Connection, id: &str) -> Result<HistoryEntry, String> {
    connection.query_row("SELECT id, workspace_id, request_id, request_name, method, resolved_url, status, status_text, duration_ms, size_bytes, response_headers, response_body, error, created_at FROM request_history WHERE id = ?1", [id], |row| Ok(HistoryEntry { id: row.get(0)?, workspace_id: row.get(1)?, request_id: row.get(2)?, request_name: row.get(3)?, method: row.get(4)?, resolved_url: row.get(5)?, status: row.get(6)?, status_text: row.get(7)?, duration_ms: row.get(8)?, size_bytes: row.get(9)?, response_headers: row.get(10)?, response_body: row.get(11)?, error: row.get(12)?, created_at: row.get(13)? })).map_err(db_error)
}

fn validate_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 {
        Err("El nombre debe tener entre 1 y 80 caracteres.".to_string())
    } else {
        Ok(value.to_string())
    }
}

fn db_error(error: rusqlite::Error) -> String {
    if error.to_string().contains("UNIQUE constraint failed") {
        "Ya existe una carpeta con ese nombre en este nivel.".to_string()
    } else {
        tracing::error!("organization database error: {error}");
        "No se pudo completar la operación.".to_string()
    }
}
