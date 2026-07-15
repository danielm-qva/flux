use std::collections::{HashMap, HashSet};

use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

const MAX_IMPORT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInput {
    user_id: String,
    workspace_id: String,
    include_secrets: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInput {
    user_id: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    file_name: String,
    content: String,
    summary: TransferSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    workspace_id: String,
    workspace_name: String,
    summary: TransferSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSummary {
    workspace_name: String,
    folders: usize,
    requests: usize,
    environments: usize,
    variables: usize,
    redacted_values: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FluxFile {
    format: String,
    format_version: u32,
    exported_at: String,
    app_version: String,
    workspace: ExportWorkspace,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportWorkspace {
    name: String,
    folders: Vec<ExportFolder>,
    environments: Vec<ExportEnvironment>,
    requests: Vec<ExportRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFolder {
    reference: String,
    parent_ref: Option<String>,
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportEnvironment {
    reference: String,
    name: String,
    color: String,
    variables: Vec<ExportVariable>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportVariable {
    key: String,
    value: String,
    secret: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
    reference: String,
    folder_ref: Option<String>,
    name: String,
    method: String,
    url: String,
    params: Value,
    headers: Value,
    auth_type: String,
    auth: Value,
    body_type: String,
    body: String,
}

#[tauri::command]
pub fn export_workspace(
    state: State<'_, DatabaseState>,
    input: ExportInput,
) -> Result<ExportResult, String> {
    let connection = state.connect().map_err(db_error)?;
    let workspace_name: String = connection
        .query_row(
            "SELECT name FROM workspaces WHERE id = ?1 AND user_id = ?2",
            params![input.workspace_id, input.user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or("No se encontró el workspace.")?;

    let mut folders_stmt = connection.prepare("SELECT id, parent_id, name FROM request_folders WHERE workspace_id = ?1 ORDER BY created_at").map_err(db_error)?;
    let folders = folders_stmt
        .query_map([&input.workspace_id], |row| {
            Ok(ExportFolder {
                reference: row.get(0)?,
                parent_ref: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;

    let mut redacted_values = 0;
    let mut environments_stmt = connection
        .prepare(
            "SELECT id, name, color FROM environments WHERE workspace_id = ?1 ORDER BY created_at",
        )
        .map_err(db_error)?;
    let environment_rows = environments_stmt
        .query_map([&input.workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut environments = Vec::new();
    for (id, name, color) in environment_rows {
        let mut variables_stmt = connection.prepare("SELECT key, value FROM environment_variables WHERE environment_id = ?1 ORDER BY created_at").map_err(db_error)?;
        let rows = variables_stmt
            .query_map([&id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let variables = rows
            .into_iter()
            .map(|(key, value)| {
                let secret = is_secret_key(&key);
                let value = if secret && !input.include_secrets {
                    redacted_values += 1;
                    String::new()
                } else {
                    value
                };
                ExportVariable { key, value, secret }
            })
            .collect();
        environments.push(ExportEnvironment {
            reference: id,
            name,
            color,
            variables,
        });
    }

    let mut requests_stmt = connection.prepare("SELECT id, folder_id, name, method, url, params_json, headers_json, auth_type, auth_json, body_type, body FROM saved_requests WHERE workspace_id = ?1 ORDER BY created_at").map_err(db_error)?;
    let rows = requests_stmt
        .query_map([&input.workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
            ))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut requests = Vec::new();
    for (
        id,
        folder_ref,
        name,
        method,
        url,
        params_json,
        headers_json,
        auth_type,
        auth_json,
        body_type,
        body,
    ) in rows
    {
        let mut headers = parse_json(&headers_json, Value::Array(vec![]));
        let mut auth = parse_json(&auth_json, Value::Object(Default::default()));
        let mut exported_body = body;
        if !input.include_secrets {
            redacted_values += redact_value(&mut headers, None);
            redacted_values += redact_value(&mut auth, None);
            if body_type == "json" {
                if let Ok(mut json_body) = serde_json::from_str::<Value>(&exported_body) {
                    redacted_values += redact_value(&mut json_body, None);
                    exported_body = serde_json::to_string_pretty(&json_body).unwrap_or_default();
                }
            }
        }
        requests.push(ExportRequest {
            reference: id,
            folder_ref,
            name,
            method,
            url,
            params: parse_json(&params_json, Value::Array(vec![])),
            headers,
            auth_type,
            auth,
            body_type,
            body: exported_body,
        });
    }

    let summary = TransferSummary {
        workspace_name: workspace_name.clone(),
        folders: folders.len(),
        requests: requests.len(),
        environments: environments.len(),
        variables: environments.iter().map(|item| item.variables.len()).sum(),
        redacted_values,
    };
    let file = FluxFile {
        format: "flux-workspace".into(),
        format_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        workspace: ExportWorkspace {
            name: workspace_name.clone(),
            folders,
            environments,
            requests,
        },
    };
    let content = serde_json::to_string_pretty(&file)
        .map_err(|_| "No se pudo generar el archivo Flux.".to_string())?;
    Ok(ExportResult {
        file_name: format!("{}.flux.json", slug(&workspace_name)),
        content,
        summary,
    })
}

#[tauri::command]
pub fn preview_workspace_import(input: PreviewInput) -> Result<TransferSummary, String> {
    let file = parse_and_validate(&input.content)?;
    Ok(summary(&file))
}

#[tauri::command]
pub fn import_workspace(
    state: State<'_, DatabaseState>,
    input: ImportInput,
) -> Result<ImportResult, String> {
    let file = parse_and_validate(&input.content)?;
    let mut connection = state.connect().map_err(db_error)?;
    let tx = connection.transaction().map_err(db_error)?;
    let name = unique_workspace_name(&tx, &input.user_id, &file.workspace.name)?;
    let workspace_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO workspaces (id, user_id, name) VALUES (?1, ?2, ?3)",
        params![workspace_id, input.user_id, name],
    )
    .map_err(db_error)?;

    let mut folder_ids: HashMap<String, String> = HashMap::new();
    let mut pending: Vec<&ExportFolder> = file.workspace.folders.iter().collect();
    while !pending.is_empty() {
        let before = pending.len();
        pending.retain(|folder| {
            let parent_id = match &folder.parent_ref { Some(reference) => match folder_ids.get(reference) { Some(id) => Some(id.clone()), None => return true }, None => None };
            let id = Uuid::new_v4().to_string();
            if tx.execute("INSERT INTO request_folders (id, workspace_id, parent_id, name) VALUES (?1, ?2, ?3, ?4)", params![id, workspace_id, parent_id, folder.name.trim()]).is_ok() { folder_ids.insert(folder.reference.clone(), id); false } else { true }
        });
        if pending.len() == before {
            return Err("La jerarquía de carpetas contiene referencias inválidas o ciclos.".into());
        }
    }

    for environment in &file.workspace.environments {
        let environment_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO environments (id, workspace_id, name, color) VALUES (?1, ?2, ?3, ?4)",
            params![
                environment_id,
                workspace_id,
                environment.name.trim(),
                environment.color
            ],
        )
        .map_err(db_error)?;
        for variable in &environment.variables {
            tx.execute("INSERT INTO environment_variables (id, environment_id, key, value) VALUES (?1, ?2, ?3, ?4)", params![Uuid::new_v4().to_string(), environment_id, variable.key.trim(), variable.value]).map_err(db_error)?;
        }
    }

    let mut names = HashSet::new();
    for request in &file.workspace.requests {
        let name = unique_item_name(&mut names, &request.name);
        let folder_id = request
            .folder_ref
            .as_ref()
            .and_then(|reference| folder_ids.get(reference))
            .cloned();
        tx.execute("INSERT INTO saved_requests (id, workspace_id, folder_id, name, method, url, params_json, headers_json, auth_type, auth_json, body_type, body) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)", params![Uuid::new_v4().to_string(), workspace_id, folder_id, name, request.method, request.url, request.params.to_string(), request.headers.to_string(), request.auth_type, request.auth.to_string(), request.body_type, request.body]).map_err(db_error)?;
    }
    tx.commit().map_err(db_error)?;
    let summary = summary(&file);
    Ok(ImportResult {
        workspace_id,
        workspace_name: name,
        summary,
    })
}

fn parse_and_validate(content: &str) -> Result<FluxFile, String> {
    if content.len() > MAX_IMPORT_BYTES {
        return Err("El archivo supera el límite de 25 MB.".into());
    }
    let file: FluxFile = serde_json::from_str(content)
        .map_err(|_| "El archivo no contiene un workspace Flux válido.".to_string())?;
    if file.format != "flux-workspace" || file.format_version != 1 {
        return Err("La versión del archivo Flux no es compatible.".into());
    }
    if file.workspace.name.trim().is_empty()
        || file.workspace.folders.len() > 500
        || file.workspace.requests.len() > 5000
        || file.workspace.environments.len() > 100
        || file
            .workspace
            .environments
            .iter()
            .map(|item| item.variables.len())
            .sum::<usize>()
            > 5000
    {
        return Err("El workspace supera los límites permitidos para importar.".into());
    }
    let folder_refs: HashSet<&str> = file
        .workspace
        .folders
        .iter()
        .map(|item| item.reference.as_str())
        .collect();
    if folder_refs.len() != file.workspace.folders.len()
        || file.workspace.requests.iter().any(|request| {
            request
                .folder_ref
                .as_deref()
                .is_some_and(|reference| !folder_refs.contains(reference))
        })
    {
        return Err("El archivo contiene referencias de carpetas inválidas.".into());
    }
    Ok(file)
}

fn summary(file: &FluxFile) -> TransferSummary {
    TransferSummary {
        workspace_name: file.workspace.name.clone(),
        folders: file.workspace.folders.len(),
        requests: file.workspace.requests.len(),
        environments: file.workspace.environments.len(),
        variables: file
            .workspace
            .environments
            .iter()
            .map(|item| item.variables.len())
            .sum(),
        redacted_values: file
            .workspace
            .environments
            .iter()
            .flat_map(|item| &item.variables)
            .filter(|item| item.secret && item.value.is_empty())
            .count(),
    }
}
fn is_secret_key(key: &str) -> bool {
    let key = key.to_lowercase();
    [
        "token",
        "secret",
        "password",
        "passwd",
        "api_key",
        "apikey",
        "authorization",
    ]
    .iter()
    .any(|part| key.contains(part))
}
fn redact_value(value: &mut Value, field: Option<&str>) -> usize {
    match value {
        Value::Object(map) => {
            let secret_pair = map
                .get("key")
                .and_then(Value::as_str)
                .is_some_and(is_secret_key);
            let mut redacted = 0;
            if secret_pair {
                if let Some(pair_value) = map.get_mut("value") {
                    if pair_value.as_str().is_some_and(|item| !item.is_empty()) {
                        *pair_value = Value::String(String::new());
                        redacted += 1;
                    }
                }
            }
            redacted
                + map
                    .iter_mut()
                    .filter(|(key, _)| !(secret_pair && key.as_str() == "value"))
                    .map(|(key, value)| {
                        if is_secret_key(key) || field.is_some_and(is_secret_key) {
                            if value.as_str().is_some_and(|v| !v.is_empty()) {
                                *value = Value::String(String::new());
                                1
                            } else {
                                0
                            }
                        } else {
                            redact_value(value, Some(key))
                        }
                    })
                    .sum::<usize>()
        }
        Value::Array(items) => items.iter_mut().map(|item| redact_value(item, field)).sum(),
        _ => 0,
    }
}
fn parse_json(value: &str, fallback: Value) -> Value {
    serde_json::from_str(value).unwrap_or(fallback)
}
fn slug(value: &str) -> String {
    let value: String = value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    value
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
fn unique_workspace_name(
    tx: &Transaction<'_>,
    user_id: &str,
    source: &str,
) -> Result<String, String> {
    let stem: String = source.trim().chars().take(48).collect();
    for index in 0..1000 {
        let candidate = if index == 0 {
            format!("{stem} importado")
        } else {
            format!("{stem} importado {index}")
        };
        let exists = tx
            .query_row(
                "SELECT 1 FROM workspaces WHERE user_id = ?1 AND name = ?2 COLLATE NOCASE",
                params![user_id, candidate],
                |_| Ok(()),
            )
            .optional()
            .map_err(db_error)?
            .is_some();
        if !exists {
            return Ok(candidate);
        }
    }
    Err("No se pudo generar un nombre para el workspace importado.".into())
}
fn unique_item_name(names: &mut HashSet<String>, source: &str) -> String {
    let stem: String = source.trim().chars().take(88).collect();
    let mut candidate = if stem.is_empty() {
        "Petición importada".into()
    } else {
        stem.clone()
    };
    let mut index = 2;
    while !names.insert(candidate.to_lowercase()) {
        candidate = format!("{stem} copia {index}");
        index += 1;
    }
    candidate
}
fn db_error(error: rusqlite::Error) -> String {
    tracing::error!("workspace transfer error: {error}");
    "No se pudo completar la transferencia del workspace.".into()
}
