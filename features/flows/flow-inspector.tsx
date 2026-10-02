"use client";

import { Play, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { JsonTree } from "@/features/requests/json-tree";
import type { SavedRequest } from "@/features/requests/request-client";
import type {
  FlowAssertion,
  FlowAssertionKind,
  FlowExtraction,
  FlowNode,
} from "./flow-client";
import type { NodeRun } from "./flow-runner";
import {
  TARGET_LABELS,
  findUsages,
  previewInsert,
  removeUsage,
  urlSegments,
  type InsertOptions,
  type InsertTarget,
  type VariableUsage,
} from "./insert-variable";

type Tab = "response" | "variables" | "inputs" | "checks";
export type IncomingVariable = { name: string; from: string };

const CHECK_KINDS: { id: FlowAssertionKind; label: string; hasPath: boolean; placeholder: string | null }[] = [
  { id: "status", label: "El status es", hasPath: false, placeholder: "200" },
  { id: "exists", label: "Existe el campo", hasPath: true, placeholder: null },
  { id: "equals", label: "El campo es igual a", hasPath: true, placeholder: "valor" },
  { id: "time", label: "Responde en menos de (ms)", hasPath: false, placeholder: "500" },
];

const field =
  "min-w-0 rounded-md bg-[var(--flux-well)] px-2.5 text-xs outline-none ring-1 ring-[var(--flux-line)] focus:ring-[var(--flux-primary-border)]";

/** `$.data.id` → `dataId`, `$.id` → `id`; nombre de variable sugerido. */
function suggestVariable(path: string) {
  const parts = path.replace(/^\$\.?/, "").split(/[.[\]]+/).filter((part) => part && !/^\d+$/.test(part));
  const last = parts[parts.length - 1] ?? "valor";
  const base = last.toLowerCase() === "id" && parts.length > 1 ? `${parts[parts.length - 2]}Id` : last;
  return base.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

export function FlowInspector({
  node,
  request,
  requests,
  run,
  fallbackBody,
  running,
  incoming,
  onUseVariable,
  onRemoveUsage,
  onMoveUsage,
  onChangeRequest,
  onChangeExtractions,
  onChangeAssertions,
  onRunUntil,
  onDelete,
  onClose,
}: {
  node: FlowNode;
  request: SavedRequest | null;
  requests: SavedRequest[];
  run: NodeRun | undefined;
  fallbackBody?: string;
  running: boolean;
  incoming: IncomingVariable[];
  onUseVariable: (name: string, target: InsertTarget, options: InsertOptions) => void;
  onRemoveUsage: (name: string, usage: VariableUsage) => void;
  onMoveUsage: (name: string, usage: VariableUsage, target: InsertTarget, options: InsertOptions) => void;
  onChangeRequest: (requestId: string) => void;
  onChangeExtractions: (extractions: FlowExtraction[]) => void;
  onChangeAssertions: (assertions: FlowAssertion[]) => void;
  onRunUntil: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("response");
  const assertions = node.assertions ?? [];
  const body = run?.response?.body ?? fallbackBody;
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const patchVariable = (id: string, values: Partial<FlowExtraction>) =>
    onChangeExtractions(node.extractions.map((item) => (item.id === id ? { ...item, ...values } : item)));
  const patchCheck = (id: string, values: Partial<FlowAssertion>) =>
    onChangeAssertions(assertions.map((item) => (item.id === id ? { ...item, ...values } : item)));

  function pickValue(path: string) {
    if (node.extractions.some((item) => item.path === path)) return;
    onChangeExtractions([...node.extractions, { id: newId("ex"), path, variable: suggestVariable(path) }]);
    setTab("variables");
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "response", label: "Respuesta" },
    { id: "variables", label: "Guarda", count: node.extractions.length },
    { id: "inputs", label: "Recibe", count: incoming.length },
    { id: "checks", label: "Verifica", count: assertions.length },
  ];

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col bg-[var(--flux-panel)] ring-1 ring-[var(--flux-line)]">
      <header className="flex items-center gap-2 p-3 pb-2">
        <select
          value={node.requestId ?? ""}
          onChange={(event) => onChangeRequest(event.target.value)}
          aria-label="Petición del paso"
          className={`${field} h-9 flex-1 font-medium text-white`}
        >
          <option value="">Elige una petición…</option>
          {requests.map((item) => (
            <option key={item.id} value={item.id}>
              {item.method} · {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Eliminar paso"
          title="Eliminar este paso del flujo"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300"
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white"
        >
          <X size={15} />
        </button>
      </header>

      <div className="px-3">
        <button
          type="button"
          onClick={onRunUntil}
          disabled={running || !request}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-violet-600 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          title="Ejecuta este paso (y los anteriores que necesita)"
        >
          <Play size={12} /> Probar este paso
        </button>
        <ResultLine run={run} missing={Boolean(node.requestId && !request)} />
      </div>

      <nav className="mt-3 flex gap-1 px-3" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition ${tab === item.id ? "bg-white/[0.08] text-white" : "text-muted-foreground hover:text-white"}`}
          >
            {item.label}
            {item.count ? <span className="text-[10px] text-[var(--flux-primary-text)]">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "response" ? (
          body ? (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Pasa el mouse sobre un valor y pulsa <b className="text-zinc-200">+ Guardar</b> para usarlo en los siguientes pasos.
              </p>
              <div className="h-[22rem] overflow-hidden rounded-lg bg-[var(--flux-well)] ring-1 ring-[var(--flux-line)]">
                <JsonTree source={body} onSaveToEnv={pickValue} saveLabel="Guardar" compact />
              </div>
            </>
          ) : (
            <Empty>Pulsa <b className="text-zinc-200">Probar este paso</b> para ver la respuesta.</Empty>
          )
        ) : null}

        {tab === "variables" ? (
          <>
            {node.extractions.length === 0 ? (
              <Empty>
                Guarda un valor de la respuesta para pasarlo al siguiente paso. Lo usarás como{" "}
                <code className="text-[var(--flux-primary-text)]">{"{{nombre}}"}</code>.
              </Empty>
            ) : (
              <ul className="space-y-1.5">
                {node.extractions.map((extraction) => {
                  const value = extraction.path.trim()
                    ? run?.extracted.find((item) => item.key === extraction.variable && item.path === extraction.path.trim())?.value
                    : undefined;
                  return (
                    <li key={extraction.id} className="group rounded-lg bg-[var(--flux-panel-2)] p-2 ring-1 ring-[var(--flux-line)]">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={extraction.variable}
                          onChange={(event) => patchVariable(extraction.id, { variable: event.target.value })}
                          placeholder="nombre"
                          spellCheck={false}
                          aria-label="Nombre de la variable"
                          className={`${field} h-8 flex-1 font-mono text-[var(--flux-primary-text)]`}
                        />
                        <IconDelete label="Quitar variable" onClick={() => onChangeExtractions(node.extractions.filter((item) => item.id !== extraction.id))} />
                      </div>
                      <input
                        value={extraction.path}
                        onChange={(event) => patchVariable(extraction.id, { path: event.target.value })}
                        placeholder="$.campo.de.la.respuesta"
                        spellCheck={false}
                        aria-label="Ruta en la respuesta"
                        className="mt-1 h-6 w-full bg-transparent px-2.5 font-mono text-[10px] text-muted-foreground outline-none focus:text-zinc-200"
                      />
                      {value !== undefined ? (
                        <p className="truncate px-2.5 pb-0.5 font-mono text-[10px] text-emerald-300/90">= {value}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <AddButton onClick={() => onChangeExtractions([...node.extractions, { id: newId("ex"), path: "", variable: "" }])}>
              Añadir variable
            </AddButton>
          </>
        ) : null}

        {tab === "inputs" ? (
          incoming.length === 0 ? (
            <Empty>
              Aquí aparecen los datos que llegan de los pasos anteriores. Conecta este paso a otro y guarda un valor
              en él (pestaña <b className="text-zinc-200">Guarda</b>).
            </Empty>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Elige dónde recibe cada dato esta petición. Flux escribe el <code className="text-[var(--flux-primary-text)]">{"{{nombre}}"}</code> por ti.
              </p>
              <ul className="space-y-1.5">
                {incoming.map((item) => (
                  <InputRow
                    key={item.name}
                    item={item}
                    request={request}
                    onUse={(target, options) => onUseVariable(item.name, target, options)}
                    onRemove={(usage) => onRemoveUsage(item.name, usage)}
                    onMove={(usage, target, options) => onMoveUsage(item.name, usage, target, options)}
                  />
                ))}
              </ul>
            </>
          )
        ) : null}

        {tab === "checks" ? (
          <>
            {assertions.length === 0 ? (
              <Empty>Comprueba que la respuesta sea correcta. Si algo falla, el flujo se detiene en este paso.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {assertions.map((assertion) => {
                  const kind = CHECK_KINDS.find((item) => item.id === assertion.kind) ?? CHECK_KINDS[0];
                  const result = run?.assertions.find((item) => item.id === assertion.id);
                  return (
                    <li key={assertion.id} className="rounded-lg bg-[var(--flux-panel-2)] p-2 ring-1 ring-[var(--flux-line)]">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={assertion.kind}
                          onChange={(event) => patchCheck(assertion.id, { kind: event.target.value as FlowAssertionKind })}
                          className={`${field} h-8 flex-1 text-zinc-200`}
                        >
                          {CHECK_KINDS.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                        <IconDelete label="Quitar verificación" onClick={() => onChangeAssertions(assertions.filter((item) => item.id !== assertion.id))} />
                      </div>
                      {kind.hasPath ? (
                        <input
                          value={assertion.path}
                          onChange={(event) => patchCheck(assertion.id, { path: event.target.value })}
                          placeholder="$.campo"
                          spellCheck={false}
                          className={`${field} mt-1.5 h-8 w-full font-mono text-sky-200`}
                        />
                      ) : null}
                      {kind.placeholder ? (
                        <input
                          value={assertion.value}
                          onChange={(event) => patchCheck(assertion.id, { value: event.target.value })}
                          placeholder={kind.placeholder}
                          spellCheck={false}
                          className={`${field} mt-1.5 h-8 w-full font-mono text-zinc-100`}
                        />
                      ) : null}
                      {result ? (
                        <p className={`mt-1.5 px-0.5 text-[11px] ${result.passed ? "text-emerald-300" : "text-rose-300"}`}>
                          {result.passed ? "✓ Correcto" : "✗ Falló"} · {result.detail}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <AddButton onClick={() => onChangeAssertions([...assertions, { id: newId("as"), kind: "status", path: "", value: "200" }])}>
              Añadir verificación
            </AddButton>
          </>
        ) : null}
      </div>
    </aside>
  );
}

function InputRow({
  item,
  request,
  onUse,
  onRemove,
  onMove,
}: {
  item: IncomingVariable;
  request: SavedRequest | null;
  onUse: (target: InsertTarget, options: InsertOptions) => void;
  onRemove: (usage: VariableUsage) => void;
  onMove: (usage: VariableUsage, target: InsertTarget, options: InsertOptions) => void;
}) {
  // `adding` abre el formulario para añadir; `moving` lo abre para recolocar un uso existente.
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<VariableUsage | null>(null);
  const [target, setTarget] = useState<InsertTarget>("body");
  const [options, setOptions] = useState<InsertOptions>({});
  const usages = request ? findUsages(request, item.name) : [];
  const formOpen = adding || moving !== null;

  // Al mover, la vista previa y los segmentos se calculan sin el uso que se va a quitar.
  const base = request && moving ? { ...request, ...removeUsage(request, item.name, moving.id) } : request;
  const segments = base ? urlSegments(base.url) : [];
  const preview = base && formOpen && target !== "bearer" ? previewInsert(base, item.name, target, options) : "";
  const needsHeaderName = target === "header" && !options.name?.trim();

  function defaults(next: InsertTarget): InsertOptions {
    if (next === "url") return { urlMode: "append" };
    if (next === "body") return { name: item.name, valueType: "text" };
    if (next === "header") return { name: "", prefix: "" };
    if (next === "query") return { name: item.name };
    return {};
  }

  function choose(next: InsertTarget) {
    setTarget(next);
    setOptions(defaults(next));
  }

  function openAdd() {
    setMoving(null);
    setAdding(true);
    choose("body");
  }

  function openMove(usage: VariableUsage) {
    setAdding(false);
    setMoving(usage);
    choose("body");
  }

  function close() {
    setAdding(false);
    setMoving(null);
  }

  function apply() {
    if (moving) onMove(moving, target, options);
    else onUse(target, options);
    close();
  }

  const set = (values: Partial<InsertOptions>) => setOptions((current) => ({ ...current, ...values }));

  return (
    <li className="rounded-lg bg-[var(--flux-panel-2)] p-2 ring-1 ring-[var(--flux-line)]">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-[var(--flux-primary-text)]">{`{{${item.name}}}`}</p>
          <p className="truncate text-[10px] text-muted-foreground">viene de {item.from}</p>
        </div>
        <button
          type="button"
          disabled={!request}
          onClick={() => (formOpen ? close() : openAdd())}
          className="h-7 shrink-0 rounded-md bg-white/[0.06] px-2.5 text-[11px] text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.12] disabled:opacity-50"
        >
          {formOpen ? "Cancelar" : usages.length ? "Añadir otro uso" : "Usar en…"}
        </button>
      </div>

      {usages.length ? (
        <ul className="mt-2 space-y-1">
          {usages.map((usage) => (
            <li
              key={usage.id}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${moving?.id === usage.id ? "bg-[var(--flux-primary-soft)] ring-1 ring-[var(--flux-primary-border)]" : "bg-[var(--flux-well)]"}`}
            >
              <span className="text-emerald-300">✓</span>
              <span className="min-w-0 flex-1 truncate text-zinc-300">
                <span className="text-zinc-400">{usage.place}</span> · <span className="font-mono">{usage.detail}</span>
              </span>
              <button type="button" onClick={() => openMove(usage)} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10 hover:text-white">
                Mover
              </button>
              <button type="button" onClick={() => onRemove(usage)} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-rose-300/90 hover:bg-rose-400/10 hover:text-rose-200">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {formOpen ? (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] font-medium text-zinc-300">
            {moving ? `Mover desde «${moving.place} · ${moving.detail}» a…` : "Añadir en…"}
          </p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TARGET_LABELS) as InsertTarget[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                className={`h-7 rounded-md px-2 text-[11px] transition ${target === option ? "bg-[var(--flux-primary-soft)] text-white ring-1 ring-[var(--flux-primary-border)]" : "bg-[var(--flux-well)] text-zinc-300 ring-1 ring-[var(--flux-line)] hover:text-white"}`}
              >
                {TARGET_LABELS[option]}
              </button>
            ))}
          </div>

          {target === "body" ? (
            <>
              <Labeled label="Nombre del campo (usa . para anidar: usuario.id)">
                <input value={options.name ?? ""} onChange={(event) => set({ name: event.target.value })} placeholder={item.name} spellCheck={false} className={`${field} h-8 w-full font-mono`} />
              </Labeled>
              <Labeled label="Valor">
                <select value={options.valueType ?? "text"} onChange={(event) => set({ valueType: event.target.value as "text" | "raw" })} className={`${field} h-8 w-full`}>
                  <option value="text">Texto (entre comillas)</option>
                  <option value="raw">Número, true/false o tal cual</option>
                </select>
              </Labeled>
            </>
          ) : null}

          {target === "url" ? (
            <Labeled label="Posición">
              <select
                value={options.urlMode === "replace" ? String(options.segmentIndex ?? 0) : "append"}
                onChange={(event) => (event.target.value === "append" ? set({ urlMode: "append", segmentIndex: undefined }) : set({ urlMode: "replace", segmentIndex: Number(event.target.value) }))}
                className={`${field} h-8 w-full`}
              >
                <option value="append">Añadir al final de la ruta</option>
                {segments.map((segment) => (
                  <option key={`${segment.index}-${segment.text}`} value={segment.index}>
                    Reemplazar «{segment.text}»
                  </option>
                ))}
              </select>
            </Labeled>
          ) : null}

          {target === "query" ? (
            <Labeled label="Nombre del parámetro">
              <input value={options.name ?? ""} onChange={(event) => set({ name: event.target.value })} placeholder={item.name} spellCheck={false} className={`${field} h-8 w-full font-mono`} />
            </Labeled>
          ) : null}

          {target === "header" ? (
            <div className="grid grid-cols-[1fr_92px] gap-1.5">
              <Labeled label="Nombre del header">
                <input value={options.name ?? ""} onChange={(event) => set({ name: event.target.value })} placeholder="X-Product-Id" spellCheck={false} className={`${field} h-8 w-full font-mono`} />
              </Labeled>
              <Labeled label="Prefijo">
                <input value={options.prefix ?? ""} onChange={(event) => set({ prefix: event.target.value })} placeholder="Bearer" spellCheck={false} className={`${field} h-8 w-full font-mono`} />
              </Labeled>
            </div>
          ) : null}

          {preview ? (
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">Así quedará</p>
              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--flux-well)] p-2 font-mono text-[10px] leading-4 text-zinc-300 ring-1 ring-[var(--flux-line)]">{preview}</pre>
            </div>
          ) : null}

          <button
            type="button"
            disabled={needsHeaderName}
            onClick={apply}
            className="flex h-8 w-full items-center justify-center rounded-md bg-violet-600 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {moving ? "Mover aquí" : "Añadir a la petición"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ResultLine({ run, missing }: { run: NodeRun | undefined; missing: boolean }) {
  if (missing) return <p className="mt-2 text-[11px] text-rose-300">La petición de este paso ya no existe. Elige otra.</p>;
  if (!run) return null;
  const failed = run.status === "error";
  return (
    <p className={`mt-2 truncate text-[11px] ${failed ? "text-rose-300" : "text-emerald-300"}`}>
      {failed ? "✗" : "✓"}{" "}
      {run.response ? `${run.response.status} ${run.response.statusText} · ${run.response.durationMs} ms` : "Sin respuesta"}
      {failed && run.error ? ` — ${run.error}` : ""}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg px-3 py-6 text-center text-[11px] leading-5 text-muted-foreground ring-1 ring-[var(--flux-line)]">{children}</p>;
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs text-zinc-300 ring-1 ring-dashed ring-white/15 transition hover:bg-white/[0.06] hover:text-white"
    >
      <Plus size={13} /> {children}
    </button>
  );
}

function IconDelete({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300"
    >
      <Trash2 size={13} />
    </button>
  );
}
