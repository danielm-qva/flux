import { resolveEnvironmentVariables } from "@/features/workspaces/workspace-client";
import type { HttpHeader, SavedRequest } from "./request-client";

export type Pair = { id: string; enabled: boolean; key: string; value: string };
export type AuthState = {
  token: string;
  username: string;
  password: string;
  apiKeyName: string;
  apiKeyValue: string;
};

export type RequestConfig = {
  method: string;
  url: string;
  headers: Pair[];
  authType: string;
  auth: AuthState;
  bodyType: string;
  body: string;
};

export type PreparedRequest = {
  method: string;
  url: string;
  headers: HttpHeader[];
  bodyType: string;
  body?: string;
};

/**
 * Turns a request's editable config plus a variable set into the payload
 * accepted by `executeHttpRequest`. Shared by the request builder (single
 * request) and the flow runner (chained requests) so auth and content-type
 * handling stay identical.
 */
export function prepareHttpRequest(
  config: RequestConfig,
  variables: { key: string; value: string }[],
): PreparedRequest {
  const { method, url, headers, authType, auth, bodyType, body } = config;

  const requestHeaders: HttpHeader[] = headers
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({
      name: item.key.trim(),
      value: resolveEnvironmentVariables(item.value, variables),
    }));

  let contentType = requestHeaders.find(
    (header) => header.name.toLowerCase() === "content-type",
  );
  const expectedContentType = contentTypeForBody(bodyType);
  if (bodyType === "form-data") {
    const filtered = requestHeaders.filter(
      (header) => header.name.toLowerCase() !== "content-type",
    );
    requestHeaders.splice(0, requestHeaders.length, ...filtered);
    contentType = undefined;
  } else if (expectedContentType) {
    if (contentType) contentType.value = expectedContentType;
    else requestHeaders.push({ name: "Content-Type", value: expectedContentType });
  }

  if (authType === "basic") {
    requestHeaders.push({
      name: "Authorization",
      value: `Basic ${encodeBasicAuth(
        resolveEnvironmentVariables(auth.username, variables),
        resolveEnvironmentVariables(auth.password, variables),
      )}`,
    });
  }
  if (authType === "api-key" && auth.apiKeyName) {
    requestHeaders.push({
      name: auth.apiKeyName,
      value: resolveEnvironmentVariables(auth.apiKeyValue, variables),
    });
  }

  return {
    method,
    url: resolveEnvironmentVariables(url, variables),
    headers: requestHeaders,
    bodyType,
    body:
      bodyType === "none"
        ? undefined
        : resolveEnvironmentVariables(body, variables),
  };
}

export function contentTypeForBody(type: string) {
  if (type === "urlencoded") return "application/x-www-form-urlencoded";
  if (type === "binary") return "application/octet-stream";
  if (type === "graphql" || type === "raw:json") return "application/json";
  if (type === "raw:xml") return "application/xml";
  if (type === "raw:html") return "text/html";
  if (type === "raw:text") return "text/plain";
  return null;
}

export function encodeBasicAuth(username: string, password: string) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)),
  );
}

const DEFAULT_AUTH: AuthState = {
  token: "",
  username: "",
  password: "",
  apiKeyName: "X-API-Key",
  apiKeyValue: "",
};

/**
 * Maps a persisted `SavedRequest` (JSON string fields, possibly legacy body
 * types) into the normalized `RequestConfig` the editor works with. Used by
 * the flow runner so a stored request executes exactly as it would from the
 * builder.
 */
export function savedRequestToConfig(saved: SavedRequest): RequestConfig {
  return {
    method: saved.method,
    url: saved.url,
    headers: parseSavedValue<Pair[]>(saved.headersJson, []),
    authType: saved.authType,
    auth: parseSavedValue<AuthState>(saved.authJson, DEFAULT_AUTH),
    bodyType: normalizeBodyType(saved.bodyType),
    body: normalizeBodyValue(saved.bodyType, saved.body),
  };
}

function parseSavedValue<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

function normalizeBodyType(type: string) {
  if (type === "json") return "raw:json";
  if (type === "text") return "raw:text";
  if (type === "form") return "urlencoded";
  return type || "none";
}

function normalizeBodyValue(type: string, body: string) {
  if (type !== "form" || isJsonArray(body)) return body;
  return JSON.stringify(
    body
      .split("&")
      .filter(Boolean)
      .map((part, index) => {
        const separator = part.indexOf("=");
        return {
          id: `legacy-form-${index}`,
          enabled: true,
          key: decodeURIComponent(separator < 0 ? part : part.slice(0, separator)),
          value: decodeURIComponent(separator < 0 ? "" : part.slice(separator + 1)),
        };
      }),
  );
}

function isJsonArray(value: string) {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}
