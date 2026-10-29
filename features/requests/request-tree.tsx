"use client";

import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileJson2,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import type { RequestFolder, SavedRequest } from "./request-client";

type Props = {
  folders: RequestFolder[];
  requests: SavedRequest[];
  activeRequestId: string;
  onSelect: (request: SavedRequest) => void;
  onNewRequest: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: RequestFolder) => void;
  onDeleteFolder: (folder: RequestFolder) => void;
  onFolderToFlow?: (folder: RequestFolder) => void;
  statusById?: Map<string, "ok" | "error">;
  onRequestMenu: (
    request: SavedRequest,
    action: "rename" | "duplicate" | "move" | "delete",
  ) => void;
};

export function RequestTree(props: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const requestActions = [
    { action: "rename" as const, label: "Editar nombre", icon: Pencil },
    { action: "duplicate" as const, label: "Duplicar", icon: Copy },
    { action: "move" as const, label: "Mover a carpeta", icon: FolderInput },
    { action: "delete" as const, label: "Eliminar", icon: Trash2 },
  ];
  const renderRequest = (request: SavedRequest) => (
    <div
      key={request.id}
      className={`fx-request-row ${props.activeRequestId === request.id ? "is-on" : ""} group flex h-7 items-center rounded-md pr-0.5 ${props.activeRequestId === request.id ? "bg-white/[0.07] text-white" : "text-muted-foreground hover:bg-white/[0.04] hover:text-white"}`}
    >
      <button
        onClick={() => props.onSelect(request)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs"
      >
        {props.statusById?.get(request.id) ? (
          <span
            className={`size-1.5 shrink-0 rounded-full ${props.statusById.get(request.id) === "ok" ? "bg-emerald-400" : "bg-rose-400"}`}
          />
        ) : (
          <span className="size-1.5 shrink-0" />
        )}
        <span
          className={`fx-method fx-method-${request.method.toLowerCase()} w-12 shrink-0`}
        >
          {request.method}
        </span>
        <span className="truncate">{request.name}</span>
      </button>
      <ActionMenu
        label={`Acciones de ${request.name}`}
        actions={requestActions.map(({ action, label, icon }) => ({
          label,
          icon,
          destructive: action === "delete",
          onClick: () => props.onRequestMenu(request, action),
        }))}
      />
    </div>
  );
  const renderFolder = (folder: RequestFolder, depth = 0): React.ReactNode => {
    const children = props.folders.filter(
      (item) => item.parentId === folder.id,
    );
    const items = props.requests.filter((item) => item.folderId === folder.id);
    const closed = collapsed.has(folder.id);
    return (
      <div key={folder.id} style={{ paddingLeft: depth * 10 }}>
        <div className="fx-folder-heading group flex h-7 items-center rounded-md text-muted-foreground hover:bg-white/[0.04] hover:text-white">
          <button
            onClick={() => toggle(folder.id)}
            className="grid size-6 place-items-center"
          >
            {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          <Folder size={13} className="opacity-70" />
          <span className="ml-2 min-w-0 flex-1 truncate text-xs">
            {folder.name}
          </span>
          <span className="mr-1 text-[9px] opacity-50">{items.length}</span>
          <button
            onClick={() => props.onNewRequest(folder.id)}
            title={`Nueva petición en ${folder.name}`}
            className="grid size-6 place-items-center rounded-md opacity-0 hover:bg-white/10 group-hover:opacity-100 focus:opacity-100"
          >
            <Plus size={13} />
          </button>
          <ActionMenu
            label={`Acciones de la carpeta ${folder.name}`}
            actions={[
              {
                label: "Nueva petición",
                icon: Plus,
                onClick: () => props.onNewRequest(folder.id),
              },
              {
                label: "Subcarpeta",
                icon: FolderPlus,
                onClick: () => props.onNewFolder(folder.id),
              },
              ...(props.onFolderToFlow
                ? [
                    {
                      label: "Convertir en Flow",
                      icon: Workflow,
                      onClick: () => props.onFolderToFlow?.(folder),
                    },
                  ]
                : []),
              {
                label: "Renombrar",
                icon: Pencil,
                onClick: () => props.onRenameFolder(folder),
              },
              {
                label: "Eliminar",
                icon: Trash2,
                destructive: true,
                onClick: () => props.onDeleteFolder(folder),
              },
            ]}
          />
        </div>
        {!closed ? (
          <div className="ml-3 pl-1">
            {children.map((item) => renderFolder(item, depth + 1))}
            {items.map(renderRequest)}
          </div>
        ) : null}
      </div>
    );
  };
  const loose = props.requests.filter((item) => !item.folderId);
  return (
    <div className="fx-request-tree mt-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto">
      {props.folders
        .filter((item) => !item.parentId)
        .map((item) => renderFolder(item))}
      {loose.length ? (
        <div className="mt-2">
          <p className="px-2 py-1 text-[9px] tracking-widest text-muted-foreground/60 uppercase">
            Sin carpeta
          </p>
          {loose.map(renderRequest)}
        </div>
      ) : null}
      {!props.requests.length && !props.folders.length ? (
        <div className="my-auto px-5 py-10 text-center">
          <FileJson2 size={22} className="mx-auto opacity-40" />
          <p className="mt-3 text-xs text-muted-foreground">
            Crea una carpeta o tu primera petición.
          </p>
        </div>
      ) : null}
    </div>
  );
}
