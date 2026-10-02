"use client";

import { Clock, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { SavedRequest } from "@/features/requests/request-client";
import type { Environment } from "@/features/workspaces/workspace-client";
import {
  DEFAULT_ACTIONS,
  DEFAULT_SCHEDULE,
  parseActions,
  parseSchedule,
  type Automation,
  type SaveVariableAction,
} from "./automation-client";
import { candidatePaths, formatEvery } from "./automation-runner";
import type { AutomationsApi } from "./use-automations";

type Unit = "s" | "min" | "h";
const UNIT_SECONDS: Record<Unit, number> = { s: 1, min: 60, h: 3600 };

const field =
  "min-w-0 rounded-md bg-[var(--flux-well)] px-2.5 text-xs text-white outline-none ring-1 ring-[var(--flux-line)] focus:ring-[var(--flux-primary-border)]";

function splitEvery(seconds: number): { value: number; unit: Unit } {
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "h" };
  if (seconds % 60 === 0) return { value: seconds / 60, unit: "min" };
  return { value: seconds, unit: "s" };
}

const newId = () => `sv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const variableFor = (path: string) =>
  (path.split(".").pop() ?? "TOKEN").replace(/\[\d+\]/g, "").replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();

export function AutomationPanel({
  request,
  automation,
  environments,
  activeEnvironmentId,
  lastResponseBody,
  api,
  onClose,
}: {
  request: SavedRequest;
  automation: Automation | null;
  environments: Environment[];
  activeEnvironmentId: string;
  lastResponseBody?: string;
  api: AutomationsApi;
  onClose: () => void;
}) {
  const initialSchedule = automation ? parseSchedule(automation) : DEFAULT_SCHEDULE;
  const initialActions = automation ? parseActions(automation) : DEFAULT_ACTIONS;
  const initialEvery = splitEvery(initialSchedule.everySeconds);

  const [name, setName] = useState(automation?.name ?? request.name);
  const [every, setEvery] = useState(initialEvery.value);
  const [unit, setUnit] = useState<Unit>(initialEvery.unit);
  const [runOnStart, setRunOnStart] = useState(initialSchedule.runOnStart);
  const [environmentId, setEnvironmentId] = useState(automation?.environmentId ?? activeEnvironmentId ?? "");
  const [saves, setSaves] = useState<SaveVariableAction[]>(initialActions.onSuccess.saveVariables);
  const [retries, setRetries] = useState(initialActions.onFailure.retries);
  const [retryDelay, setRetryDelay] = useState(initialActions.onFailure.retryDelaySeconds);
  const [pauseAfter, setPauseAfter] = useState(initialActions.onFailure.pauseAfterFailures);
  const [notify, setNotify] = useState(initialActions.onFailure.notify);
  const [busy, setBusy] = useState(false);

  const everySeconds = Math.round(every * UNIT_SECONDS[unit]);
  const suggestions = candidatePaths(lastResponseBody).filter((path) => !saves.some((item) => item.path === path));
  const tooFast = everySeconds < 15;
  const needsEnvironment = saves.some((item) => item.path.trim() && item.variable.trim()) && !environmentId;
  const invalid = tooFast || !name.trim() || needsEnvironment;

  const patchSave = (id: string, values: Partial<SaveVariableAction>) =>
    setSaves((rows) => rows.map((row) => (row.id === id ? { ...row, ...values } : row)));

  async function save() {
    setBusy(true);
    const input = {
      name: name.trim(),
      environmentId: environmentId || null,
      schedule: { everySeconds, runOnStart },
      actions: {
        onSuccess: { saveVariables: saves.filter((item) => item.path.trim() && item.variable.trim()) },
        onFailure: { retries, retryDelaySeconds: retryDelay, pauseAfterFailures: pauseAfter, notify },
      },
    };
    const result = automation ? await api.update(automation.id, input) : await api.create(request.id, input);
    setBusy(false);
    if (result) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/60 px-4 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flux-fade-in flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-[var(--flux-dialog)] shadow-2xl ring-1 ring-[var(--flux-line)]">
        <header className="flex items-center gap-3 px-5 pt-4 pb-2">
          <span className="grid size-8 place-items-center rounded-lg bg-[var(--flux-primary-soft)] text-[var(--flux-primary-text)]">
            <Clock size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Automatizar «{request.name}»</h2>
            <p className="text-[11px] text-muted-foreground">Se ejecuta sola mientras Flux esté abierto.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white">
            <X size={15} />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto px-5 py-3">
          <Section title="Cuándo">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-300">Cada</span>
              <input
                type="number"
                min={1}
                value={every}
                onChange={(event) => setEvery(Math.max(1, Number(event.target.value) || 1))}
                className={`${field} h-9 w-20 font-mono`}
              />
              <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)} className={`${field} h-9`}>
                <option value="s">segundos</option>
                <option value="min">minutos</option>
                <option value="h">horas</option>
              </select>
            </div>
            {tooFast ? <p className="text-[11px] text-rose-300">El mínimo es 15 segundos.</p> : null}
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={runOnStart} onChange={(event) => setRunOnStart(event.target.checked)} className="accent-violet-500" />
              Ejecutar también al abrir Flux
            </label>
          </Section>

          <Section title="Al responder bien, guardar en el environment">
            <select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} className={`${field} h-9 w-full`}>
              <option value="">Elige un environment…</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
            {saves.map((row) => (
              <div key={row.id} className="flex items-center gap-1.5">
                <input value={row.path} onChange={(event) => patchSave(row.id, { path: event.target.value })} placeholder="$.access_token" spellCheck={false} className={`${field} h-9 flex-1 font-mono text-sky-200`} />
                <span className="text-xs text-muted-foreground">→</span>
                <input value={row.variable} onChange={(event) => patchSave(row.id, { variable: event.target.value })} placeholder="TOKEN" spellCheck={false} className={`${field} h-9 w-32 font-mono text-[var(--flux-primary-text)]`} />
                <button type="button" onClick={() => setSaves((rows) => rows.filter((item) => item.id !== row.id))} aria-label="Quitar" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {suggestions.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Sugeridos de la última respuesta:</span>
                {suggestions.slice(0, 5).map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setSaves((rows) => [...rows, { id: newId(), path, variable: variableFor(path) }])}
                    className="rounded-md bg-[var(--flux-well)] px-2 py-1 font-mono text-[10px] text-zinc-300 ring-1 ring-[var(--flux-line)] hover:text-white"
                  >
                    + {path}
                  </button>
                ))}
              </div>
            ) : null}
            <button type="button" onClick={() => setSaves((rows) => [...rows, { id: newId(), path: "", variable: "" }])} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-300 ring-1 ring-dashed ring-white/15 hover:bg-white/[0.06] hover:text-white">
              <Plus size={13} /> Guardar otro valor
            </button>
            {needsEnvironment ? <p className="text-[11px] text-rose-300">Elige un environment para guardar las variables.</p> : null}
            <p className="text-[10px] leading-4 text-muted-foreground">
              Usa la variable en otras peticiones como <code className="text-[var(--flux-primary-text)]">{"{{TOKEN}}"}</code>. Los valores guardados no aparecen en el historial de automatizaciones.
            </p>
          </Section>

          <Section title="Si falla">
            <div className="grid grid-cols-3 gap-2">
              <NumberField label="Reintentos" value={retries} min={0} max={5} onChange={setRetries} />
              <NumberField label="Espera (s)" value={retryDelay} min={1} max={300} onChange={setRetryDelay} />
              <NumberField label="Pausar tras" value={pauseAfter} min={0} max={50} onChange={setPauseAfter} hint="0 = nunca" />
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="accent-violet-500" />
              Avisarme cuando falle
            </label>
          </Section>

          <Section title="Nombre">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className={`${field} h-9 w-full`} />
          </Section>
        </div>

        <footer className="flex items-center gap-2 px-5 py-3">
          {automation ? (
            <button
              type="button"
              onClick={() => {
                void api.remove(automation.id);
                onClose();
              }}
              className="h-9 rounded-md px-3 text-xs text-rose-300 hover:bg-rose-400/10"
            >
              Eliminar
            </button>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-foreground">Cada {formatEvery(everySeconds)}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-xs text-muted-foreground hover:bg-white/[0.08] hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            disabled={invalid || busy}
            onClick={() => void save()}
            className="h-9 rounded-md bg-violet-600 px-4 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {automation ? "Guardar cambios" : "Activar automatización"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function NumberField({ label, value, min, max, hint, onChange }: { label: string; value: number; min: number; max: number; hint?: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted-foreground">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Math.round(Number(event.target.value) || 0))))}
        className={`${field} h-9 w-full font-mono`}
      />
      {hint ? <span className="mt-0.5 block text-[9px] text-muted-foreground/70">{hint}</span> : null}
    </label>
  );
}
