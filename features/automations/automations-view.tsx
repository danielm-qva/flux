"use client";

import { ChevronDown, Clock, Pause, Play, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import type { SavedRequest } from "@/features/requests/request-client";
import { automationApi, parseActions, parseSchedule, type Automation, type AutomationRun } from "./automation-client";
import { formatEvery } from "./automation-runner";
import type { AutomationsApi } from "./use-automations";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function countdown(targetIso: string | null, now: number) {
  if (!targetIso) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(targetIso) - now) / 1000));
  if (seconds === 0) return "ahora";
  if (seconds < 60) return `en ${seconds} s`;
  if (seconds < 3600) return `en ${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  return `en ${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function AutomationsView({
  userId,
  api,
  requests,
  onOpenRequest,
}: {
  userId: string;
  api: AutomationsApi;
  requests: SavedRequest[];
  onOpenRequest: (request: SavedRequest) => void;
}) {
  const now = useNow();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="mx-auto h-full w-full max-w-3xl self-start overflow-y-auto py-2">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-[var(--flux-primary-soft)] text-[var(--flux-primary-text)]">
          <Clock size={17} />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-white">Automatizaciones</h1>
          <p className="text-xs text-muted-foreground">Se ejecutan solas mientras Flux esté abierto, en el workspace activo.</p>
        </div>
      </div>

      {api.items.length === 0 ? (
        <div className="mt-8 rounded-xl px-6 py-12 text-center ring-1 ring-[var(--flux-line)]">
          <Zap size={22} className="mx-auto text-muted-foreground/70" />
          <p className="mt-3 text-sm text-zinc-200">Todavía no hay automatizaciones</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
            Abre una petición y pulsa el icono de reloj para ejecutarla cada cierto tiempo, por ejemplo un login que renueva tu token.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2.5">
          {api.items.map((automation) => (
            <AutomationCard
              key={automation.id}
              userId={userId}
              automation={automation}
              request={requests.find((item) => item.id === automation.requestId)}
              running={api.runningIds.has(automation.id)}
              now={now}
              expanded={openId === automation.id}
              onToggleExpanded={() => setOpenId((current) => (current === automation.id ? null : automation.id))}
              api={api}
              onOpenRequest={onOpenRequest}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AutomationCard({
  userId,
  automation,
  request,
  running,
  now,
  expanded,
  onToggleExpanded,
  api,
  onOpenRequest,
}: {
  userId: string;
  automation: Automation;
  request: SavedRequest | undefined;
  running: boolean;
  now: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  api: AutomationsApi;
  onOpenRequest: (request: SavedRequest) => void;
}) {
  const schedule = parseSchedule(automation);
  const actions = parseActions(automation);
  const paused = !automation.enabled;
  const failing = automation.lastStatus === "failed";
  const [runs, setRuns] = useState<AutomationRun[]>([]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    automationApi
      .runs(userId, automation.id)
      .then((list) => active && setRuns(list))
      .catch(() => active && setRuns([]));
    return () => {
      active = false;
    };
  }, [expanded, userId, automation.id, automation.lastRunAt]);

  return (
    <li className="rounded-xl bg-[var(--flux-panel)] ring-1 ring-[var(--flux-line)]">
      <div className="flex items-center gap-3 p-3.5">
        <span className={`size-2.5 shrink-0 rounded-full ${running ? "animate-pulse bg-[var(--flux-primary)]" : paused ? "bg-zinc-500" : failing ? "bg-rose-400" : "bg-emerald-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{automation.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {request ? (
              <button type="button" onClick={() => onOpenRequest(request)} className="hover:text-white">
                <b className="mr-1 font-mono text-[9px]">{request.method}</b>
                {request.name}
              </button>
            ) : (
              "Petición eliminada"
            )}{" "}
            · cada {formatEvery(schedule.everySeconds)}
            {actions.onSuccess.saveVariables.length ? ` · guarda ${actions.onSuccess.saveVariables.map((item) => `{{${item.variable}}}`).join(", ")}` : ""}
          </p>
        </div>
        <div className="hidden text-right text-[11px] sm:block">
          <p className={paused ? "text-amber-300" : "text-zinc-300"}>{running ? "Ejecutando…" : paused ? "En pausa" : countdown(automation.nextRunAt, now)}</p>
          <p className="text-muted-foreground">{automation.lastRunAt ? `última ${time(automation.lastRunAt)}` : "sin ejecutar"}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Ejecutar ahora" disabled={running || !request} onClick={() => api.runNow(automation.id)}>
            <Zap size={14} />
          </IconButton>
          <IconButton label={paused ? "Reanudar" : "Pausar"} onClick={() => void api.setEnabled(automation.id, paused)}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
          <IconButton label="Eliminar" danger onClick={() => void api.remove(automation.id)}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Historial" onClick={onToggleExpanded}>
            <ChevronDown size={14} className={expanded ? "rotate-180 transition" : "transition"} />
          </IconButton>
        </div>
      </div>

      {automation.consecutiveFailures > 0 && !paused ? (
        <p className="px-3.5 pb-3 text-[11px] text-rose-300">{automation.consecutiveFailures} fallo{automation.consecutiveFailures > 1 ? "s" : ""} seguido{automation.consecutiveFailures > 1 ? "s" : ""}.</p>
      ) : null}
      {paused && automation.consecutiveFailures > 0 ? (
        <p className="px-3.5 pb-3 text-[11px] text-amber-300">Se pausó tras {automation.consecutiveFailures} fallos seguidos. Revisa la petición y reanúdala.</p>
      ) : null}

      {expanded ? (
        <div className="px-2 pb-2">
          {runs.length === 0 ? (
            <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">Sin ejecuciones todavía.</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {runs.map((run) => (
                <li key={run.id} className="grid grid-cols-[14px_72px_58px_58px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-white/[0.04]">
                  <span className={`size-1.5 rounded-full ${run.status === "success" ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className="font-mono text-zinc-300">{time(run.startedAt)}</span>
                  <span className="font-mono text-muted-foreground">{run.httpStatus ?? "—"}</span>
                  <span className="font-mono text-muted-foreground">{run.durationMs !== null ? `${run.durationMs} ms` : "—"}</span>
                  <span className={`truncate ${run.status === "success" ? "text-emerald-300/90" : "text-rose-300"}`}>
                    {run.error ?? (run.savedVars ? `guardó ${(JSON.parse(run.savedVars) as string[]).join(", ")}` : "correcta")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-md text-muted-foreground transition disabled:opacity-40 ${danger ? "hover:bg-rose-400/10 hover:text-rose-300" : "hover:bg-white/[0.08] hover:text-white"}`}
    >
      {children}
    </button>
  );
}
