"use client";

import { Command } from "cmdk";
import {
  Clock,
  Clock3,
  FileJson2,
  FolderPlus,
  Layers,
  Palette,
  Pencil,
  Plus,
  Search,
  Settings,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

import type { SavedRequest } from "@/features/requests/request-client";
import type { Environment, Workspace } from "./workspace-client";
import { THEMES, applyTheme, type ThemeId } from "@/features/settings/settings-view";

type View = "request" | "environment" | "settings" | "flows" | "automations";

type Props = {
  open: boolean;
  onClose: () => void;
  requests: SavedRequest[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  environments: Environment[];
  activeEnvironmentId: string;
  onOpenRequest: (request: SavedRequest) => void;
  onNewRequest: () => void;
  onNewFolder: () => void;
  onOpenView: (view: View) => void;
  onOpenHistory: () => void;
  onChangeWorkspace: (id: string) => void;
  onChangeEnvironment: (id: string) => void;
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-300",
  POST: "text-amber-300",
  PUT: "text-sky-300",
  PATCH: "text-violet-300",
  DELETE: "text-rose-300",
};

export function CommandPalette(props: Props) {
  if (!props.open) return null;
  const run = (action: () => void) => () => {
    props.onClose();
    action();
  };

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-start justify-items-center bg-black/55 px-4 pt-[14vh] backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <Command
        label="Paleta de comandos"
        loop
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
        }}
        className="flux-fade-in w-full max-w-xl overflow-hidden rounded-xl bg-[var(--flux-dialog)] shadow-2xl ring-1 ring-[var(--flux-line)]"
      >
        <div className="flex items-center gap-2.5 px-4">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Busca una petición, workspace o acción…"
            className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <Command.List className="max-h-[52vh] overflow-y-auto p-2 pt-0 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group-heading]]:uppercase">
          <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
            Nada coincide con tu búsqueda.
          </Command.Empty>

          {props.requests.length ? (
            <Command.Group heading="Peticiones">
              {props.requests.map((request) => (
                <Item
                  key={request.id}
                  value={`${request.method} ${request.name} ${request.url}`}
                  onSelect={run(() => props.onOpenRequest(request))}
                  icon={<span className={`w-9 shrink-0 font-mono text-[9px] font-semibold ${METHOD_COLORS[request.method] ?? "text-violet-300"}`}>{request.method}</span>}
                  hint={request.url}
                >
                  {request.name}
                </Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Acciones">
            <Item value="nueva petición crear" onSelect={run(props.onNewRequest)} icon={<Plus size={14} />}>Nueva petición</Item>
            <Item value="nueva carpeta crear" onSelect={run(props.onNewFolder)} icon={<FolderPlus size={14} />}>Nueva carpeta</Item>
            <Item value="abrir flow flujo" onSelect={run(() => props.onOpenView("flows"))} icon={<Workflow size={14} />}>Abrir Flow</Item>
            <Item value="automatizaciones programadas tareas reloj" onSelect={run(() => props.onOpenView("automations"))} icon={<Clock size={14} />}>Abrir automatizaciones</Item>
            <Item value="editar environment variables" onSelect={run(() => props.onOpenView("environment"))} icon={<Pencil size={14} />}>Editar environment</Item>
            <Item value="historial" onSelect={run(props.onOpenHistory)} icon={<Clock3 size={14} />}>Ver historial</Item>
            <Item value="settings ajustes configuración" onSelect={run(() => props.onOpenView("settings"))} icon={<Settings size={14} />}>Abrir settings</Item>
          </Command.Group>

          {props.workspaces.length > 1 ? (
            <Command.Group heading="Workspaces">
              {props.workspaces.map((workspace) => (
                <Item key={workspace.id} value={`workspace ${workspace.name}`} onSelect={run(() => props.onChangeWorkspace(workspace.id))} icon={<Layers size={14} />} hint={workspace.id === props.activeWorkspaceId ? "activo" : undefined}>
                  {workspace.name}
                </Item>
              ))}
            </Command.Group>
          ) : null}

          {props.environments.length ? (
            <Command.Group heading="Environments">
              {props.environments.map((environment) => (
                <Item key={environment.id} value={`environment ${environment.name}`} onSelect={run(() => props.onChangeEnvironment(environment.id))} icon={<FileJson2 size={14} />} hint={environment.id === props.activeEnvironmentId ? "activo" : undefined}>
                  {environment.name}
                </Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group heading="Tema">
            {THEMES.map((theme) => (
              <Item key={theme.id} value={`tema ${theme.name}`} onSelect={run(() => applyTheme(theme.id as ThemeId))} icon={<Palette size={14} />}>
                <span className="flex items-center gap-2">
                  {theme.name}
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: theme.colors[2] }} />
                </span>
              </Item>
            ))}
          </Command.Group>
        </Command.List>
        <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-muted-foreground/70">
          <span><kbd className="font-sans">↑↓</kbd> navegar</span>
          <span><kbd className="font-sans">↵</kbd> abrir</span>
          <span className="ml-auto">⌘K / Ctrl+K</span>
        </div>
      </Command>
    </div>
  );
}

function Item({
  value,
  onSelect,
  icon,
  hint,
  children,
}: {
  value: string;
  onSelect: () => void;
  icon: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-xs text-zinc-300 data-[selected=true]:bg-white/[0.08] data-[selected=true]:text-white"
    >
      <span className="grid w-9 shrink-0 place-items-start text-muted-foreground [&>svg]:ml-0.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="max-w-[45%] truncate font-mono text-[10px] text-muted-foreground/70">{hint}</span> : null}
    </Command.Item>
  );
}
