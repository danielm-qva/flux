use std::time::{Duration, Instant};

use reqwest::{header::HeaderName, Method, Url};
use serde::{Deserialize, Serialize};

const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

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
