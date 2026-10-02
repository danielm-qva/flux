use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

const MIN_INTERVAL_SECONDS: i64 = 15;
const MAX_INTERVAL_SECONDS: i64 = 7 * 24 * 60 * 60;
const MAX_ACTIVE_PER_WORKSPACE: i64 = 20;
const MAX_RUNS_KEPT: i64 = 100;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    id: String,
    workspace_id: String,
    request_id: String,
    environment_id: Option<String>,
    name: String,
    enabled: bool,
    schedule_json: String,
    actions_json: String,
    next_run_at: Option<String>,
    last_run_at: Option<String>,
    last_status: Option<String>,
    consecutive_failures: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRun {
    id: String,
    automation_id: String,
    started_at: String,
    duration_ms: Option<i64>,
    status: String,
    http_status: Option<i64>,
    error: Option<String>,
    saved_vars: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceScope {
    user_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAutomationInput {
    user_id: String,
    workspace_id: String,
    request_id: String,
    environment_id: Option<String>,
    name: String,
    schedule_json: String,
    actions_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAutomationInput {
    user_id: String,
    automation_id: String,
    environment_id: Option<String>,
    name: String,
    schedule_json: String,
    actions_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationScope {
    user_id: String,
    automation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEnabledInput {
    user_id: String,
    automation_id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRunInput {
    user_id: String,
    automation_id: String,
    started_at: String,
    status: String,
    http_status: Option<i64>,
    duration_ms: Option<i64>,
    error: Option<String>,
    saved_vars: Option<String>,
    next_run_at: Option<String>,
    consecutive_failures: i64,
    pause: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRunsInput {
    user_id: String,
    automation_id: String,
    limit: Option<i64>,
}

const SELECT: &str = "SELECT a.id, a.workspace_id, a.request_id, a.environment_id, a.name, a.enabled,
        a.schedule_json, a.actions_json, a.next_run_at, a.last_run_at, a.last_status,
        a.consecutive_failures, a.created_at, a.updated_at
     FROM automations a JOIN workspaces w ON w.id = a.workspace_id";

#[tauri::command]
pub fn list_automations(
    state: State<'_, DatabaseState>,
    input: WorkspaceScope,
) -> Result<Vec<Automation>, String> {
    let connection = state.connect().map_err(db_error)?;
    let mut statement = connection
        .prepare(&format!(
            "{SELECT} WHERE a.workspace_id = ?1 AND w.user_id = ?2 ORDER BY a.created_at ASC"
        ))
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![input.workspace_id, input.user_id], map_automation)
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

#[tauri::command]
pub fn create_automation(
    state: State<'_, DatabaseState>,
    input: CreateAutomationInput,
) -> Result<Automation, String> {
    let name = validate_name(&input.name)?;
    let every = validate_schedule(&input.schedule_json)?;
    validate_actions(&input.actions_json)?;
    let connection = state.connect().map_err(db_error)?;

    let request: Option<(String, String)> = connection
        .query_row(
            "SELECT r.body_type, r.body FROM saved_requests r JOIN workspaces w ON w.id = r.workspace_id
             WHERE r.id = ?1 AND r.workspace_id = ?2 AND w.user_id = ?3",
            params![input.request_id, input.workspace_id, input.user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    let Some((body_type, body)) = request else {
        return Err("La petición no existe o no pertenece a este workspace.".to_string());
    };
    if body_type == "binary" || (body_type == "form-data" && body.contains("\"kind\":\"file\"")) {
        return Err("No se pueden automatizar peticiones que envían archivos.".to_string());
    }
    check_environment(&connection, input.environment_id.as_deref(), &input.workspace_id)?;

    let active: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM automations WHERE workspace_id = ?1 AND enabled = 1",
            params![input.workspace_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if active >= MAX_ACTIVE_PER_WORKSPACE {
        return Err(format!(
            "Un workspace admite hasta {MAX_ACTIVE_PER_WORKSPACE} automatizaciones activas."
        ));
    }

    let run_on_start = serde_json::from_str::<serde_json::Value>(&input.schedule_json)
        .ok()
        .and_then(|value| value.get("runOnStart").and_then(|flag| flag.as_bool()))
        .unwrap_or(false);
    let next = if run_on_start { Utc::now() } else { Utc::now() + Duration::seconds(every) };

    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO automations (id, workspace_id, request_id, environment_id, name, schedule_json, actions_json, next_run_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.workspace_id,
                input.request_id,
                input.environment_id,
                name,
                input.schedule_json,
                input.actions_json,
                next.to_rfc3339()
            ],
        )
        .map_err(db_error)?;
    find(&connection, &id, &input.user_id)
}

#[tauri::command]
pub fn update_automation(
    state: State<'_, DatabaseState>,
    input: UpdateAutomationInput,
) -> Result<Automation, String> {
    let name = validate_name(&input.name)?;
    let every = validate_schedule(&input.schedule_json)?;
    validate_actions(&input.actions_json)?;
    let connection = state.connect().map_err(db_error)?;
    let current = find(&connection, &input.automation_id, &input.user_id)?;
    check_environment(&connection, input.environment_id.as_deref(), &current.workspace_id)?;

    let next = if current.enabled {
        Some((Utc::now() + Duration::seconds(every)).to_rfc3339())
    } else {
        None
    };
    connection
        .execute(
            "UPDATE automations SET name = ?1, environment_id = ?2, schedule_json = ?3, actions_json = ?4,
                 next_run_at = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
            params![name, input.environment_id, input.schedule_json, input.actions_json, next, input.automation_id],
        )
        .map_err(db_error)?;
    find(&connection, &input.automation_id, &input.user_id)
}

#[tauri::command]
pub fn set_automation_enabled(
    state: State<'_, DatabaseState>,
    input: SetEnabledInput,
) -> Result<Automation, String> {
    let connection = state.connect().map_err(db_error)?;
    let current = find(&connection, &input.automation_id, &input.user_id)?;
    if input.enabled {
        if current.environment_id.is_none() && has_variable_actions(&current.actions_json) {
            return Err("Elige un environment antes de reanudar esta automatización.".to_string());
        }
        let active: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM automations WHERE workspace_id = ?1 AND enabled = 1 AND id != ?2",
                params![current.workspace_id, current.id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if active >= MAX_ACTIVE_PER_WORKSPACE {
            return Err(format!(
                "Un workspace admite hasta {MAX_ACTIVE_PER_WORKSPACE} automatizaciones activas."
            ));
        }
    }
    let next = input.enabled.then(|| Utc::now().to_rfc3339());
    connection
        .execute(
            "UPDATE automations SET enabled = ?1, next_run_at = ?2, consecutive_failures = 0,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
            params![input.enabled as i64, next, input.automation_id],
        )
        .map_err(db_error)?;
    find(&connection, &input.automation_id, &input.user_id)
}

#[tauri::command]
pub fn delete_automation(
    state: State<'_, DatabaseState>,
    input: AutomationScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(db_error)?;
    let deleted = connection
        .execute(
            "DELETE FROM automations WHERE id = ?1
             AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?2)",
            params![input.automation_id, input.user_id],
        )
        .map_err(db_error)?;
    if deleted == 0 {
        return Err("La automatización no existe o no pertenece a este usuario.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn record_automation_run(
    state: State<'_, DatabaseState>,
    input: RecordRunInput,
) -> Result<Automation, String> {
    let connection = state.connect().map_err(db_error)?;
    find(&connection, &input.automation_id, &input.user_id)?;
    if !matches!(input.status.as_str(), "success" | "failed" | "skipped") {
        return Err("Estado de ejecución no válido.".to_string());
    }

    // Nunca se guardan valores de variables ni cuerpos de respuesta: solo metadatos.
    let error = input.error.as_ref().map(|text| text.chars().take(500).collect::<String>());
    connection
        .execute(
            "INSERT INTO automation_runs (id, automation_id, started_at, duration_ms, status, http_status, error, saved_vars)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                input.automation_id,
                input.started_at,
                input.duration_ms,
                input.status,
                input.http_status,
                error,
                input.saved_vars
            ],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "DELETE FROM automation_runs WHERE automation_id = ?1 AND id NOT IN
                 (SELECT id FROM automation_runs WHERE automation_id = ?1 ORDER BY started_at DESC LIMIT ?2)",
            params![input.automation_id, MAX_RUNS_KEPT],
        )
        .map_err(db_error)?;

    let next = if input.pause { None } else { input.next_run_at };
    connection
        .execute(
            "UPDATE automations SET last_run_at = ?1, last_status = ?2, consecutive_failures = ?3,
                 next_run_at = ?4, enabled = CASE WHEN ?5 = 1 THEN 0 ELSE enabled END,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
            params![
                input.started_at,
                input.status,
                input.consecutive_failures,
                next,
                input.pause as i64,
                input.automation_id
            ],
        )
        .map_err(db_error)?;
    find(&connection, &input.automation_id, &input.user_id)
}

#[tauri::command]
pub fn list_automation_runs(
    state: State<'_, DatabaseState>,
    input: ListRunsInput,
) -> Result<Vec<AutomationRun>, String> {
    let connection = state.connect().map_err(db_error)?;
    find(&connection, &input.automation_id, &input.user_id)?;
    let limit = input.limit.unwrap_or(50).clamp(1, MAX_RUNS_KEPT);
    let mut statement = connection
        .prepare(
            "SELECT id, automation_id, started_at, duration_ms, status, http_status, error, saved_vars
             FROM automation_runs WHERE automation_id = ?1 ORDER BY started_at DESC LIMIT ?2",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![input.automation_id, limit], |row| {
            Ok(AutomationRun {
                id: row.get(0)?,
                automation_id: row.get(1)?,
                started_at: row.get(2)?,
                duration_ms: row.get(3)?,
                status: row.get(4)?,
                http_status: row.get(5)?,
                error: row.get(6)?,
                saved_vars: row.get(7)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(rows)
}

fn find(connection: &Connection, id: &str, user_id: &str) -> Result<Automation, String> {
    connection
        .query_row(
            &format!("{SELECT} WHERE a.id = ?1 AND w.user_id = ?2"),
            params![id, user_id],
            map_automation,
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "La automatización no existe o no pertenece a este usuario.".to_string())
}

fn map_automation(row: &Row<'_>) -> rusqlite::Result<Automation> {
    Ok(Automation {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        request_id: row.get(2)?,
        environment_id: row.get(3)?,
        name: row.get(4)?,
        enabled: row.get::<_, i64>(5)? != 0,
        schedule_json: row.get(6)?,
        actions_json: row.get(7)?,
        next_run_at: row.get(8)?,
        last_run_at: row.get(9)?,
        last_status: row.get(10)?,
        consecutive_failures: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn check_environment(
    connection: &Connection,
    environment_id: Option<&str>,
    workspace_id: &str,
) -> Result<(), String> {
    let Some(environment_id) = environment_id else {
        return Ok(());
    };
    let exists = connection
        .query_row(
            "SELECT 1 FROM environments WHERE id = ?1 AND workspace_id = ?2",
            params![environment_id, workspace_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(db_error)?
        .is_some();
    if exists {
        Ok(())
    } else {
        Err("El environment no existe en este workspace.".to_string())
    }
}

fn validate_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 100 {
        return Err("El nombre debe tener entre 1 y 100 caracteres.".to_string());
    }
    Ok(value.to_string())
}

fn validate_schedule(source: &str) -> Result<i64, String> {
    let value = serde_json::from_str::<serde_json::Value>(source)
        .map_err(|_| "El horario no tiene un formato válido.".to_string())?;
    let every = value
        .get("everySeconds")
        .and_then(|seconds| seconds.as_i64())
        .ok_or_else(|| "Indica cada cuántos segundos se ejecuta.".to_string())?;
    if !(MIN_INTERVAL_SECONDS..=MAX_INTERVAL_SECONDS).contains(&every) {
        return Err(format!(
            "El intervalo debe estar entre {MIN_INTERVAL_SECONDS} segundos y 7 días."
        ));
    }
    Ok(every)
}

fn validate_actions(source: &str) -> Result<(), String> {
    let value = serde_json::from_str::<serde_json::Value>(source)
        .map_err(|_| "Las acciones no tienen un formato válido.".to_string())?;
    if value.is_object() {
        Ok(())
    } else {
        Err("Las acciones deben ser un objeto.".to_string())
    }
}

fn has_variable_actions(source: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(source)
        .ok()
        .and_then(|value| value.pointer("/onSuccess/saveVariables").cloned())
        .and_then(|list| list.as_array().map(|items| !items.is_empty()))
        .unwrap_or(false)
}

fn db_error(error: rusqlite::Error) -> String {
    tracing::error!("automation database error: {error}");
    "No se pudo guardar la automatización.".to_string()
}
