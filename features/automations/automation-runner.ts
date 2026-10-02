import { executeHttpRequest, type SavedRequest } from "@/features/requests/request-client";
import { prepareHttpRequest, savedRequestToConfig } from "@/features/requests/prepare-http-request";
import { getByPath } from "@/features/flows/get-by-path";
import type { Automation, AutomationActions, AutomationSchedule } from "./automation-client";

export type AttemptResult =
  | { ok: true; httpStatus: number; durationMs: number; values: { variable: string; value: string }[] }
  | { ok: false; httpStatus?: number; durationMs?: number; error: string };

export const isDue = (automation: Automation, nowMs: number) =>
  automation.enabled && automation.nextRunAt !== null && Date.parse(automation.nextRunAt) <= nowMs;

/** La siguiente ejecución se cuenta desde que termina esta, así los retrasos no se acumulan. */
export const nextRunIso = (schedule: AutomationSchedule, fromMs: number) =>
  new Date(fromMs + schedule.everySeconds * 1000).toISOString();

export function formatEvery(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Un intento: prepara la petición, la envía y extrae los valores. Un valor ausente cuenta como fallo. */
export async function attemptRun(
  request: SavedRequest,
  envVariables: { key: string; value: string }[],
  actions: AutomationActions,
): Promise<AttemptResult> {
  const startedAt = performance.now();
  try {
    const prepared = prepareHttpRequest(savedRequestToConfig(request), envVariables);
    const response = await executeHttpRequest({ ...prepared, timeoutMs: 30_000 });
    const durationMs = Math.round(performance.now() - startedAt);
    if (response.status >= 400) {
      return {
        ok: false,
        httpStatus: response.status,
        durationMs,
        error: `La petición respondió ${response.status} ${response.statusText}`.trim(),
      };
    }

    const wanted = actions.onSuccess.saveVariables.filter((item) => item.path.trim() && item.variable.trim());
    const values: { variable: string; value: string }[] = [];
    if (wanted.length) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        return { ok: false, httpStatus: response.status, durationMs, error: "La respuesta no es JSON." };
      }
      for (const item of wanted) {
        const found = getByPath(parsed, item.path);
        if (found === undefined || found === null) {
          return {
            ok: false,
            httpStatus: response.status,
            durationMs,
            error: `Sin coincidencia para ${item.path}`,
          };
        }
        values.push({
          variable: item.variable.trim(),
          value: typeof found === "object" ? JSON.stringify(found) : String(found),
        });
      }
    }
    return { ok: true, httpStatus: response.status, durationMs: Math.round(performance.now() - startedAt), values };
  } catch (cause) {
    return { ok: false, error: String(cause).slice(0, 300) };
  }
}

/** Rutas con aspecto de token/identificador en una respuesta, para sugerirlas al configurar. */
export function candidatePaths(body: string | undefined): string[] {
  if (!body) return [];
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return [];
  }
  const found: string[] = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 3 || value === null || found.length >= 8) return;
    if (Array.isArray(value)) {
      if (value.length) visit(value[0], `${path}[0]`, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (typeof child === "string" && /token|access|refresh|session|jwt|key|secret|id$/i.test(key)) found.push(childPath);
      else visit(child, childPath, depth + 1);
    }
  };
  visit(root, "$", 0);
  return found;
}
