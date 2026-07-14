"use client";

import Image from "next/image";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  Clock3,
  FileJson2,
  FolderKanban,
  Globe2,
  KeyRound,
  LogOut,
  Plus,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

import type { AuthUser } from "@/features/auth/auth-client";
import { RequestBuilder } from "@/features/requests/request-builder";
import {
  workspaceApi,
  type Environment,
  type EnvironmentVariable,
  type Workspace,
} from "./workspace-client";

type Props = { user: AuthUser; onLogout: () => Promise<void> };
type MainView = "request" | "environment";

export function AuthenticatedShell({ user, onLogout }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState("");
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [workspaceForm, setWorkspaceForm] = useState(false);
  const [environmentForm, setEnvironmentForm] = useState(false);
  const [mainView, setMainView] = useState<MainView>("request");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const activeEnvironment = environments.find((item) => item.id === activeEnvironmentId) ?? null;

  useEffect(() => {
    let active = true;
    workspaceApi
      .list(user.id)
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        setActiveWorkspaceId(items[0]?.id ?? "");
      })
      .catch((cause) => active && setError(String(cause)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user.id]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let active = true;
    workspaceApi.listEnvironments(user.id, activeWorkspaceId).then((items) => {
      if (!active) return;
      setEnvironments(items);
      setActiveEnvironmentId(items[0]?.id ?? "");
    });
    return () => {
      active = false;
    };
  }, [activeWorkspaceId, user.id]);

  useEffect(() => {
    if (!activeEnvironmentId) return;
    let active = true;
    workspaceApi
      .listVariables(user.id, activeEnvironmentId)
      .then((items) => active && setVariables(items))
      .catch((cause) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [activeEnvironmentId, user.id]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const created = await workspaceApi.create(user.id, String(form.get("name") ?? ""));
      setWorkspaces((items) => [...items, created]);
      setActiveWorkspaceId(created.id);
      setWorkspaceForm(false);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    const form = new FormData(event.currentTarget);
    try {
      const created = await workspaceApi.createEnvironment(
        user.id,
        activeWorkspace.id,
        String(form.get("name") ?? ""),
        String(form.get("color") ?? "#8b5cf6"),
      );
      setEnvironments((items) => [...items, created]);
      setActiveEnvironmentId(created.id);
      setVariables([]);
      setEnvironmentForm(false);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function saveVariable(variableId: string | undefined, key: string, value: string) {
    if (!activeEnvironment) return;
    try {
      const saved = await workspaceApi.saveVariable(user.id, activeEnvironment.id, key, value, variableId);
      setVariables((items) => {
        const exists = items.some((item) => item.id === saved.id);
        return exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [...items, saved];
      });
      setError(null);
      toast.success("Environment actualizado", {
        description: variableId
          ? `La variable ${saved.key} se actualizó en ${activeEnvironment.name}.`
          : `La variable ${saved.key} se añadió a ${activeEnvironment.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo actualizar el environment", {
        description: String(cause),
      });
      throw cause;
    }
  }

  async function removeVariable(variableId: string) {
    try {
      await workspaceApi.removeVariable(user.id, variableId);
      setVariables((items) => items.filter((item) => item.id !== variableId));
      toast.success("Environment actualizado", {
        description: `La variable se eliminó de ${activeEnvironment?.name ?? "este environment"}.`,
      });
    } catch (cause) {
      toast.error("No se pudo eliminar la variable", { description: String(cause) });
      throw cause;
    }
  }

  function openRequestEditor() {
    setMainView("request");
    window.setTimeout(() => document.getElementById("request-url")?.focus(), 0);
  }

  function changeWorkspace(workspaceId: string) {
    setActiveWorkspaceId(workspaceId);
    setMainView("request");
  }

  function changeEnvironment(environmentId: string) {
    setActiveEnvironmentId(environmentId);
    setMainView("request");
  }

  return (
    <div className="grid h-screen min-h-0 grid-cols-[250px_minmax(0,1fr)] overflow-hidden bg-[#0b0715] text-foreground max-md:grid-cols-1">
      <aside className="flex h-full min-h-0 flex-col border-r border-white/[0.06] bg-[#0d0818]/95 max-md:hidden">
        <div className="flex h-[70px] items-center gap-3 border-b border-white/[0.06] px-4">
          <Image src="/flux-icon.png" alt="" width={34} height={34} />
          <div className="min-w-0">
            <p className="font-sans text-sm font-semibold text-white">Flux</p>
            <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <SectionTitle label="Peticiones" onAdd={openRequestEditor} />
          {activeWorkspace ? (
            <div className="mt-3 flex flex-1 flex-col">
              <button type="button" onClick={openRequestEditor} className={`flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-xs ${mainView === "request" ? "border-violet-400/15 bg-violet-500/10 text-violet-100" : "border-transparent text-muted-foreground hover:bg-white/[0.035] hover:text-white"}`}>
                <span className="w-8 font-mono text-[9px] font-bold text-emerald-300">GET</span>
                <span className="truncate">Nueva petición</span>
              </button>
              <div className="my-auto px-5 py-10 text-center">
                <FileJson2 size={22} className="mx-auto text-muted-foreground/45" />
                <p className="mt-3 text-xs text-muted-foreground">No hay peticiones guardadas en {activeWorkspace.name}.</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 px-3 text-xs leading-5 text-muted-foreground">Selecciona o crea un workspace para ver sus peticiones.</p>
          )}
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/[0.035] hover:text-white">
            <Clock3 size={14} /> Historial
          </button>
          <button onClick={onLogout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/[0.035] hover:text-white">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#100a1d]/80 px-5">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Box size={15} className="text-violet-400" />
            <WorkspaceSelect value={activeWorkspaceId} onChange={changeWorkspace} items={workspaces} />
            <button type="button" onClick={() => setWorkspaceForm(true)} aria-label="Crear workspace" className="grid size-8 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"><Plus size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            {activeWorkspace ? (
              <><SelectControl value={activeEnvironmentId} onChange={changeEnvironment} placeholder="Sin environment" items={environments} /><button type="button" onClick={() => setEnvironmentForm(true)} aria-label="Crear environment" className="grid size-8 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"><Plus size={14} /></button>{activeEnvironment ? <button type="button" onClick={() => setMainView("environment")} className={`hidden h-9 items-center gap-2 rounded-lg border px-3 text-xs sm:inline-flex ${mainView === "environment" ? "border-violet-400/25 bg-violet-500/15 text-violet-100" : "border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white"}`}><Pencil size={13} /> Editar environment</button> : null}</>
            ) : null}
            <button className="grid size-9 place-items-center rounded-lg border border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white" aria-label="Configuración">
              <Settings size={15} />
            </button>
            <div className="grid size-9 place-items-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main className={`relative flex min-h-0 flex-1 items-center justify-center p-3 xl:p-6 ${mainView === "request" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {loading ? <p className="text-sm text-muted-foreground">Cargando workspaces…</p> : null}
          {!loading && !activeWorkspace ? <EmptyWorkspace onCreate={() => setWorkspaceForm(true)} /> : null}
          {!loading && activeWorkspace && !activeEnvironment ? (
            <EmptyEnvironment workspace={activeWorkspace} onCreate={() => setEnvironmentForm(true)} />
          ) : null}
          {activeWorkspace && activeEnvironment && mainView === "request" ? (
            <RequestBuilder workspace={activeWorkspace} variables={variables} />
          ) : null}
          {activeWorkspace && activeEnvironment && mainView === "environment" ? (
            <EnvironmentView environment={activeEnvironment} variables={variables} onBack={openRequestEditor} onSaveVariable={saveVariable} onRemoveVariable={removeVariable} />
          ) : null}
          {error ? <p className="absolute bottom-5 rounded-lg border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p> : null}
        </main>
      </div>

      {workspaceForm ? <NameDialog title="Crear workspace" label="Nombre del workspace" onClose={() => setWorkspaceForm(false)} onSubmit={createWorkspace} /> : null}
      {environmentForm ? <NameDialog title="Crear environment" label="Nombre del environment" onClose={() => setEnvironmentForm(false)} onSubmit={createEnvironment} withColor /> : null}
    </div>
  );
}

function SectionTitle({ label, onAdd }: { label: string; onAdd: () => void }) {
  return <div className="flex items-center justify-between px-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><span>{label}</span><button onClick={onAdd} className="grid size-7 place-items-center rounded-md text-violet-300 hover:bg-violet-400/10" aria-label={`Crear ${label}`}><Plus size={14} /></button></div>;
}

function SelectControl({ value, onChange, placeholder, items }: { value: string; onChange: (value: string) => void; placeholder: string; items: Environment[] }) {
  return <label className="relative hidden sm:block"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 appearance-none rounded-lg border border-white/[0.07] bg-[#171024] pr-8 pl-3 text-xs text-violet-100 outline-none focus:border-violet-400/40"><option value="">{placeholder}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute top-3 right-2.5 text-muted-foreground" /></label>;
}

function WorkspaceSelect({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: Workspace[] }) {
  return <label className="relative block"><span className="sr-only">Workspace activo</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-56 appearance-none rounded-lg border border-white/[0.07] bg-[#171024] pr-8 pl-3 text-xs font-medium text-white outline-none focus:border-violet-400/40"><option value="">Sin workspace</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute top-3 right-2.5 text-muted-foreground" /></label>;
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return <section className="max-w-md text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/10 text-violet-300"><FolderKanban size={24} /></div><h1 className="mt-6 font-sans text-3xl font-semibold tracking-[-0.04em] text-white">Crea tu primer workspace</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Un workspace agrupa tus colecciones, environments y próximas requests.</p><button onClick={onCreate} className="mt-7 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"><Plus size={15} /> Crear workspace</button></section>;
}

function EmptyEnvironment({ workspace, onCreate }: { workspace: Workspace; onCreate: () => void }) {
  return <section className="max-w-md text-center"><Globe2 className="mx-auto text-violet-300" size={34} /><h1 className="mt-5 font-sans text-2xl font-semibold text-white">Añade un environment</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{workspace.name} todavía no tiene entornos. Crea Development, Staging o Production.</p><button onClick={onCreate} className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/10 px-4 text-sm text-violet-100 hover:bg-violet-500/15"><Plus size={15} /> Crear environment</button></section>;
}

function EnvironmentView({ environment, variables, onBack, onSaveVariable, onRemoveVariable }: { environment: Environment; variables: EnvironmentVariable[]; onBack: () => void; onSaveVariable: (id: string | undefined, key: string, value: string) => Promise<void>; onRemoveVariable: (id: string) => Promise<void> }) {
  return <section className="w-full max-w-4xl self-start pt-5"><button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"><ArrowLeft size={14} /> Volver a peticiones</button><div className="mt-5 flex items-end justify-between"><div><p className="text-[10px] tracking-[0.16em] text-violet-300 uppercase">Environment</p><h1 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-white">Editar {environment.name}</h1><p className="mt-2 text-xs text-muted-foreground">Gestiona las variables que Flux sustituye al enviar una petición.</p></div><span className="mb-1 size-3 rounded-full" style={{ backgroundColor: environment.color }} /></div><VariablesPanel environment={environment} variables={variables} onSave={onSaveVariable} onRemove={onRemoveVariable} /></section>;
}

function VariablesPanel({ environment, variables, onSave, onRemove }: { environment: Environment; variables: EnvironmentVariable[]; onSave: (id: string | undefined, key: string, value: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EnvironmentVariable | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onRemove(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      // El error ya se muestra mediante la notificación global.
    } finally {
      setDeleting(false);
    }
  }
  return <><div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-[#120c1e]"><div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><div className="flex items-center gap-2 text-sm font-medium text-white"><KeyRound size={15} className="text-violet-400" /> Variables · {environment.name}</div><p className="mt-1 text-[11px] text-muted-foreground">Usa las claves en requests con <code className="text-violet-300">{"{{CLAVE}}"}</code>.</p></div><button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-300/15 bg-violet-500/10 px-3 text-xs text-violet-200 hover:bg-violet-500/15"><Plus size={13} /> Variable</button></div><div className="grid grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_76px] border-b border-white/[0.05] px-5 py-2 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"><span>Clave</span><span>Valor</span><span /></div>{variables.length === 0 && !adding ? <p className="px-5 py-10 text-center text-xs text-muted-foreground">Este environment aún no tiene variables.</p> : null}{variables.map((variable) => <VariableRow key={variable.id} variable={variable} onSave={onSave} onRemove={async () => setPendingDelete(variable)} />)}{adding ? <VariableRow onSave={async (id, key, value) => { await onSave(id, key, value); setAdding(false); }} onRemove={async () => setAdding(false)} /> : null}</div>{pendingDelete ? <ConfirmDeleteDialog variable={pendingDelete} environment={environment} deleting={deleting} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} /> : null}</>;
}

function VariableRow({ variable, onSave, onRemove }: { variable?: EnvironmentVariable; onSave: (id: string | undefined, key: string, value: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [key, setKey] = useState(variable?.key ?? "");
  const [value, setValue] = useState(variable?.value ?? "");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); try { await onSave(variable?.id, key, value); } finally { setSaving(false); } }
  return <form onSubmit={submit} className="grid grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_76px] items-center gap-3 border-b border-white/[0.045] px-5 py-2.5 last:border-0"><input required value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} placeholder="BASE_URL" pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={100} className="h-9 rounded-lg border border-white/[0.07] bg-black/15 px-3 font-mono text-xs text-violet-200 outline-none focus:border-violet-400/40"/><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://api.example.com" className="h-9 min-w-0 rounded-lg border border-white/[0.07] bg-black/15 px-3 font-mono text-xs text-white outline-none focus:border-violet-400/40"/><div className="flex justify-end gap-1"><button disabled={saving} type="submit" className="h-8 rounded-md px-2 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-50">{saving ? "…" : "Guardar"}</button><button type="button" onClick={() => onRemove(variable?.id ?? "")} aria-label="Eliminar variable" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-300"><Trash2 size={13} /></button></div></form>;
}

function ConfirmDeleteDialog({ variable, environment, deleting, onCancel, onConfirm }: { variable: EnvironmentVariable; environment: Environment; deleting: boolean; onCancel: () => void; onConfirm: () => Promise<void> }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-variable-title"><div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-[#151020] p-6 shadow-2xl"><div className="grid size-10 place-items-center rounded-xl bg-rose-400/10 text-rose-300"><Trash2 size={18} /></div><h2 id="delete-variable-title" className="mt-4 font-sans text-lg font-semibold text-white">Eliminar variable</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">¿Quieres eliminar <code className="rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-200">{variable.key}</code> de <span className="text-white">{environment.name}</span>?</p><p className="mt-2 text-xs text-rose-200/70">Las peticiones que utilicen {`{{${variable.key}}}`} dejarán de resolver ese valor.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={deleting} className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50">Cancelar</button><button type="button" onClick={onConfirm} disabled={deleting} autoFocus className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60">{deleting ? "Eliminando…" : "Eliminar variable"}</button></div></div></div>;
}

function NameDialog({ title, label, onClose, onSubmit, withColor = false }: { title: string; label: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; withColor?: boolean }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 backdrop-blur-sm"><form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl"><h2 className="font-sans text-xl font-semibold text-white">{title}</h2><label className="mt-5 block text-xs text-muted-foreground">{label}<input name="name" required minLength={2} maxLength={60} autoFocus className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50" /></label>{withColor ? <label className="mt-4 flex items-center justify-between text-xs text-muted-foreground">Color <input name="color" type="color" defaultValue="#8b5cf6" className="h-8 w-12 rounded border-0 bg-transparent" /></label> : null}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5">Cancelar</button><button type="submit" className="h-9 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500">Crear</button></div></form></div>;
}
