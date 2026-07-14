use std::time::{Duration, Instant};

use reqwest::{header::HeaderName, Method, Url};
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::database::DatabaseState;

const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    id: String,
    workspace_id: String,
    name: String,
    method: String,
    url: String,
    params_json: String,
    headers_json: String,
    auth_type: String,
    auth_json: String,
    body_type: String,
    body: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestWorkspaceScope {
    user_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSavedRequestInput {
    user_id: String,
    workspace_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequestScope {
    user_id: String,
    request_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSavedRequestInput {
    user_id: String,
    request_id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSavedRequestInput {
    user_id: String,
    request_id: String,
    name: String,
    method: String,
    url: String,
    params_json: String,
    headers_json: String,
    auth_type: String,
    auth_json: String,
    body_type: String,
    body: String,
}

#[tauri::command]
pub fn list_saved_requests(
    state: State<'_, DatabaseState>,
    input: RequestWorkspaceScope,
) -> Result<Vec<SavedRequest>, String> {
    let connection = state.connect().map_err(database_error)?;
    let mut statement = connection
        .prepare(
            "SELECT r.id, r.workspace_id, r.name, r.method, r.url, r.params_json,
                    r.headers_json, r.auth_type, r.auth_json, r.body_type, r.body,
                    r.created_at, r.updated_at
             FROM saved_requests r
             JOIN workspaces w ON w.id = r.workspace_id
             WHERE r.workspace_id = ?1 AND w.user_id = ?2
             ORDER BY r.created_at ASC",
        )
        .map_err(database_error)?;
    let requests = statement
        .query_map(
            params![input.workspace_id, input.user_id],
            map_saved_request,
        )
        .map_err(database_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(database_error)?;
    Ok(requests)
}

#[tauri::command]
pub fn create_saved_request(
    state: State<'_, DatabaseState>,
    input: CreateSavedRequestInput,
) -> Result<SavedRequest, String> {
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
            "INSERT INTO saved_requests
             (id, workspace_id, name, method, url, params_json, headers_json, auth_type, auth_json, body_type, body)
             VALUES (?1, ?2, ?3, 'GET', '{{BASE_URL}}/v1/resource',
                     '[{\"id\":\"param-1\",\"enabled\":true,\"key\":\"\",\"value\":\"\"}]',
                     '[{\"id\":\"header-1\",\"enabled\":true,\"key\":\"Content-Type\",\"value\":\"application/json\"}]',
                     'none', '{\"token\":\"\",\"username\":\"\",\"password\":\"\",\"apiKeyName\":\"X-API-Key\",\"apiKeyValue\":\"\"}',
                     'json', '{\n  \"message\": \"Hello from Flux\"\n}')",
            params![id, input.workspace_id, name],
        )
        .map_err(database_error)?;
    find_saved_request(&connection, &id, &input.user_id)
}

#[tauri::command]
pub fn update_saved_request(
    state: State<'_, DatabaseState>,
    input: UpdateSavedRequestInput,
) -> Result<SavedRequest, String> {
    let name = validate_name(&input.name)?;
    let method = input.method.trim().to_uppercase();
    if method.is_empty() || method.len() > 32 {
        return Err("El método HTTP no es válido.".to_string());
    }
    validate_json_array(&input.params_json, "Los params")?;
    validate_json_array(&input.headers_json, "Los headers")?;
    serde_json::from_str::<serde_json::Value>(&input.auth_json)
        .map_err(|_| "La configuración de autorización no es válida.".to_string())?;

    let connection = state.connect().map_err(database_error)?;
    let changed = connection
        .execute(
            "UPDATE saved_requests
             SET name = ?1, method = ?2, url = ?3, params_json = ?4, headers_json = ?5,
                 auth_type = ?6, auth_json = ?7, body_type = ?8, body = ?9,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?10 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?11)",
            params![
                name,
                method,
                input.url.trim(),
                input.params_json,
                input.headers_json,
                input.auth_type,
                input.auth_json,
                input.body_type,
                input.body,
                input.request_id,
                input.user_id
            ],
        )
        .map_err(database_error)?;
    if changed == 0 {
        return Err("La petición no existe o no pertenece a este usuario.".to_string());
    }
    find_saved_request(&connection, &input.request_id, &input.user_id)
}

#[tauri::command]
pub fn rename_saved_request(
    state: State<'_, DatabaseState>,
    input: RenameSavedRequestInput,
) -> Result<SavedRequest, String> {
    let name = validate_name(&input.name)?;
    let connection = state.connect().map_err(database_error)?;
    let updated = connection
        .execute(
            "UPDATE saved_requests SET name = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?3)",
            params![name, input.request_id, input.user_id],
        )
        .map_err(database_error)?;
    if updated == 0 {
        return Err("La petición no existe o no pertenece a este usuario.".to_string());
    }
    find_saved_request(&connection, &input.request_id, &input.user_id)
}

#[tauri::command]
pub fn duplicate_saved_request(
    state: State<'_, DatabaseState>,
    input: SavedRequestScope,
) -> Result<SavedRequest, String> {
    let connection = state.connect().map_err(database_error)?;
    let source = find_saved_request(&connection, &input.request_id, &input.user_id)?;
    let stem: String = source.name.chars().take(90).collect();
    let mut candidate = format!("{stem} copia");
    let mut number = 2;
    while connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM saved_requests WHERE workspace_id = ?1 AND name = ?2 COLLATE NOCASE)",
            params![source.workspace_id, candidate],
            |row| row.get::<_, bool>(0),
        )
        .map_err(database_error)?
    {
        candidate = format!("{stem} copia {number}");
        number += 1;
    }

    let id = Uuid::new_v4().to_string();
    connection
        .execute(
            "INSERT INTO saved_requests
             (id, workspace_id, name, method, url, params_json, headers_json,
              auth_type, auth_json, body_type, body)
             SELECT ?1, workspace_id, ?2, method, url, params_json, headers_json,
                    auth_type, auth_json, body_type, body
             FROM saved_requests WHERE id = ?3",
            params![id, candidate, input.request_id],
        )
        .map_err(database_error)?;
    find_saved_request(&connection, &id, &input.user_id)
}

#[tauri::command]
pub fn delete_saved_request(
    state: State<'_, DatabaseState>,
    input: SavedRequestScope,
) -> Result<(), String> {
    let connection = state.connect().map_err(database_error)?;
    let deleted = connection
        .execute(
            "DELETE FROM saved_requests
             WHERE id = ?1 AND workspace_id IN (SELECT id FROM workspaces WHERE user_id = ?2)",
            params![input.request_id, input.user_id],
        )
        .map_err(database_error)?;
    if deleted == 0 {
        return Err("La petición no existe o no pertenece a este usuario.".to_string());
    }
    Ok(())
}

fn find_saved_request(
    connection: &rusqlite::Connection,
    request_id: &str,
    user_id: &str,
) -> Result<SavedRequest, String> {
    connection
        .query_row(
            "SELECT r.id, r.workspace_id, r.name, r.method, r.url, r.params_json,
                    r.headers_json, r.auth_type, r.auth_json, r.body_type, r.body,
                    r.created_at, r.updated_at
             FROM saved_requests r JOIN workspaces w ON w.id = r.workspace_id
             WHERE r.id = ?1 AND w.user_id = ?2",
            params![request_id, user_id],
            map_saved_request,
        )
        .map_err(database_error)
}

fn map_saved_request(row: &Row<'_>) -> rusqlite::Result<SavedRequest> {
    Ok(SavedRequest {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        name: row.get(2)?,
        method: row.get(3)?,
        url: row.get(4)?,
        params_json: row.get(5)?,
        headers_json: row.get(6)?,
        auth_type: row.get(7)?,
        auth_json: row.get(8)?,
        body_type: row.get(9)?,
        body: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn validate_name(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 100 {
        return Err("El nombre debe tener entre 1 y 100 caracteres.".to_string());
    }
    Ok(value.to_string())
}

fn validate_json_array(value: &str, label: &str) -> Result<(), String> {
    let parsed = serde_json::from_str::<serde_json::Value>(value)
        .map_err(|_| format!("{label} no tienen un formato válido."))?;
    if !parsed.is_array() {
        return Err(format!("{label} deben ser una lista."));
    }
    Ok(())
}

fn database_error(error: rusqlite::Error) -> String {
    let message = error.to_string();
    if message.contains("UNIQUE constraint failed") {
        "Ya existe una petición con ese nombre en el workspace.".to_string()
    } else {
        tracing::error!("saved request database error: {error}");
        "No se pudo guardar la petición.".to_string()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteRequestInput {
    method: String,
    url: String,
    headers: Vec<HttpHeader>,
    body: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct HttpHeader {
    name: String,
    value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    status: u16,
    status_text: String,
    headers: Vec<HttpHeader>,
    body: String,
    duration_ms: u128,
    size_bytes: usize,
}

#[tauri::command]
pub async fn execute_http_request(input: ExecuteRequestInput) -> Result<HttpResponse, String> {
    let url = Url::parse(input.url.trim()).map_err(|_| "La URL no es válida.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Flux solo permite peticiones HTTP o HTTPS.".to_string());
    }
    let method = Method::from_bytes(input.method.as_bytes())
        .map_err(|_| "El método HTTP no es válido.".to_string())?;
    let timeout = input.timeout_ms.unwrap_or(30_000).clamp(1_000, 300_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout))
        .build()
        .map_err(internal_error)?;
    let mut request = client.request(method, url);
    for header in input.headers {
        let name = HeaderName::from_bytes(header.name.trim().as_bytes())
            .map_err(|_| format!("El header '{}' no es válido.", header.name))?;
        request = request.header(name, header.value);
    }
    if let Some(body) = input.body {
        request = request.body(body);
    }

    let started = Instant::now();
    let response = request.send().await.map_err(request_error)?;
    let duration_ms = started.elapsed().as_millis();
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| HttpHeader {
            name: name.to_string(),
            value: value.to_str().unwrap_or("<valor binario>").to_string(),
        })
        .collect();
    let bytes = response.bytes().await.map_err(request_error)?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("La respuesta supera el límite de 10 MB.".to_string());
    }
    let size_bytes = bytes.len();
    let body = String::from_utf8_lossy(&bytes).into_owned();

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        body,
        duration_ms,
        size_bytes,
    })
}

fn request_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "La petición superó el tiempo límite.".to_string()
    } else if error.is_connect() {
        "No se pudo conectar con el endpoint.".to_string()
    } else {
        tracing::error!("http request error: {error}");
        "La petición HTTP no pudo completarse.".to_string()
    }
}

fn internal_error(error: impl std::fmt::Display) -> String {
    tracing::error!("http client error: {error}");
    "No se pudo preparar el cliente HTTP.".to_string()
}
