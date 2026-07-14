use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    id: String,
    user_id: String,
    name: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    id: String,
    workspace_id: String,
    name: String,
    color: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVariable {
    id: String,
    environment_id: String,
    key: String,
    value: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    user_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceScope {
    user_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvironmentInput {
    user_id: String,
    workspace_id: String,
    name: String,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentScope {
    user_id: String,
    environment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEnvironmentVariableInput {
    user_id: String,
    environment_id: String,
    variable_id: Option<String>,
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableScope {
    user_id: String,
    variable_id: String,
}

#[tauri::command]
pub fn list_workspaces(
    state: State<'_, DatabaseState>,
    user_id: String,
) -> Result<Vec<Workspace>, String> {
    let connection = state.connect().map_err(internal_error)?;
    let mut statement = connection
        .prepare("SELECT id, user_id, name, created_at FROM workspaces WHERE user_id = ?1 ORDER BY created_at")
        .map_err(internal_error)?;
    let rows = statement
        .query_map([user_id], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                user_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(internal_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal_error)
}

#[tauri::command]
pub fn create_workspace(
    state: State<'_, DatabaseState>,
    input: CreateWorkspaceInput,
) -> Result<Workspace, String> {
    let name = validate_name(&input.name, 60, "workspace")?;
    let connection = state.connect().map_err(internal_error)?;
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO workspaces (id, user_id, name) VALUES (?1, ?2, ?3)",
            params![id, input.user_id, name],
        )
        .map_err(friendly_constraint_error)?;
    connection
        .query_row(
            "SELECT id, user_id, name, created_at FROM workspaces WHERE id = ?1",
            [&id],
            |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .map_err(internal_error)
}

#[tauri::command]
pub fn delete_workspace(
    state: State<'_, DatabaseState>,
    input: WorkspaceScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(internal_error)?;
    connection
        .execute(
            "DELETE FROM workspaces WHERE id = ?1 AND user_id = ?2",
            params![input.workspace_id, input.user_id],
        )
        .map_err(internal_error)?;
    Ok(())
}

#[tauri::command]
pub fn list_environments(
    state: State<'_, DatabaseState>,
    input: WorkspaceScope,
) -> Result<Vec<Environment>, String> {
    let connection = state.connect().map_err(internal_error)?;
    let mut statement = connection
        .prepare(
            "SELECT e.id, e.workspace_id, e.name, e.color, e.created_at
             FROM environments e JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.workspace_id = ?1 AND w.user_id = ?2 ORDER BY e.created_at",
        )
        .map_err(internal_error)?;
    let rows = statement
        .query_map(params![input.workspace_id, input.user_id], |row| {
            Ok(Environment {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(internal_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal_error)
}

#[tauri::command]
pub fn create_environment(
    state: State<'_, DatabaseState>,
    input: CreateEnvironmentInput,
) -> Result<Environment, String> {
    let name = validate_name(&input.name, 40, "environment")?;
    let color = input.color.unwrap_or_else(|| "#8b5cf6".to_string());
    if !is_valid_color(&color) {
        return Err("El color del environment no es válido.".to_string());
    }
    let connection = state.connect().map_err(internal_error)?;
    let owns_workspace = connection
        .query_row(
            "SELECT 1 FROM workspaces WHERE id = ?1 AND user_id = ?2",
            params![input.workspace_id, input.user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(internal_error)?
        .is_some();
    if !owns_workspace {
        return Err("No se encontró el workspace.".to_string());
    }
    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO environments (id, workspace_id, name, color) VALUES (?1, ?2, ?3, ?4)",
            params![id, input.workspace_id, name, color],
        )
        .map_err(friendly_constraint_error)?;
    connection
        .query_row(
            "SELECT id, workspace_id, name, color, created_at FROM environments WHERE id = ?1",
            [&id],
            |row| {
                Ok(Environment {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(internal_error)
}

#[tauri::command]
pub fn delete_environment(
    state: State<'_, DatabaseState>,
    input: EnvironmentScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(internal_error)?;
    connection
        .execute(
            "DELETE FROM environments WHERE id = ?1 AND workspace_id IN
             (SELECT id FROM workspaces WHERE user_id = ?2)",
            params![input.environment_id, input.user_id],
        )
        .map_err(internal_error)?;
    Ok(())
}

#[tauri::command]
pub fn list_environment_variables(
    state: State<'_, DatabaseState>,
    input: EnvironmentScope,
) -> Result<Vec<EnvironmentVariable>, String> {
    let connection = state.connect().map_err(internal_error)?;
    let mut statement = connection
        .prepare(
            "SELECT v.id, v.environment_id, v.key, v.value, v.created_at, v.updated_at
             FROM environment_variables v
             JOIN environments e ON e.id = v.environment_id
             JOIN workspaces w ON w.id = e.workspace_id
             WHERE v.environment_id = ?1 AND w.user_id = ?2
             ORDER BY v.created_at",
        )
        .map_err(internal_error)?;
    let rows = statement
        .query_map(params![input.environment_id, input.user_id], map_variable)
        .map_err(internal_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(internal_error)
}

#[tauri::command]
pub fn save_environment_variable(
    state: State<'_, DatabaseState>,
    input: SaveEnvironmentVariableInput,
) -> Result<EnvironmentVariable, String> {
    let key = validate_variable_key(&input.key)?;
    if input.value.chars().count() > 65_536 {
        return Err("El valor no puede superar 65 536 caracteres.".to_string());
    }
    let connection = state.connect().map_err(internal_error)?;
    let owns_environment = connection
        .query_row(
            "SELECT 1 FROM environments e JOIN workspaces w ON w.id = e.workspace_id
             WHERE e.id = ?1 AND w.user_id = ?2",
            params![input.environment_id, input.user_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(internal_error)?
        .is_some();
    if !owns_environment {
        return Err("No se encontró el environment.".to_string());
    }

    let id = input
        .variable_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let changed = connection
        .execute(
            "INSERT INTO environment_variables (id, environment_id, key, value)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET key = excluded.key, value = excluded.value,
                 updated_at = CURRENT_TIMESTAMP
             WHERE environment_variables.environment_id = excluded.environment_id",
            params![id, input.environment_id, key, input.value],
        )
        .map_err(friendly_constraint_error)?;
    if changed == 0 {
        return Err("No se encontró la variable.".to_string());
    }
    connection
        .query_row(
            "SELECT id, environment_id, key, value, created_at, updated_at
             FROM environment_variables WHERE id = ?1 AND environment_id = ?2",
            params![id, input.environment_id],
            map_variable,
        )
        .map_err(internal_error)
}

#[tauri::command]
pub fn delete_environment_variable(
    state: State<'_, DatabaseState>,
    input: VariableScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(internal_error)?;
    connection
        .execute(
            "DELETE FROM environment_variables WHERE id = ?1 AND environment_id IN (
                SELECT e.id FROM environments e JOIN workspaces w ON w.id = e.workspace_id
                WHERE w.user_id = ?2
             )",
            params![input.variable_id, input.user_id],
        )
        .map_err(internal_error)?;
    Ok(())
}

fn map_variable(row: &rusqlite::Row<'_>) -> rusqlite::Result<EnvironmentVariable> {
    Ok(EnvironmentVariable {
        id: row.get(0)?,
        environment_id: row.get(1)?,
        key: row.get(2)?,
        value: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn validate_variable_key(value: &str) -> Result<String, String> {
    let value = value.trim().to_ascii_uppercase();
    let mut chars = value.chars();
    let valid_start = chars
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_');
    if valid_start && value.len() <= 100 && chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        Ok(value)
    } else {
        Err("La clave debe usar letras, números o _ y no puede comenzar con un número.".to_string())
    }
}

fn validate_name(value: &str, max: usize, entity: &str) -> Result<String, String> {
    let value = value.trim();
    if (2..=max).contains(&value.chars().count()) {
        Ok(value.to_string())
    } else {
        Err(format!(
            "El nombre del {entity} debe tener entre 2 y {max} caracteres."
        ))
    }
}

fn is_valid_color(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn friendly_constraint_error(error: rusqlite::Error) -> String {
    if error.to_string().contains("UNIQUE constraint failed") {
        "Ya existe un elemento con ese nombre.".to_string()
    } else {
        internal_error(error)
    }
}

fn internal_error(error: impl std::fmt::Display) -> String {
    tracing::error!("workspace error: {error}");
    "No se pudo completar la operación local.".to_string()
}
