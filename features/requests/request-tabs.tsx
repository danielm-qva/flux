"use client";

import { Plus, X } from "lucide-react";
import type { SavedRequest } from "./request-client";

const methodColors: Record<string, string> = {
  GET: "text-emerald-300", POST: "text-amber-300", PUT: "text-sky-300",
  PATCH: "text-violet-300", DELETE: "text-rose-300", HEAD: "text-emerald-200",
  OPTIONS: "text-pink-300",
};

export function RequestTabs({ tabs, activeId, dirtyIds, onSelect, onClose, onNew }: {
  tabs: SavedRequest[];
  activeId: string;
  dirtyIds: Set<string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="mb-2 flex h-10 w-full shrink-0 items-end gap-1 overflow-x-auto border-b border-white/[0.07]" role="tablist" aria-label="Peticiones abiertas">
      {tabs.map((request) => {
        const active = request.id === activeId;
        return (
          <div key={request.id} className={`group flex h-9 max-w-56 shrink-0 items-center rounded-t-lg border-x border-t px-1 ${active ? "border-violet-400/20 bg-[#171024] text-white" : "border-transparent bg-white/[0.025] text-muted-foreground hover:bg-white/[0.05]"}`}>
            <button type="button" role="tab" aria-selected={active} onClick={() => onSelect(request.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-[11px]">
              <span className={`font-mono text-[9px] font-bold ${methodColors[request.method] ?? "text-violet-300"}`}>{request.method}</span>
              <span className="truncate">{request.name}</span>
              {dirtyIds.has(request.id) ? <span className="text-violet-300" title="Cambios pendientes">●</span> : null}
            </button>
            <button type="button" onClick={() => onClose(request.id)} aria-label={`Cerrar ${request.name}`} className="grid size-6 shrink-0 place-items-center rounded-md opacity-55 hover:bg-white/10 hover:opacity-100"><X size={12} /></button>
          </div>
        );
      })}
      <button type="button" onClick={onNew} aria-label="Nueva petición" title="Nueva petición" className="mb-1 grid size-8 shrink-0 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"><Plus size={14} /></button>
    </div>
  );
}
