"use client";

import {
  Check,
  ChevronDown,
  CirclePlus,
  ClipboardPaste,
  Copy,
  LoaderCircle,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

import {
  resolveEnvironmentVariables,
  type EnvironmentVariable,
  type Workspace,
} from "@/features/workspaces/workspace-client";
import {
  executeHttpRequest,
  savedRequestApi,
  type HttpResponse,
  type SavedRequest,
} from "./request-client";
import { JsonTree } from "./json-tree";
import { EnvironmentAutocomplete } from "./environment-autocomplete";
import { parseCurlCommand } from "./curl-parser";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
type Tab = "params" | "headers" | "auth" | "body";
type Pair = { id: string; enabled: boolean; key: string; value: string };
type AuthState = {
  token: string;
  username: string;
  password: string;
  apiKeyName: string;
  apiKeyValue: string;
};

const METHOD_COLORS: Partial<Record<HttpMethod, string>> = {
  GET: "text-emerald-300",
  POST: "text-amber-300",
  PUT: "text-sky-300",
  PATCH: "text-violet-300",
  DELETE: "text-rose-300",
  HEAD: "text-emerald-200",
  OPTIONS: "text-pink-300",
};

export function RequestBuilder({
  userId,
  workspace,
  variables,
  request,
  onSaved,
  onExecuted,
}: {
  userId: string;
  workspace: Workspace;
  variables: EnvironmentVariable[];
  request: SavedRequest;
  onSaved: (request: SavedRequest) => void;
  onExecuted?: (result: { method: string; resolvedUrl: string; response?: HttpResponse; error?: string }) => void;
}) {
  const [method, setMethod] = useState<HttpMethod>(() =>
    HTTP_METHODS.includes(request.method as HttpMethod)
      ? (request.method as HttpMethod)
      : "GET",
  );
  const [url, setUrl] = useState(request.url);
  const [tab, setTab] = useState<Tab>("params");
  const [params, setParams] = useState<Pair[]>(() =>
    parseSavedValue(request.paramsJson, [
      { id: "param-1", enabled: true, key: "", value: "" },
    ]),
  );
  const [headers, setHeaders] = useState<Pair[]>(() =>
    parseSavedValue(request.headersJson, [
      {
        id: "header-1",
        enabled: true,
        key: "Content-Type",
        value: "application/json",
      },
    ]),
  );
  const [authType, setAuthType] = useState(request.authType);
  const [auth, setAuth] = useState<AuthState>(() =>
    parseSavedValue(request.authJson, {
      token: "",
      username: "",
      password: "",
      apiKeyName: "X-API-Key",
      apiKeyValue: "",
    }),
  );
  const [bodyType, setBodyType] = useState(request.bodyType);
  const [body, setBody] = useState(request.body);
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [curlImporterOpen, setCurlImporterOpen] = useState(false);
  const resolvedUrl = resolveEnvironmentVariables(url, variables);

  function updateParams(next: Pair[]) {
    setParams(next);
    const [withoutHash, hash = ""] = url.split("#", 2);
    const base = withoutHash.split("?", 1)[0];
    const query = next
      .filter((item) => item.enabled && item.key)
      .map(
        (item) =>
          `${encodeURIComponent(item.key)}=${encodeTemplateValue(item.value)}`,
      )
      .join("&");
    setUrl(`${base}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`);
  }

  function syncBearerHeader(token: string) {
    setHeaders((rows) => {
      const authorizationIndex = rows.findIndex(
        (row) => row.key.trim().toLowerCase() === "authorization",
      );
      const authorization: Pair = {
        id:
          authorizationIndex >= 0
            ? rows[authorizationIndex].id
            : "auth-bearer-header",
        enabled: true,
        key: "Authorization",
        value: `Bearer ${token}`,
      };

      return authorizationIndex >= 0
        ? rows.map((row, index) =>
            index === authorizationIndex ? authorization : row,
          )
        : [...rows, authorization];
    });
  }

  function changeAuthType(nextType: string) {
    setAuthType(nextType);
    if (nextType === "bearer") {
      syncBearerHeader(auth.token);
      return;
    }
    if (authType === "bearer") {
      setHeaders((rows) =>
        rows.filter(
          (row) =>
            !(
              row.key.trim().toLowerCase() === "authorization" &&
              row.value.startsWith("Bearer ")
            ),
        ),
      );
    }
  }

  function changeAuth(nextAuth: AuthState) {
    setAuth(nextAuth);
    if (authType === "bearer") syncBearerHeader(nextAuth.token);
  }

  async function sendRequest() {
    setSending(true);
    setRequestError(null);
    try {
      const requestHeaders = headers
        .filter((item) => item.enabled && item.key.trim())
        .map((item) => ({
          name: item.key.trim(),
          value: resolveEnvironmentVariables(item.value, variables),
        }));
      const contentType = requestHeaders.find(
        (header) => header.name.toLowerCase() === "content-type",
      );
      if (contentType?.value === "application/json" && bodyType === "text")
        contentType.value = "text/plain";
      if (contentType?.value === "application/json" && bodyType === "form")
        contentType.value = "application/x-www-form-urlencoded";
      if (authType === "basic")
        requestHeaders.push({
          name: "Authorization",
          value: `Basic ${encodeBasicAuth(resolveEnvironmentVariables(auth.username, variables), resolveEnvironmentVariables(auth.password, variables))}`,
        });
      if (authType === "api-key" && auth.apiKeyName)
        requestHeaders.push({
          name: auth.apiKeyName,
          value: resolveEnvironmentVariables(auth.apiKeyValue, variables),
        });
      const result = await executeHttpRequest({
        method,
        url: resolvedUrl,
        headers: requestHeaders,
        body:
          bodyType === "none"
            ? undefined
            : resolveEnvironmentVariables(body, variables),
        timeoutMs: 30_000,
      });
      setResponse(result);
      onExecuted?.({ method, resolvedUrl, response: result });
    } catch (cause) {
      setResponse(null);
      const message = String(cause);
      setRequestError(message);
      onExecuted?.({ method, resolvedUrl, error: message });
    } finally {
      setSending(false);
    }
  }

  async function saveRequest() {
    setSaving(true);
    try {
      const saved = await savedRequestApi.update(userId, {
        id: request.id,
        name: request.name,
        method,
        url,
        paramsJson: JSON.stringify(params),
        headersJson: JSON.stringify(headers),
        authType,
        authJson: JSON.stringify(auth),
        bodyType,
        body,
      });
      onSaved(saved);
      toast.success("Petición guardada", {
        description: `${saved.name} se actualizó en ${workspace.name}.`,
      });
    } catch (cause) {
      toast.error("No se pudo guardar la petición", {
        description: String(cause),
      });
    } finally {
      setSaving(false);
    }
  }

  function importCurl(source: string) {
    const parsed = parseCurlCommand(source);
    if (!HTTP_METHODS.includes(parsed.method as HttpMethod)) {
      throw new Error(`El método ${parsed.method} no está disponible en Flux.`);
    }

    setMethod(parsed.method as HttpMethod);
    setUrl(parsed.url);
    setParams(paramsFromUrl(parsed.url));
    setHeaders(
      parsed.headers.length
        ? parsed.headers.map((header, index) => ({
            id: `curl-header-${index}-${Date.now()}`,
            enabled: true,
            key: header.name,
            value: header.value,
          }))
        : [
            {
              id: `curl-header-${Date.now()}`,
              enabled: true,
              key: "",
              value: "",
            },
          ],
    );
    setBodyType(parsed.bodyType);
    setBody(parsed.body);
    if (parsed.auth.type === "bearer") {
      const token = parsed.auth.token;
      setAuthType("bearer");
      setAuth((current) => ({ ...current, token }));
    } else if (parsed.auth.type === "basic") {
      const { username, password } = parsed.auth;
      setAuthType("basic");
      setAuth((current) => ({
        ...current,
        username,
        password,
      }));
    } else {
      setAuthType("none");
    }
    setResponse(null);
    setRequestError(null);
    setCurlImporterOpen(false);
    toast.success("cURL importado", {
      description:
        "Revisa la configuración y guarda la petición cuando esté lista.",
    });
  }

  return (
    <section className="h-full min-h-0 w-full self-start pt-1">
      <div className="flex h-6 items-center justify-between gap-3">
        <p className="truncate text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {request.name} · {workspace.name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={saveRequest}
            disabled={saving}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-violet-400/20 bg-violet-500/[0.07] px-2.5 text-[10px] font-medium text-violet-200 hover:bg-violet-500/15 disabled:cursor-wait disabled:opacity-65"
          >
            {saving ? <LoaderCircle size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Guardando" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setCurlImporterOpen(true)}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] px-2.5 text-[10px] text-muted-foreground hover:border-violet-400/20 hover:bg-violet-400/10 hover:text-violet-200"
          >
            <ClipboardPaste size={12} /> Importar cURL
          </button>
        </div>
      </div>
      <div className="mt-3 grid h-[calc(100%-24px)] min-h-0 grid-cols-[minmax(460px,1.08fr)_minmax(380px,0.92fr)] gap-4 max-xl:grid-cols-1 max-xl:grid-rows-[minmax(0,1fr)_minmax(0,0.72fr)] max-lg:gap-2">
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="rounded-xl border border-white/[0.07] bg-[#120c1e] p-4">
            <div className="grid grid-cols-[140px_minmax(0,1fr)_105px] gap-2 max-lg:grid-cols-[120px_minmax(0,1fr)_100px] max-sm:grid-cols-[110px_minmax(0,1fr)]">
              <label className="relative">
                <span className="mb-1.5 block text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Método
                </span>
                <select
                  value={method}
                  onChange={(event) =>
                    setMethod(event.target.value as HttpMethod)
                  }
                  className={`h-11 w-full appearance-none rounded-lg border border-white/[0.08] bg-[#1b112c] px-3 pr-8 font-mono text-xs font-bold outline-none focus:border-violet-400/50 ${METHOD_COLORS[method] ?? "text-violet-200"}`}
                >
                  {HTTP_METHODS.map((item) => (
                    <option
                      key={item}
                      value={item}
                      className={`bg-[#1b112c] font-mono font-bold ${METHOD_COLORS[item]}`}
                    >
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-3 bottom-3.5 text-muted-foreground"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  URL
                </span>
                <EnvironmentAutocomplete
                  id="request-url"
                  value={url}
                  onChange={setUrl}
                  variables={variables}
                  highlightVariables
                  placeholder="{{BASE_URL}}/v1/resource"
                  className="h-11 w-full rounded-lg border border-white/[0.08] bg-transparent px-3 font-mono text-xs text-white outline-none placeholder:text-muted-foreground/40 focus:border-violet-400/50"
                />
              </label>
              <button
                type="button"
                onClick={sendRequest}
                disabled={sending}
                className="mt-[21px] flex h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-65 max-sm:col-span-2 max-sm:mt-1"
              >
                {sending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}{" "}
                {sending ? "Enviando" : "Enviar"}
              </button>
            </div>
            <p className="mt-2 truncate text-[10px] text-muted-foreground">
              URL resuelta:{" "}
              <span
                className={
                  resolvedUrl === url && url.includes("{{")
                    ? "text-amber-300"
                    : "text-violet-200"
                }
              >
                {resolvedUrl}
              </span>
            </p>
          </div>

          <div className="mt-4 min-h-[360px] overflow-hidden rounded-xl border border-white/[0.07] bg-[#120c1e]">
            <div className="flex border-b border-white/[0.06] px-3">
              <TabButton
                label="Params"
                count={params.filter((item) => item.enabled && item.key).length}
                active={tab === "params"}
                onClick={() => setTab("params")}
              />
              <TabButton
                label="Headers"
                count={
                  headers.filter((item) => item.enabled && item.key).length
                }
                active={tab === "headers"}
                onClick={() => setTab("headers")}
              />
              <TabButton
                label="Auth"
                active={tab === "auth"}
                onClick={() => setTab("auth")}
              />
              <TabButton
                label="Body"
                active={tab === "body"}
                onClick={() => setTab("body")}
              />
            </div>
            {tab === "params" ? (
              <PairsEditor
                title="Query params"
                rows={params}
                onChange={updateParams}
                variables={variables}
              />
            ) : null}
            {tab === "headers" ? (
              <PairsEditor
                title="Headers"
                rows={headers}
                onChange={setHeaders}
                variables={variables}
                keyPlaceholder="Authorization"
                valuePlaceholder="Bearer {{TOKEN}}"
              />
            ) : null}
            {tab === "auth" ? (
              <AuthEditor
                type={authType}
                onTypeChange={changeAuthType}
                value={auth}
                onChange={changeAuth}
                variables={variables}
              />
            ) : null}
            {tab === "body" ? (
              <BodyEditor
                type={bodyType}
                onTypeChange={setBodyType}
                value={body}
                onChange={setBody}
                variables={variables}
              />
            ) : null}
          </div>
          {requestError ? (
            <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">
              {requestError}
            </div>
          ) : null}
        </div>
        <ResponsePanel response={response} loading={sending} />
      </div>
      {curlImporterOpen ? (
        <CurlImportDialog
          onClose={() => setCurlImporterOpen(false)}
          onImport={importCurl}
        />
      ) : null}
    </section>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-12 items-center gap-2 px-4 text-xs ${active ? "text-violet-200" : "text-muted-foreground hover:text-white"}`}
    >
      {label}
      {count ? (
        <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] text-violet-300">
          {count}
        </span>
      ) : null}
      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-px bg-violet-400" />
      ) : null}
    </button>
  );
}

function PairsEditor({
  title,
  rows,
  onChange,
  variables,
  keyPlaceholder = "page",
  valuePlaceholder = "1",
}: {
  title: string;
  rows: Pair[];
  onChange: (rows: Pair[]) => void;
  variables: EnvironmentVariable[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  function patch(id: string, values: Partial<Pair>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...values } : row)));
  }
  function add() {
    onChange([
      ...rows,
      { id: `${title}-${Date.now()}`, enabled: true, key: "", value: "" },
    ]);
  }
  function remove(id: string) {
    const next = rows.filter((row) => row.id !== id);
    onChange(
      next.length
        ? next
        : [{ id: `${title}-${Date.now()}`, enabled: true, key: "", value: "" }],
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/[0.045] px-5 py-3">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {title}
        </span>
        <button
          type="button"
          onClick={add}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-violet-300 hover:bg-violet-400/10"
        >
          <CirclePlus size={14} /> Añadir
        </button>
      </div>
      <div className="grid grid-cols-[32px_minmax(130px,0.8fr)_minmax(180px,1.2fr)_42px] border-b border-white/[0.04] px-4 py-2 text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
        <span />
        <span>Clave</span>
        <span>Valor</span>
        <span />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[32px_minmax(130px,0.8fr)_minmax(180px,1.2fr)_42px] items-center border-b border-white/[0.04] px-4 py-2"
        >
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(event) =>
              patch(row.id, { enabled: event.target.checked })
            }
            className="accent-violet-500"
            aria-label="Activar fila"
          />
          <input
            value={row.key}
            onChange={(event) => patch(row.id, { key: event.target.value })}
            placeholder={keyPlaceholder}
            className="h-9 border-r border-white/[0.05] bg-transparent px-3 font-mono text-xs text-violet-100 outline-none placeholder:text-muted-foreground/35"
          />
          <EnvironmentAutocomplete
            value={row.value}
            onChange={(value) => patch(row.id, { value })}
            variables={variables}
            placeholder={valuePlaceholder}
            className="h-9 min-w-0 w-full bg-transparent px-3 font-mono text-xs text-white outline-none placeholder:text-muted-foreground/35"
          />
          <button
            type="button"
            onClick={() => remove(row.id)}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-300"
            aria-label="Eliminar fila"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function AuthEditor({
  type,
  onTypeChange,
  value,
  onChange,
  variables,
}: {
  type: string;
  onTypeChange: (type: string) => void;
  value: AuthState;
  onChange: (value: AuthState) => void;
  variables: EnvironmentVariable[];
}) {
  const patch = (key: keyof AuthState, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="p-5">
      <label className="block max-w-xs text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Tipo de autorización
        <select
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
          className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-[#1b112c] px-3 text-xs text-white outline-none"
        >
          <option value="none">Sin autorización</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic auth</option>
          <option value="api-key">API key</option>
        </select>
      </label>
      {type === "bearer" ? (
        <Field
          label="Token"
          placeholder="{{ACCESS_TOKEN}}"
          value={value.token}
          onChange={(next) => patch("token", next)}
          variables={variables}
        />
      ) : null}
      {type === "basic" ? (
        <div className="grid max-w-2xl grid-cols-2 gap-3">
          <Field
            label="Usuario"
            placeholder="usuario"
            value={value.username}
            onChange={(next) => patch("username", next)}
            variables={variables}
          />
          <Field
            label="Contraseña"
            placeholder="••••••••"
            value={value.password}
            onChange={(next) => patch("password", next)}
            variables={variables}
          />
        </div>
      ) : null}
      {type === "api-key" ? (
        <div className="grid max-w-2xl grid-cols-2 gap-3">
          <Field
            label="Clave"
            placeholder="X-API-Key"
            value={value.apiKeyName}
            onChange={(next) => patch("apiKeyName", next)}
            variables={variables}
          />
          <Field
            label="Valor"
            placeholder="{{API_KEY}}"
            value={value.apiKeyValue}
            onChange={(next) => patch("apiKeyValue", next)}
            variables={variables}
          />
        </div>
      ) : null}
      {type === "none" ? (
        <p className="mt-12 text-center text-xs text-muted-foreground">
          Esta petición no añadirá autorización automáticamente.
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  variables,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  variables: EnvironmentVariable[];
}) {
  return (
    <label className="mt-5 block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {label}
      <EnvironmentAutocomplete
        value={value}
        onChange={onChange}
        variables={variables}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-black/15 px-3 font-mono text-xs text-white outline-none focus:border-violet-400/40"
      />
    </label>
  );
}

function BodyEditor({
  type,
  onTypeChange,
  value,
  onChange,
  variables,
}: {
  type: string;
  onTypeChange: (type: string) => void;
  value: string;
  onChange: (value: string) => void;
  variables: EnvironmentVariable[];
}) {
  return (
    <div>
      <div className="flex gap-1 border-b border-white/[0.045] px-5 py-3">
        {[
          ["none", "Ninguno"],
          ["json", "JSON"],
          ["text", "Text"],
          ["form", "Form URL Encoded"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTypeChange(id)}
            className={`h-8 rounded-md px-3 text-[10px] ${type === id ? "bg-violet-600 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {type === "none" ? (
        <p className="py-24 text-center text-xs text-muted-foreground">
          Esta petición no enviará body.
        </p>
      ) : (
        <EnvironmentAutocomplete
          value={value}
          onChange={onChange}
          variables={variables}
          multiline
          ariaLabel="Body de la petición"
          className="min-h-[290px] w-full resize-none bg-[#10091c] p-5 font-mono text-xs leading-6 text-violet-100 outline-none"
        />
      )}
    </div>
  );
}

function ResponsePanel({
  response,
  loading,
}: {
  response: HttpResponse | null;
  loading: boolean;
}) {
  const [view, setView] = useState<"pretty" | "raw" | "headers">("pretty");
  const [copied, setCopied] = useState(false);
  const content = response
    ? view === "headers"
      ? response.headers
          .map((header) => `${header.name}: ${header.value}`)
          .join("\n")
      : response.body
    : "";
  async function copy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#120c1e]">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[9px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          <span>Response</span>
          {response ? (
            <>
              <span
                className={`rounded px-2 py-1 ${statusColor(response.status)}`}
              >
                {response.status} {response.statusText}
              </span>
              <span className="tracking-normal normal-case">
                {response.durationMs} ms
              </span>
              <span className="tracking-normal normal-case">
                {formatBytes(response.sizeBytes)}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {response ? (
            <>
              <ResponseViewButton
                active={view === "pretty"}
                onClick={() => setView("pretty")}
              >
                JSON
              </ResponseViewButton>
              <ResponseViewButton
                active={view === "raw"}
                onClick={() => setView("raw")}
              >
                Raw
              </ResponseViewButton>
              <ResponseViewButton
                active={view === "headers"}
                onClick={() => setView("headers")}
              >
                Headers ({response.headers.length})
              </ResponseViewButton>
              {view !== "pretty" ? (
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copiar respuesta"
                  className="ml-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white"
                >
                  {copied ? (
                    <Check size={13} className="text-emerald-300" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="grid h-full min-h-[170px] place-items-center text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <LoaderCircle
                size={15}
                className="animate-spin text-violet-400"
              />{" "}
              Esperando respuesta…
            </span>
          </div>
        ) : response ? (
          view === "pretty" ? (
            <JsonTree source={response.body} />
          ) : (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-6 text-violet-100">
              {content || "La respuesta no contiene body."}
            </pre>
          )
        ) : (
          <div className="grid h-full min-h-[170px] place-items-center text-xs text-muted-foreground">
            Envía una petición para ver aquí su respuesta.
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-2 text-[10px] ${active ? "bg-violet-500/15 text-violet-200" : "text-muted-foreground hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function CurlImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (source: string) => void;
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      onImport(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="curl-import-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
            <ClipboardPaste size={18} />
          </div>
          <div>
            <h2
              id="curl-import-title"
              className="font-sans text-lg font-semibold text-white"
            >
              Importar desde cURL
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Flux analizará el comando localmente. No lo ejecutará ni enviará
              información hasta que pulses Enviar.
            </p>
          </div>
        </div>
        <label className="mt-5 block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Comando cURL
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            required
            autoFocus
            spellCheck={false}
            placeholder={`curl --request POST 'https://api.example.com/users' \\\n+  --header 'Content-Type: application/json' \\\n+  --data '{"name":"Flux"}'`}
            className="mt-2 min-h-56 w-full resize-y rounded-xl border border-white/10 bg-[#0d0818] p-4 font-mono text-xs leading-6 text-violet-100 outline-none placeholder:text-muted-foreground/30 focus:border-violet-400/40"
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-400/15 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
          >
            <ClipboardPaste size={13} /> Importar petición
          </button>
        </div>
      </form>
    </div>
  );
}

function statusColor(status: number) {
  if (status >= 200 && status < 300)
    return "bg-emerald-400/15 text-emerald-300";
  if (status >= 300 && status < 400) return "bg-sky-400/15 text-sky-300";
  if (status >= 400 && status < 500) return "bg-amber-400/15 text-amber-300";
  return "bg-rose-400/15 text-rose-300";
}
function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function encodeBasicAuth(username: string, password: string) {
  return btoa(
    String.fromCharCode(...new TextEncoder().encode(`${username}:${password}`)),
  );
}
function encodeTemplateValue(value: string) {
  return value
    .split(/(\{\{[A-Za-z_][A-Za-z0-9_]*\}\})/g)
    .map((part) =>
      /^\{\{.+\}\}$/.test(part) ? part : encodeURIComponent(part),
    )
    .join("");
}

function parseSavedValue<T>(source: string, fallback: T): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    return fallback;
  }
}

function paramsFromUrl(url: string): Pair[] {
  const query = url.split("#", 1)[0].split("?", 2)[1] ?? "";
  const rows = [...new URLSearchParams(query).entries()].map(
    ([key, value], index) => ({
      id: `curl-param-${index}-${Date.now()}`,
      enabled: true,
      key,
      value,
    }),
  );
  return rows.length
    ? rows
    : [{ id: `curl-param-${Date.now()}`, enabled: true, key: "", value: "" }];
}
