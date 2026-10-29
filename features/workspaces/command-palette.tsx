"use client";

import { Command } from "cmdk";
import {
  Clock,
  Clock3,
  Home,
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

export function CommandPalette(props: Props) {
  if (!props.open) return null;
  const run = (action: () => void) => () => {
    props.onClose();
    action();
  };

  return (
    <div
      className="fx-command-backdrop"
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
        role="dialog"
        aria-modal="true"
        className="fx-command-palette flux-fade-in"
      >
        <div className="fx-command-search">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Busca una petición, workspace o acción…"
            className="fx-command-input"
          />
          <kbd className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <Command.List className="fx-command-list">
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
                  icon={<span className={`fx-method fx-method-${request.method.toLowerCase()}`}>{request.method}</span>}
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
                <Item key={workspace.id} value={`workspace ${workspace.name}`} onSelect={run(() => props.onChangeWorkspace(workspace.id))} icon={<Home size={14} />} hint={workspace.id === props.activeWorkspaceId ? "activo" : undefined}>
                  {workspace.name}
                </Item>
              ))}
            </Command.Group>
          ) : null}

          {props.environments.length ? (
            <Command.Group heading="Environments">
              {props.environments.map((environment) => (
                <Item key={environment.id} value={`environment ${environment.name}`} onSelect={run(() => props.onChangeEnvironment(environment.id))} icon={<Layers size={14} />} hint={environment.id === props.activeEnvironmentId ? "activo" : undefined}>
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
        <div className="fx-command-footer">
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
      className="fx-command-item"
    >
      <span className="fx-command-icon">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="fx-command-hint">{hint}</span> : null}
    </Command.Item>
  );
}
