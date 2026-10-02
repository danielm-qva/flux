import type { SavedRequest } from "@/features/requests/request-client";

export type InsertTarget = "body" | "url" | "query" | "header" | "bearer";
export type RequestPatch = Pick<
  SavedRequest,
  "url" | "paramsJson" | "headersJson" | "authType" | "authJson" | "bodyType" | "body"
>;

/** Cómo se coloca la variable. Todo es opcional: sin opciones usa el nombre de la variable. */
export type InsertOptions = {
  /** body: nombre del campo (admite `usuario.id`) · query: nombre del parámetro · header: nombre del header */
  name?: string;
  /** header: texto antes del valor, p. ej. `Bearer` */
  prefix?: string;
  /** body JSON: entre comillas, como número/booleano, o tal cual */
  valueType?: "text" | "raw";
  /** URL: añadir al final de la ruta o sustituir un segmento existente */
  urlMode?: "append" | "replace";
  /** URL: posición del segmento a sustituir (índice dentro de `urlSegments`) */
  segmentIndex?: number;
};

type Pair = { id: string; enabled: boolean; key: string; value: string };
type BodyField = Pair & { kind: "text" | "file" };

const token = (name: string) => `{{${name}}}`;
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SENTINEL = "__FLUX_VARIABLE__";

function parseJson<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

export const TARGET_LABELS: Record<InsertTarget, string> = {
  body: "En el body",
  url: "En la URL",
  query: "Como query param",
  header: "Como header",
  bearer: "Como Bearer token",
};

/** Dónde se usa ya `{{name}}` en la petición, en palabras que entiende el usuario. */
export function variableUsage(request: SavedRequest, name: string): string[] {
  const pattern = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "i");
  const places: string[] = [];
  if (pattern.test(request.url)) places.push("URL");
  if (pattern.test(request.headersJson)) places.push("headers");
  if (pattern.test(request.authJson) && request.authType !== "none") places.push("auth");
  if (pattern.test(request.body)) places.push("body");
  return places;
}

type UrlParts = { origin: string; segments: string[]; trailingSlash: boolean; query: string; hash: string };

function splitUrl(url: string): UrlParts {
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const noHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = noHash.indexOf("?");
  const query = queryAt >= 0 ? noHash.slice(queryAt) : "";
  const noQuery = queryAt >= 0 ? noHash.slice(0, queryAt) : noHash;
  const origin = noQuery.match(/^(?:[a-z][a-z0-9+.-]*:\/\/[^/]*|\{\{[^}]*\}\})/i)?.[0] ?? "";
  const path = noQuery.slice(origin.length);
  return {
    origin,
    segments: path.split("/").filter(Boolean),
    trailingSlash: path.endsWith("/") && path.length > 1,
    query,
    hash,
  };
}

function joinUrl(parts: UrlParts) {
  const path = parts.segments.length ? `/${parts.segments.join("/")}${parts.trailingSlash ? "/" : ""}` : "";
  return `${parts.origin}${path}${parts.query}${parts.hash}`;
}

/** Segmentos de la ruta que se pueden sustituir (`/products/123/stock` → products, 123, stock). */
export function urlSegments(url: string): { index: number; text: string }[] {
  return splitUrl(url).segments.map((text, index) => ({ index, text }));
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".").map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return;
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    const current = cursor[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  cursor[keys[keys.length - 1]] = value;
}

function jsonWithVariable(base: Record<string, unknown>, path: string, name: string, valueType: "text" | "raw") {
  setPath(base, path, SENTINEL);
  const text = JSON.stringify(base, null, 2);
  return text.replace(`"${SENTINEL}"`, valueType === "raw" ? token(name) : JSON.stringify(token(name)));
}

function currentFields(request: SavedRequest): RequestPatch {
  return {
    url: request.url,
    paramsJson: request.paramsJson,
    headersJson: request.headersJson,
    authType: request.authType,
    authJson: request.authJson,
    bodyType: request.bodyType,
    body: request.body,
  };
}

