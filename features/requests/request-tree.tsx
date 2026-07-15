"use client";

import { ChevronDown, ChevronRight, FileJson2, Folder, FolderPlus, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RequestFolder, SavedRequest } from "./request-client";

type Props = {
  folders: RequestFolder[]; requests: SavedRequest[]; activeRequestId: string;
  onSelect: (request: SavedRequest) => void;
  onNewRequest: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: RequestFolder) => void;
  onDeleteFolder: (folder: RequestFolder) => void;
  onRequestMenu: (request: SavedRequest, action: "rename" | "duplicate" | "move" | "delete") => void;
};

export function RequestTree(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) root.current?.querySelectorAll("details[open]").forEach((item) => item.removeAttribute("open"));
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const toggle = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const activeFolderIds = new Set<string>();
  let activeFolderId = props.requests.find((item) => item.id === props.activeRequestId)?.folderId ?? null;
  while (activeFolderId) {
    activeFolderIds.add(activeFolderId);
    activeFolderId = props.folders.find((item) => item.id === activeFolderId)?.parentId ?? null;
  }
  const renderRequest = (request: SavedRequest) => (
    <div key={request.id} className={`group flex h-9 items-center rounded-lg border pr-1 ${props.activeRequestId === request.id ? "border-violet-400/15 bg-violet-500/10 text-violet-100" : "border-transparent text-muted-foreground hover:bg-white/[0.035] hover:text-white"}`}>
      <button onClick={() => props.onSelect(request)} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs">
        <span className="w-9 shrink-0 font-mono text-[9px] font-bold text-violet-300">{request.method}</span><span className="truncate">{request.name}</span>
      </button>
      <details className="relative"><summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md opacity-0 group-hover:opacity-100 [&::-webkit-details-marker]:hidden"><MoreVertical size={13}/></summary>
        <div className="absolute top-7 right-0 z-50 w-40 rounded-xl border border-white/10 bg-[#181022] p-1.5 shadow-2xl">
          {(["rename","duplicate","move","delete"] as const).map((action) => <button key={action} onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); props.onRequestMenu(request, action); }} className={`flex h-8 w-full items-center rounded-lg px-2 text-xs hover:bg-violet-400/10 ${action === "delete" ? "text-rose-300" : "text-muted-foreground"}`}>{({rename:"Editar nombre",duplicate:"Duplicar",move:"Mover a carpeta",delete:"Eliminar"})[action]}</button>)}
        </div>
      </details>
    </div>
  );
  const renderFolder = (folder: RequestFolder, depth = 0): React.ReactNode => {
    const children = props.folders.filter((item) => item.parentId === folder.id);
    const items = props.requests.filter((item) => item.folderId === folder.id);
    const closed = collapsed.has(folder.id) && !activeFolderIds.has(folder.id);
    return <div key={folder.id} style={{ paddingLeft: depth * 10 }}>
      <div className="group flex h-9 items-center rounded-lg text-muted-foreground hover:bg-white/[0.035] hover:text-white">
        <button onClick={() => toggle(folder.id)} className="grid size-7 place-items-center">{closed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button><Folder size={14} className="text-violet-300"/><span className="ml-2 min-w-0 flex-1 truncate text-xs">{folder.name}</span><span className="mr-1 text-[9px] opacity-50">{items.length}</span><button onClick={() => props.onNewRequest(folder.id)} title={`Nueva petición en ${folder.name}`} className="grid size-7 place-items-center rounded-md text-violet-300 opacity-0 hover:bg-violet-400/10 group-hover:opacity-100 focus:opacity-100"><Plus size={13}/></button>
        <details className="relative"><summary className="grid size-7 cursor-pointer list-none place-items-center opacity-0 group-hover:opacity-100 [&::-webkit-details-marker]:hidden"><MoreVertical size={13}/></summary><div className="absolute top-7 right-0 z-50 w-44 rounded-xl border border-white/10 bg-[#181022] p-1.5 shadow-2xl">
          <button onClick={() => props.onNewRequest(folder.id)} className="menu-item"><Plus size={12}/> Nueva petición</button><button onClick={() => props.onNewFolder(folder.id)} className="menu-item"><FolderPlus size={12}/> Subcarpeta</button><button onClick={() => props.onRenameFolder(folder)} className="menu-item"><Pencil size={12}/> Renombrar</button><button onClick={() => props.onDeleteFolder(folder)} className="menu-item text-rose-300"><Trash2 size={12}/> Eliminar</button>
        </div></details>
      </div>
      {!closed ? <div className="ml-3 border-l border-white/[0.06] pl-1">{children.map((item) => renderFolder(item, depth + 1))}{items.map(renderRequest)}</div> : null}
    </div>;
  };
  const loose = props.requests.filter((item) => !item.folderId);
  return <div ref={root} className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto">
    {props.folders.filter((item) => !item.parentId).map((item) => renderFolder(item))}
    {loose.length ? <div className="mt-2"><p className="px-2 py-1 text-[9px] tracking-widest text-muted-foreground/60 uppercase">Sin carpeta</p>{loose.map(renderRequest)}</div> : null}
    {!props.requests.length && !props.folders.length ? <div className="my-auto px-5 py-10 text-center"><FileJson2 size={22} className="mx-auto opacity-40"/><p className="mt-3 text-xs text-muted-foreground">Crea una carpeta o tu primera petición.</p></div> : null}
  </div>;
}
