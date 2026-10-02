"use client";

import { Clock, Plus, X } from "lucide-react";
import type { SavedRequest } from "./request-client";

const methodColors: Record<string, string> = {
  GET: "text-emerald-300", POST: "text-amber-300", PUT: "text-sky-300",
  PATCH: "text-violet-300", DELETE: "text-rose-300", HEAD: "text-emerald-200",
  OPTIONS: "text-pink-300",
};

export function RequestTabs({ tabs, activeId, dirtyIds, statusById, automatedIds, onSelect, onClose, onNew }: {
  tabs: SavedRequest[];
  activeId: string;
  dirtyIds: Set<string>;
  statusById?: Map<string, "ok" | "error">;
  automatedIds?: Set<string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="mb-2 flex h-8 w-full shrink-0 items-center gap-0.5" role="tablist" aria-label="Peticiones abiertas">
      {tabs.map((request) => {
        const active = request.id === activeId;
        const dirty = dirtyIds.has(request.id);
        return (
          <div key={request.id} className={`group flex h-7 min-w-14 max-w-44 shrink items-center rounded-md pr-1 pl-2 text-xs transition-colors ${active ? "bg-white/[0.07] text-white" : "text-muted-foreground hover:bg-white/[0.04] hover:text-white"}`}>
            <button type="button" role="tab" aria-selected={active} onClick={() => onSelect(request.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              {statusById?.get(request.id) ? <span className={`size-1.5 shrink-0 rounded-full ${statusById.get(request.id) === "ok" ? "bg-emerald-400" : "bg-rose-400"}`} title={statusById.get(request.id) === "ok" ? "Última ejecución correcta" : "Última ejecución con error"} /> : null}
              <span className={`font-mono text-[9px] font-semibold ${active ? "" : "opacity-60"} ${methodColors[request.method] ?? "text-violet-300"}`}>{request.method}</span>
              <span className="truncate">{request.name}</span>{automatedIds?.has(request.id) ? <Clock size={10} className="shrink-0 text-[var(--flux-primary-text)]" aria-label="Automatizada" /> : null}
            </button>
            <button type="button" onClick={() => onClose(request.id)} aria-label={`Cerrar ${request.name}`} title={dirty ? "Cambios sin guardar" : undefined} className="relative ml-1 grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-white/10 hover:text-white">
              {dirty ? <span className="size-1.5 rounded-full bg-amber-300 group-hover:hidden" /> : null}
              <X size={10} className={dirty ? "hidden group-hover:block" : active ? "" : "opacity-0 group-hover:opacity-100"} />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={onNew} aria-label="Nueva petición" title="Nueva petición" className="ml-0.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-white"><Plus size={13} /></button>
    </div>
  );
}