/** Devuelve los campos de la petición con `{{name}}` ya colocado, o `null` si no se puede en ese destino. */
export function insertVariable(
  request: SavedRequest,
  name: string,
  target: InsertTarget,
  options: InsertOptions = {},
): RequestPatch | null {
  const next = currentFields(request);
  const value = token(name);
  const label = options.name?.trim() || name;

  if (target === "url") {
    const parts = splitUrl(next.url);
    if (options.urlMode === "replace" && options.segmentIndex !== undefined && parts.segments[options.segmentIndex] !== undefined) {
      parts.segments[options.segmentIndex] = value;
    } else {
      parts.segments.push(value);
    }
    next.url = joinUrl(parts);
    return next;
  }

  if (target === "query") {
    const rows = parseJson<Pair[]>(next.paramsJson, []).filter((row) => row.key || row.value);
    rows.push({ id: newId("param"), enabled: true, key: label, value });
    next.paramsJson = JSON.stringify(rows);
    const parts = splitUrl(next.url);
    parts.query = `${parts.query ? `${parts.query}&` : "?"}${encodeURIComponent(label)}=${value}`;
    next.url = joinUrl(parts);
    return next;
  }

  if (target === "header") {
    const headers = parseJson<Pair[]>(next.headersJson, []);
    const prefix = options.prefix?.trim();
    const header: Pair = { id: newId("header"), enabled: true, key: label, value: prefix ? `${prefix} ${value}` : value };
    const index = headers.findIndex((row) => row.key.trim().toLowerCase() === label.toLowerCase());
    next.headersJson = JSON.stringify(index >= 0 ? headers.map((row, i) => (i === index ? { ...header, id: row.id } : row)) : [...headers, header]);
    return next;
  }

  if (target === "bearer") {
    const auth = parseJson<Record<string, string>>(next.authJson, {});
    next.authType = "bearer";
    next.authJson = JSON.stringify({
      token: value,
      username: auth.username ?? "",
      password: auth.password ?? "",
      apiKeyName: auth.apiKeyName ?? "X-API-Key",
      apiKeyValue: auth.apiKeyValue ?? "",
    });
    const headers = parseJson<Pair[]>(next.headersJson, []);
    const index = headers.findIndex((row) => row.key.trim().toLowerCase() === "authorization");
    const header: Pair = {
      id: index >= 0 ? headers[index].id : "auth-bearer-header",
      enabled: true,
      key: "Authorization",
      value: `Bearer ${value}`,
    };
    next.headersJson = JSON.stringify(index >= 0 ? headers.map((row, i) => (i === index ? header : row)) : [...headers, header]);
    return next;
  }

  // body
  const type = next.bodyType;
  const valueType = options.valueType ?? "text";
  if (type === "none" || type === "") {
    next.bodyType = "raw:json";
    next.body = jsonWithVariable({}, label, name, valueType);
    return next;
  }
  if (type === "raw:json" || type === "json") {
    if (!next.body.trim()) {
      next.body = jsonWithVariable({}, label, name, valueType);
      return next;
    }
    try {
      const parsed = JSON.parse(next.body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        next.body = jsonWithVariable(parsed as Record<string, unknown>, label, name, valueType);
        return next;
      }
    } catch {
      /* JSON inválido: se añade al final como texto */
    }
    next.body = `${next.body.trimEnd()}\n${value}`;
    return next;
  }
  if (type === "urlencoded") {
    const rows = parseJson<Pair[]>(next.body, []).filter((row) => row.key || row.value);
    next.body = JSON.stringify([...rows, { id: newId("body-param"), enabled: true, key: label, value }]);
    return next;
  }
  if (type === "form-data") {
    const rows = parseJson<BodyField[]>(next.body, []).filter((row) => row.key || row.value);
    next.body = JSON.stringify([...rows, { id: newId("body-field"), enabled: true, key: label, value, kind: "text" }]);
    return next;
  }
  if (type.startsWith("raw:")) {
    next.body = `${next.body.trimEnd()}${next.body.trim() ? "\n" : ""}${value}`;
    return next;
  }
  return null; // binary / graphql: se edita desde la petición
}

