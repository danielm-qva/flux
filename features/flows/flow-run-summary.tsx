"use client";

import { Check, ChevronDown, Copy, X } from "lucide-react";
import { useState } from "react";

import type { NodeRun } from "./flow-runner";

export type SummaryRow = { run: NodeRun; method: string; name: string };

function statusTone(run: NodeRun) {
  if (!run.response) return "text-rose-300 bg-rose-400/15";
  if (run.status === "error") return "text-rose-300 bg-rose-400/15";
  return "text-emerald-300 bg-emerald-400/15";
}

export function FlowRunSummary({
  rows,
  stoppedAt,
  partial,
  totalMs,
  variableCount,
  onClose,
  onSelect,
}: {
  rows: SummaryRow[];
  stoppedAt: string | null;
  partial: boolean;
  totalMs: number;
  variableCount: number;
  onClose: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const ok = rows.filter((row) => row.run.status === "success").length;
  const failed = stoppedAt !== null;

  async function copy() {
    const lines = [
      `| # | Petición | Status | Tiempo | Aserciones |`,
      `|---|----------|--------|--------|------------|`,
      ...rows.map((row, index) => {
        const total = row.run.assertions.length;
        const passed = row.run.assertions.filter((item) => item.passed).length;
        return `| ${index + 1} | ${row.method} ${row.name} | ${row.run.response?.status ?? "error"} | ${row.run.response?.durationMs ?? "—"} ms | ${total ? `${passed}/${total}` : "—"} |`;
      }),
      "",
      `${ok}/${rows.length} pasos correctos · ${(totalMs / 1000).toFixed(2)} s · ${variableCount} variables extraídas`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="flux-fade-in shrink-0 bg-[var(--flux-panel)] ring-1 ring-[var(--flux-line)]">
      <header className="flex h-10 items-center gap-3 px-3">
        <span className={`size-2 rounded-full ${failed ? "bg-rose-400" : "bg-emerald-400"}`} />
        <span className="text-xs font-medium text-white">
          {failed ? "El flujo se detuvo" : partial ? "Ejecución parcial" : "Flujo completado"}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {ok}/{rows.length} pasos · {(totalMs / 1000).toFixed(2)} s · {variableCount} variable{variableCount === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-zinc-300 hover:bg-white/[0.08]"
          >
            {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
            {copied ? "Copiado" : "Copiar resumen"}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expandir resumen" : "Contraer resumen"}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white"
          >
            <ChevronDown size={14} className={collapsed ? "-rotate-90 transition" : "transition"} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar resumen"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.08] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      {collapsed ? null : (
        <div className="max-h-44 overflow-y-auto px-2 pb-2">
          {rows.map((row, index) => {
            const total = row.run.assertions.length;
            const passed = row.run.assertions.filter((item) => item.passed).length;
            return (
              <button
                key={row.run.nodeId}
                type="button"
                onClick={() => onSelect(row.run.nodeId)}
                className="grid w-full grid-cols-[20px_minmax(0,1fr)_74px_64px_70px_minmax(0,1.2fr)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/[0.06]"
              >
                <span className="text-muted-foreground">{index + 1}</span>
                <span className="truncate"><b className="mr-1.5 font-mono text-[9px] text-muted-foreground">{row.method}</b>{row.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-center font-mono text-[10px] ${statusTone(row.run)}`}>
                  {row.run.response ? row.run.response.status : "error"}
                </span>
                <span className="font-mono text-muted-foreground">{row.run.response ? `${row.run.response.durationMs} ms` : "—"}</span>
                <span className={total && passed < total ? "text-rose-300" : "text-muted-foreground"}>
                  {total ? `${passed}/${total} ✓` : "—"}
                </span>
                <span className="truncate font-mono text-[10px] text-violet-200/80">
                  {row.run.error && !row.run.response ? row.run.error : row.run.extracted.map((item) => item.key).join(", ")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
