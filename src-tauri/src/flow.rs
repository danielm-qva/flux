use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFlow {
    id: String,
    workspace_id: String,
    name: String,
    graph_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowWorkspaceScope {
    user_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFlowInput {
    user_id: String,
    workspace_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFlowInput {
    user_id: String,
    flow_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFlowInput {
    user_id: String,
    flow_id: String,
    graph_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowScope {
    user_id: String,
    flow_id: String,
}

#[tauri::command]
pub fn list_request_flows(
    state: State<'_, DatabaseState>,
    input: FlowWorkspaceScope,
) -> Result<Vec<RequestFlow>, String> {
    let connection = state.connect().map_err(database_error)?;
    let mut statement = connection
        .prepare(
            "SELECT f.id, f.workspace_id, f.name, f.graph_json, f.created_at, f.updated_at
             FROM request_flows f
             JOIN workspaces w ON w.id = f.workspace_id
             WHERE f.workspace_id = ?1 AND w.user_id = ?2
             ORDER BY f.created_at ASC",
        )
        .map_err(database_error)?;
    let flows = statement
        .query_map(params![input.workspace_id, input.user_id], map_flow)
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    Ok(flows)
}

#[tauri::command]
pub fn create_request_flow(
    state: State<'_, DatabaseState>,
    input: CreateFlowInput,
) -> Result<RequestFlow, String> {
    let name = validate_name(&input.name)?;
    let connection = state.connect().map_err(database_error)?;
    let owns_workspace = connection
        .query_row(
            "SELECT 1 FROM workspaces WHERE id = ?1 AND user_id = ?2",
            params![input.workspace_id, input.user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(database_error)?
        .is_some();
    if !owns_workspace {
        return Err("El workspace no existe o no pertenece a este usuario.".to_string());
    }

    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO request_flows (id, workspace_id, name) VALUES (?1, ?2, ?3)",
            params![id, input.workspace_id, name],
        )
        .map_err(database_error)?;
    find_flow(&connection, &id, &input.user_id)
}

#[tauri::command]
pub fn rename_request_flow(
    state: State<'_, DatabaseState>,
    input: RenameFlowInput,
) -> Result<RequestFlow, String> {
    let name = validate_name(&input.name)?;
    let connection = state.connect().map_err(database_error)?;
    let updated = connection
        .execute(
            "UPDATE request_flows SET name = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?3)",
            params![name, input.flow_id, input.user_id],
        )
        .map_err(database_error)?;
    if updated == 0 {
        return Err("El flujo no existe o no pertenece a este usuario.".to_string());
    }
    find_flow(&connection, &input.flow_id, &input.user_id)
}

#[tauri::command]
pub fn update_request_flow(
    state: State<'_, DatabaseState>,
    input: UpdateFlowInput,
) -> Result<RequestFlow, String> {
    let parsed = serde_json::from_str::<serde_json::Value>(&input.graph_json)
        .map_err(|_| "El grafo del flujo no tiene un formato válido.".to_string())?;
    if !parsed.is_object() {
        return Err("El grafo del flujo debe ser un objeto.".to_string());
    }

    let connection = state.connect().map_err(database_error)?;
    let changed = connection
        .execute(
            "UPDATE request_flows SET graph_json = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?3)",
            params![input.graph_json, input.flow_id, input.user_id],
        )
        .map_err(database_error)?;
    if changed == 0 {
        return Err("El flujo no existe o no pertenece a este usuario.".to_string());
    }
    find_flow(&connection, &input.flow_id, &input.user_id)
}

#[tauri::command]
pub fn delete_request_flow(
    state: State<'_, DatabaseState>,
    input: FlowScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(database_error)?;
    let deleted = connection
        .execute(
            "DELETE FROM request_flows
             WHERE id = ?1 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?2)",
            params![input.flow_id, input.user_id],
        )
        .map_err(database_error)?;
    if deleted == 0 {
        return Err("El flujo no existe o no pertenece a este usuario.".to_string());
    }
    Ok(())
}

fn find_flow(
    connection: &rusqlite::Connection,
    flow_id: &str,
    user_id: &str,
) -> Result<RequestFlow, String> {
    connection
        .query_row(
            "SELECT f.id, f.workspace_id, f.name, f.graph_json, f.created_at, f.updated_at
             FROM request_flows f JOIN workspaces w ON w.id = f.workspace_id
             WHERE f.id = ?1 AND w.user_id = ?2",
            params![flow_id, user_id],
            map_flow,
        )
        .map_err(database_error)
}

fn map_flow(row: &Row<'_>) -> rusqlite::Result<RequestFlow> {
    Ok(RequestFlow {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        name: row.get(2)?,
        graph_json: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn validate_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 100 {
        return Err("El nombre debe tener entre 1 y 100 caracteres.".to_string());
    }
    Ok(value.to_string())
}

fn database_error(error: rusqlite::Error) -> String {
    let message = error.to_string();
    if message.contains("UNIQUE constraint failed") {
        "Ya existe un flujo con ese nombre en el workspace.".to_string()
    } else {
        tracing::error!("request flow database error: {error}");
        "No se pudo guardar el flujo.".to_string()
    }
}