/** Texto corto con el resultado, para enseñar una vista previa antes de aplicar. */
export function previewInsert(request: SavedRequest, name: string, target: InsertTarget, options: InsertOptions): string {
  const patch = insertVariable(request, name, target, options);
  if (!patch) return "Este tipo de body se edita desde la petición.";
  if (target === "url") return patch.url;
  if (target === "query") return patch.url;
  if (target === "body") return patch.body;
  const header = parseJson<Pair[]>(patch.headersJson, []).find((row) =>
    target === "bearer" ? row.key === "Authorization" : row.key.toLowerCase() === (options.name?.trim() || name).toLowerCase(),
  );
  return header ? `${header.key}: ${header.value}` : "";
}

// ---------------------------------------------------------------------------
// Dónde se usa ya una variable, y cómo quitarla de ese sitio.
// ---------------------------------------------------------------------------

export type VariableUsage = { id: string; place: string; detail: string };

const RAW = "__FLUX_RAW__";
const hasToken = (text: string, name: string) => new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "i").test(text);
const stripToken = (text: string, name: string) => text.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi"), "");

/** Lee el body JSON aunque tenga `{{x}}` sin comillas (se marca para restaurarlo luego). */
function parseBodyJson(body: string, name: string): unknown | undefined {
  const prepared = body.replace(new RegExp(`(:\\s*)\\{\\{\\s*${name}\\s*\\}\\}`, "gi"), `$1"${RAW}"`);
  try {
    return JSON.parse(prepared);
  } catch {
    return undefined;
  }
}

const stringifyBody = (value: unknown, name: string) => JSON.stringify(value, null, 2).split(`"${RAW}"`).join(token(name));

function leafPaths(value: unknown, name: string, path = ""): string[] {
  if (typeof value === "string") return value === RAW || hasToken(value, name) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((child, index) => leafPaths(child, name, `${path}[${index}]`));
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leafPaths(child, name, path ? `${path}.${key}` : key));
  return [];
}

function removeAtPath(root: unknown, path: string): unknown {
  const keys = [...path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((match) => (match[2] !== undefined ? Number(match[2]) : match[1]));
  const walk = (node: unknown, depth: number): unknown => {
    const key = keys[depth];
    if (key === undefined || node === null || typeof node !== "object") return node;
    if (depth === keys.length - 1) {
      if (Array.isArray(node)) return node.filter((_, index) => index !== key);
      const { [key as string]: _removed, ...rest } = node as Record<string, unknown>;
      void _removed;
      return rest;
    }
    const child = walk((node as Record<string | number, unknown>)[key as string], depth + 1);
    const empty = child && typeof child === "object" && !Array.isArray(child) && Object.keys(child).length === 0;
    if (Array.isArray(node)) return node.flatMap((item, index) => (index === key ? (empty ? [] : [child]) : [item]));
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).flatMap(([entryKey, entryValue]) =>
        entryKey === key ? (empty ? [] : [[entryKey, child]]) : [[entryKey, entryValue]],
      ),
    );
  };
  return walk(root, 0);
}

