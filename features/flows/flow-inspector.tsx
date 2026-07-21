"use client";

import { CirclePlus, Trash2, X } from "lucide-react";

import type { SavedRequest } from "@/features/requests/request-client";
import type { FlowExtraction, FlowNode } from "./flow-client";
import type { NodeRun } from "./flow-runner";

export function FlowInspector({
  node,
  request,
  requests,
  run,
  onChangeRequest,
  onChangeExtractions,
  onClose,
}: {
  node: FlowNode;
  request: SavedRequest | null;
  requests: SavedRequest[];
  run: NodeRun | undefined;
  onChangeRequest: (requestId: string) => void;
  onChangeExtractions: (extractions: FlowExtraction[]) => void;
  onClose: () => void;
}) {
  function patch(id: string, values: Partial<FlowExtraction>) {
    onChangeExtractions(
      node.extractions.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  }
  function add() {
    onChangeExtractions([
      ...node.extractions,
      { id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, path: "", variable: "" },
    ]);
  }
  function remove(id: string) {
    onChangeExtractions(node.extractions.filter((item) => item.id !== id));
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-white/[0.07] bg-[#0f0a1b]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Nodo
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white"
        >
          <X size={14} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <label className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Petición
          <select
            value={node.requestId ?? ""}
            onChange={(event) => onChangeRequest(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-[#1b112c] px-3 text-xs text-white outline-none focus:border-violet-400/50"
          >
            <option value="">Selecciona una petición…</option>
            {requests.map((item) => (
              <option key={item.id} value={item.id}>
                {item.method} · {item.name}
              </option>
            ))}
          </select>
        </label>
        {node.requestId && !request ? (
          <p className="mt-2 text-[10px] text-rose-300">
            La petición referenciada ya no existe. Elige otra.
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Extraer del response
          </span>
          <button
            type="button"
            onClick={add}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-violet-300 hover:bg-violet-400/10"
          >
            <CirclePlus size={13} /> Añadir
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground/80">
          Guarda un valor del response en una variable. Úsala en peticiones
          siguientes con <code className="text-violet-300">{"{{VARIABLE}}"}</code>.
        </p>

        {node.extractions.length === 0 ? (
          <p className="mt-3 rounded-lg border border-white/[0.06] px-3 py-4 text-center text-[11px] text-muted-foreground">
            Sin extracciones todavía.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {node.extractions.map((extraction) => (
              <div
                key={extraction.id}
                className="rounded-lg border border-white/[0.07] bg-[#140e22] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    value={extraction.path}
                    onChange={(event) => patch(extraction.id, { path: event.target.value })}
                    placeholder="$.data.id"
                    spellCheck={false}
                    className="h-8 min-w-0 flex-1 rounded-md border border-white/[0.07] bg-transparent px-2 font-mono text-[11px] text-sky-200 outline-none focus:border-violet-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => remove(extraction.id)}
                    aria-label="Eliminar extracción"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">→</span>
                  <input
                    value={extraction.variable}
                    onChange={(event) =>
                      patch(extraction.id, { variable: event.target.value })
                    }
                    placeholder="productId"
                    spellCheck={false}
                    className="h-8 min-w-0 flex-1 rounded-md border border-white/[0.07] bg-transparent px-2 font-mono text-[11px] text-violet-100 outline-none focus:border-violet-400/40"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {run ? <RunPanel run={run} /> : null}
      </div>
    </aside>
  );
}

function RunPanel({ run }: { run: NodeRun }) {
  return (
    <div className="mt-6 border-t border-white/[0.07] pt-4">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Última ejecución
      </span>
      {run.status === "error" ? (
        <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-200">
          {run.error}
        </p>
      ) : (
        <>
          {run.response ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-mono text-emerald-300">
                {run.response.status} {run.response.statusText}
              </span>{" "}
              · {run.response.durationMs} ms
            </p>
          ) : null}
          {run.extracted.length ? (
            <div className="mt-2 space-y-1">
              {run.extracted.map((variable) => (
                <div
                  key={variable.key}
                  className="flex items-center gap-2 rounded-md bg-violet-500/[0.08] px-2 py-1 font-mono text-[10px]"
                >
                  <span className="text-violet-200">{variable.key}</span>
                  <span className="min-w-0 flex-1 truncate text-white/70">
                    {variable.value}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {run.warnings.map((warning, index) => (
            <p key={index} className="mt-1 text-[10px] text-amber-300/80">
              {warning}
            </p>
          ))}
          {run.response ? (
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/[0.06] bg-black/25 p-2 font-mono text-[10px] leading-4 text-slate-300">
              {run.response.body || "Respuesta vacía"}
            </pre>
          ) : null}
        </>
      )}
    </div>
  );
}