export function findUsages(request: SavedRequest, name: string): VariableUsage[] {
  const usages: VariableUsage[] = [];

  const url = splitUrl(request.url);
  url.segments.forEach((segment, index) => {
    if (hasToken(segment, name)) usages.push({ id: `url-seg:${index}`, place: "URL · ruta", detail: `/${url.segments.join("/")}` });
  });
  url.query
    .replace(/^\?/, "")
    .split("&")
    .filter(Boolean)
    .forEach((pair) => {
      if (hasToken(pair, name)) usages.push({ id: `url-query:${pair.split("=")[0]}`, place: "URL · query", detail: decodeURIComponent(pair.split("=")[0]) });
    });

  const auth = parseJson<Record<string, string>>(request.authJson, {});
  const authUses = request.authType !== "none" && Object.values(auth).some((value) => typeof value === "string" && hasToken(value, name));
  if (authUses) usages.push({ id: "auth", place: request.authType === "bearer" ? "Bearer token" : "Autorización", detail: request.authType });

  parseJson<Pair[]>(request.headersJson, []).forEach((row) => {
    const isBearerHeader = authUses && request.authType === "bearer" && row.key.trim().toLowerCase() === "authorization";
    if (!isBearerHeader && hasToken(row.value, name)) usages.push({ id: `header:${row.id}`, place: "Header", detail: row.key });
  });

  const type = request.bodyType;
  if (type === "urlencoded" || type === "form-data") {
    parseJson<Pair[]>(request.body, []).forEach((row) => {
      if (hasToken(row.value, name)) usages.push({ id: `form:${row.id}`, place: "Body", detail: row.key });
    });
  } else if (hasToken(request.body, name)) {
    const parsed = type === "raw:json" || type === "json" ? parseBodyJson(request.body, name) : undefined;
    if (parsed !== undefined) leafPaths(parsed, name).forEach((path) => usages.push({ id: `body:${path}`, place: "Body", detail: path || "(valor)" }));
    else usages.push({ id: "body-text", place: "Body", detail: "texto" });
  }
  return usages;
}

/** Quita la variable de un sitio concreto (`usageId` de `findUsages`) y devuelve los campos resultantes. */
export function removeUsage(request: SavedRequest, name: string, usageId: string): RequestPatch {
  const next = currentFields(request);
  const [kind, ...rest] = usageId.split(":");
  const key = rest.join(":");

  if (kind === "url-seg") {
    const parts = splitUrl(next.url);
    parts.segments.splice(Number(key), 1);
    next.url = joinUrl(parts);
  } else if (kind === "url-query") {
    const parts = splitUrl(next.url);
    const remaining = parts.query.replace(/^\?/, "").split("&").filter((pair) => pair && !(pair.split("=")[0] === key && hasToken(pair, name)));
    parts.query = remaining.length ? `?${remaining.join("&")}` : "";
    next.url = joinUrl(parts);
    next.paramsJson = JSON.stringify(parseJson<Pair[]>(next.paramsJson, []).filter((row) => !(row.key === decodeURIComponent(key) && hasToken(row.value, name))));
  } else if (kind === "auth") {
    const auth = parseJson<Record<string, string>>(next.authJson, {});
    const cleaned = Object.fromEntries(Object.entries(auth).map(([field, value]) => [field, typeof value === "string" && hasToken(value, name) ? "" : value]));
    next.authJson = JSON.stringify(cleaned);
    if (next.authType === "bearer") {
      next.authType = "none";
      next.headersJson = JSON.stringify(
        parseJson<Pair[]>(next.headersJson, []).filter((row) => !(row.key.trim().toLowerCase() === "authorization" && hasToken(row.value, name))),
      );
    }
  } else if (kind === "header") {
    next.headersJson = JSON.stringify(parseJson<Pair[]>(next.headersJson, []).filter((row) => row.id !== key));
  } else if (kind === "form") {
    next.body = JSON.stringify(parseJson<Pair[]>(next.body, []).filter((row) => row.id !== key));
  } else if (kind === "body") {
    const parsed = parseBodyJson(next.body, name);
    if (parsed !== undefined) {
      const cleaned = removeAtPath(parsed, key);
      const empty = cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0;
      next.body = empty ? "" : stringifyBody(cleaned, name);
      if (empty) next.bodyType = "none";
    }
  } else if (kind === "body-text") {
    next.body = stripToken(next.body, name).replace(/\n{2,}/g, "\n").trim();
  }
  return next;
}
