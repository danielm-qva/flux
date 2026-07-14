"use client";

import Image from "next/image";
import { getVersion } from "@tauri-apps/api/app";
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
  Copy,
  MoreVertical,
  Plus,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { AuthUser } from "@/features/auth/auth-client";
import { RequestBuilder } from "@/features/requests/request-builder";
import {
  savedRequestApi,
  type SavedRequest,
} from "@/features/requests/request-client";
import {
  workspaceApi,
  type Environment,
  type EnvironmentVariable,
  type Workspace,
} from "./workspace-client";

type Props = { user: AuthUser; onLogout: () => Promise<void> };
type MainView = "request" | "environment";

export function AuthenticatedShell({ user, onLogout }: Props) {
  const requestListRef = useRef<HTMLDivElement>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState("");
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [workspaceForm, setWorkspaceForm] = useState(false);
  const [workspaceToRename, setWorkspaceToRename] = useState<Workspace | null>(
    null,
  );
  const [pendingWorkspaceDelete, setPendingWorkspaceDelete] =
    useState<Workspace | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [environmentForm, setEnvironmentForm] = useState(false);
  const [environmentToRename, setEnvironmentToRename] =
    useState<Environment | null>(null);
  const [pendingEnvironmentDelete, setPendingEnvironmentDelete] =
    useState<Environment | null>(null);
  const [deletingEnvironment, setDeletingEnvironment] = useState(false);
  const [requestForm, setRequestForm] = useState(false);
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [activeRequestId, setActiveRequestId] = useState("");
  const [pendingRequestDelete, setPendingRequestDelete] =
    useState<SavedRequest | null>(null);
  const [requestToRename, setRequestToRename] =
    useState<SavedRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [mainView, setMainView] = useState<MainView>("request");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemVersion, setSystemVersion] = useState<string | null>(null);

  const activeWorkspace =
    workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const activeEnvironment =
    environments.find((item) => item.id === activeEnvironmentId) ?? null;
  const activeRequest =
    requests.find((item) => item.id === activeRequestId) ?? null;

  useEffect(() => {
    let active = true;
    getVersion()
      .then((version) => active && setSystemVersion(version))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function closeRequestMenus(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      requestListRef.current
        ?.querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((menu) => {
          if (!menu.contains(target)) menu.removeAttribute("open");
        });
    }

    document.addEventListener("pointerdown", closeRequestMenus);
    return () => document.removeEventListener("pointerdown", closeRequestMenus);
  }, []);

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
    if (!activeWorkspaceId) return;
    let active = true;
    savedRequestApi
      .list(user.id, activeWorkspaceId)
      .then((items) => {
        if (!active) return;
        setRequests(items);
        setActiveRequestId(items[0]?.id ?? "");
      })
      .catch((cause) => active && setError(String(cause)));
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
      const created = await workspaceApi.create(
        user.id,
        String(form.get("name") ?? ""),
      );
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

  async function deleteWorkspace() {
    if (!pendingWorkspaceDelete) return;
    setDeletingWorkspace(true);
    try {
      await workspaceApi.remove(user.id, pendingWorkspaceDelete.id);
      const remaining = workspaces.filter(
        (workspace) => workspace.id !== pendingWorkspaceDelete.id,
      );
      setWorkspaces(remaining);
      setEnvironments([]);
      setActiveEnvironmentId("");
      setVariables([]);
      setRequests([]);
      setActiveRequestId("");
      setActiveWorkspaceId(remaining[0]?.id ?? "");
      setMainView("request");
      toast.success("Workspace eliminado", {
        description: `${pendingWorkspaceDelete.name} y sus recursos se eliminaron correctamente.`,
      });
      setPendingWorkspaceDelete(null);
      setError(null);
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo eliminar el workspace", {
        description: String(cause),
      });
    } finally {
      setDeletingWorkspace(false);
    }
  }

  async function renameWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceToRename) return;
    const form = new FormData(event.currentTarget);
    try {
      const renamed = await workspaceApi.rename(
        user.id,
        workspaceToRename.id,
        String(form.get("name") ?? ""),
      );
      setWorkspaces((items) =>
        items.map((workspace) =>
          workspace.id === renamed.id ? renamed : workspace,
        ),
      );
      setWorkspaceToRename(null);
      setError(null);
      toast.success("Workspace renombrado", {
        description: `${workspaceToRename.name} ahora se llama ${renamed.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo renombrar el workspace", {
        description: String(cause),
      });
    }
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    const form = new FormData(event.currentTarget);
    try {
      const created = await savedRequestApi.create(
        user.id,
        activeWorkspace.id,
        String(form.get("name") ?? ""),
      );
      setRequests((items) => [...items, created]);
      setActiveRequestId(created.id);
      setRequestForm(false);
      setMainView("request");
      setError(null);
      toast.success("Petición creada", {
        description: `${created.name} se añadió a ${activeWorkspace.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo crear la petición", {
        description: String(cause),
      });
    }
  }

  async function renameEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!environmentToRename) return;
    const form = new FormData(event.currentTarget);
    try {
      const renamed = await workspaceApi.renameEnvironment(
        user.id,
        environmentToRename.id,
        String(form.get("name") ?? ""),
      );
      setEnvironments((items) =>
        items.map((environment) =>
          environment.id === renamed.id ? renamed : environment,
        ),
      );
      setEnvironmentToRename(null);
      setError(null);
      toast.success("Environment renombrado", {
        description: `${environmentToRename.name} ahora se llama ${renamed.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo renombrar el environment", {
        description: String(cause),
      });
    }
  }

  async function deleteEnvironment() {
    if (!pendingEnvironmentDelete) return;
    setDeletingEnvironment(true);
    try {
      await workspaceApi.removeEnvironment(user.id, pendingEnvironmentDelete.id);
      const remaining = environments.filter(
        (environment) => environment.id !== pendingEnvironmentDelete.id,
      );
      setEnvironments(remaining);
      setActiveEnvironmentId(remaining[0]?.id ?? "");
      setVariables([]);
      setMainView("request");
      toast.success("Environment eliminado", {
        description: `${pendingEnvironmentDelete.name} y sus variables se eliminaron correctamente.`,
      });
      setPendingEnvironmentDelete(null);
      setError(null);
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo eliminar el environment", {
        description: String(cause),
      });
    } finally {
      setDeletingEnvironment(false);
    }
  }

  async function deleteRequest() {
    if (!pendingRequestDelete) return;
    setDeletingRequest(true);
    try {
      await savedRequestApi.remove(user.id, pendingRequestDelete.id);
      const remaining = requests.filter(
        (request) => request.id !== pendingRequestDelete.id,
      );
      setRequests(remaining);
      if (activeRequestId === pendingRequestDelete.id) {
        setActiveRequestId(remaining[0]?.id ?? "");
      }
      toast.success("Petición eliminada", {
        description: `${pendingRequestDelete.name} se eliminó de ${activeWorkspace?.name ?? "este workspace"}.`,
      });
      setPendingRequestDelete(null);
      setError(null);
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo eliminar la petición", {
        description: String(cause),
      });
    } finally {
      setDeletingRequest(false);
    }
  }

  async function renameRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestToRename) return;
    const form = new FormData(event.currentTarget);
    try {
      const renamed = await savedRequestApi.rename(
        user.id,
        requestToRename.id,
        String(form.get("name") ?? ""),
      );
      setRequests((items) =>
        items.map((request) =>
          request.id === renamed.id ? renamed : request,
        ),
      );
      setRequestToRename(null);
      setError(null);
      toast.success("Petición renombrada", {
        description: `${requestToRename.name} ahora se llama ${renamed.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo renombrar la petición", {
        description: String(cause),
      });
    }
  }

  async function duplicateRequest(request: SavedRequest) {
    try {
      const duplicate = await savedRequestApi.duplicate(user.id, request.id);
      setRequests((items) => [...items, duplicate]);
      setActiveRequestId(duplicate.id);
      setMainView("request");
      setError(null);
      toast.success("Petición duplicada", {
        description: `Se creó ${duplicate.name} con toda la configuración de ${request.name}.`,
      });
    } catch (cause) {
      setError(String(cause));
      toast.error("No se pudo duplicar la petición", {
        description: String(cause),
      });
    }
  }

  async function saveVariable(
    variableId: string | undefined,
    key: string,
    value: string,
  ) {
    if (!activeEnvironment) return;
    try {
      const saved = await workspaceApi.saveVariable(
        user.id,
        activeEnvironment.id,
        key,
        value,
        variableId,
      );
      setVariables((items) => {
        const exists = items.some((item) => item.id === saved.id);
        return exists
          ? items.map((item) => (item.id === saved.id ? saved : item))
          : [...items, saved];
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
      toast.error("No se pudo eliminar la variable", {
        description: String(cause),
      });
      throw cause;
    }
  }

  function openRequestEditor() {
    setMainView("request");
    window.setTimeout(() => document.getElementById("request-url")?.focus(), 0);
  }

  function changeWorkspace(workspaceId: string) {
    setRequests([]);
    setActiveRequestId("");
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
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-sans text-sm font-semibold text-white">
                Flux
              </p>
              {systemVersion ? (
                <span
                  className="shrink-0 rounded-md border border-violet-300/10 bg-violet-400/[0.07] px-1.5 py-0.5 font-mono text-[8px] leading-none tracking-[0.04em] text-violet-200/65"
                  title={`Versión ${systemVersion}`}
                >
                  v{systemVersion}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <SectionTitle label="Peticiones" onAdd={() => setRequestForm(true)} />
          {activeWorkspace ? (
            <div ref={requestListRef} className="mt-3 flex flex-1 flex-col">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className={`group flex h-9 w-full items-center rounded-lg border pr-1 ${mainView === "request" && activeRequestId === request.id ? "border-violet-400/15 bg-violet-500/10 text-violet-100" : "border-transparent text-muted-foreground hover:bg-white/[0.035] hover:text-white"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRequestId(request.id);
                      setMainView("request");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs"
                  >
                    <span
                      className={`w-10 shrink-0 font-mono text-[9px] font-bold ${methodColor(request.method)}`}
                    >
                      {request.method}
                    </span>
                    <span className="truncate">{request.name}</span>
                  </button>
                  <details className="relative shrink-0">
                    <summary
                      aria-label={`Acciones de ${request.name}`}
                      title="Más acciones"
                      className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-muted-foreground/55 opacity-0 transition hover:bg-white/5 hover:text-white focus:opacity-100 group-hover:opacity-100 [&::-webkit-details-marker]:hidden"
                    >
                      <MoreVertical size={14} />
                    </summary>
                    <div className="absolute top-8 right-0 z-50 w-40 overflow-hidden rounded-xl border border-white/10 bg-[#181022] p-1.5 shadow-2xl shadow-black/50">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          setRequestToRename(request);
                        }}
                        className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-muted-foreground hover:bg-violet-400/10 hover:text-violet-200"
                      >
                        <Pencil size={13} /> Editar nombre
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          void duplicateRequest(request);
                        }}
                        className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-muted-foreground hover:bg-violet-400/10 hover:text-violet-200"
                      >
                        <Copy size={13} /> Duplicar
                      </button>
                      <div className="my-1 h-px bg-white/[0.06]" />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          setPendingRequestDelete(request);
                        }}
                        className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-rose-300/80 hover:bg-rose-400/10 hover:text-rose-200"
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </div>
                  </details>
                </div>
              ))}
              {!requests.length ? (
                <div className="my-auto px-5 py-10 text-center">
                  <FileJson2
                    size={22}
                    className="mx-auto text-muted-foreground/45"
                  />
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    No hay peticiones guardadas en {activeWorkspace.name}.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequestForm(true)}
                    className="mt-4 text-xs font-medium text-violet-300 hover:text-violet-200"
                  >
                    Crear primera petición
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 px-3 text-xs leading-5 text-muted-foreground">
              Selecciona o crea un workspace para ver sus peticiones.
            </p>
          )}
        </div>

        <div className="border-t border-white/[0.06] p-3">
          <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/[0.035] hover:text-white">
            <Clock3 size={14} /> Historial
          </button>
          <button
            onClick={onLogout}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground hover:bg-white/[0.035] hover:text-white"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-[70px] min-w-0 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-white/[0.06] bg-[#100a1d]/80 px-3 xl:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-1 text-xs xl:gap-2">
            <Box size={15} className="shrink-0 text-violet-400 max-lg:hidden" />
            <WorkspaceSelect
              value={activeWorkspaceId}
              onChange={changeWorkspace}
              items={workspaces}
            />
            <button
              type="button"
              onClick={() => setWorkspaceForm(true)}
              aria-label="Crear workspace"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"
            >
              <Plus size={14} />
            </button>
            {activeWorkspace ? (
              <>
                <button
                  type="button"
                  onClick={() => setWorkspaceToRename(activeWorkspace)}
                  aria-label={`Renombrar workspace ${activeWorkspace.name}`}
                  title="Renombrar workspace"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-violet-400/10 hover:text-violet-300"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingWorkspaceDelete(activeWorkspace)}
                  aria-label={`Eliminar workspace ${activeWorkspace.name}`}
                  title="Eliminar workspace"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ) : null}
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1 xl:gap-2">
            {activeWorkspace ? (
              <>
                <SelectControl
                  value={activeEnvironmentId}
                  onChange={changeEnvironment}
                  placeholder="Sin environment"
                  items={environments}
                />
                <button
                  type="button"
                  onClick={() => setEnvironmentForm(true)}
                  aria-label="Crear environment"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"
                >
                  <Plus size={14} />
                </button>
                {activeEnvironment ? (
                  <button
                    type="button"
                    onClick={() => setMainView("environment")}
                    title="Editar environment"
                    aria-label="Editar environment"
                    className={`hidden h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-xs sm:inline-flex 2xl:px-3 ${mainView === "environment" ? "border-violet-400/25 bg-violet-500/15 text-violet-100" : "border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white"}`}
                  >
                    <Pencil size={13} />
                    <span className="hidden 2xl:inline">Editar environment</span>
                  </button>
                ) : null}
              </>
            ) : null}
            <button
              className="hidden size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white xl:grid"
              aria-label="Configuración"
            >
              <Settings size={15} />
            </button>
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-200">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main
          className={`relative flex min-h-0 flex-1 items-center justify-center p-3 xl:p-6 ${mainView === "request" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Cargando workspaces…
            </p>
          ) : null}
          {!loading && !activeWorkspace ? (
            <EmptyWorkspace onCreate={() => setWorkspaceForm(true)} />
          ) : null}
          {!loading && activeWorkspace && !activeEnvironment ? (
            <EmptyEnvironment
              workspace={activeWorkspace}
              onCreate={() => setEnvironmentForm(true)}
            />
          ) : null}
          {activeWorkspace &&
          activeEnvironment &&
          activeRequest &&
          mainView === "request" ? (
            <RequestBuilder
              key={activeRequest.id}
              userId={user.id}
              workspace={activeWorkspace}
              variables={variables}
              request={activeRequest}
              onSaved={(saved) =>
                setRequests((items) =>
                  items.map((item) => (item.id === saved.id ? saved : item)),
                )
              }
            />
          ) : null}
          {activeWorkspace &&
          activeEnvironment &&
          !activeRequest &&
          mainView === "request" ? (
            <EmptyRequest
              workspace={activeWorkspace}
              onCreate={() => setRequestForm(true)}
            />
          ) : null}
          {activeWorkspace &&
          activeEnvironment &&
          mainView === "environment" ? (
            <EnvironmentView
              environment={activeEnvironment}
              variables={variables}
              onBack={openRequestEditor}
              onRename={() => setEnvironmentToRename(activeEnvironment)}
              onDelete={() => setPendingEnvironmentDelete(activeEnvironment)}
              onSaveVariable={saveVariable}
              onRemoveVariable={removeVariable}
            />
          ) : null}
          {error ? (
            <p className="absolute bottom-5 rounded-lg border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
        </main>
      </div>

      {workspaceForm ? (
        <NameDialog
          title="Crear workspace"
          label="Nombre del workspace"
          onClose={() => setWorkspaceForm(false)}
          onSubmit={createWorkspace}
        />
      ) : null}
      {pendingWorkspaceDelete ? (
        <WorkspaceDeleteDialog
          workspace={pendingWorkspaceDelete}
          deleting={deletingWorkspace}
          onCancel={() => setPendingWorkspaceDelete(null)}
          onConfirm={deleteWorkspace}
        />
      ) : null}
      {workspaceToRename ? (
        <NameDialog
          title="Renombrar workspace"
          label="Nuevo nombre"
          defaultValue={workspaceToRename.name}
          submitLabel="Guardar cambios"
          onClose={() => setWorkspaceToRename(null)}
          onSubmit={renameWorkspace}
        />
      ) : null}
      {environmentForm ? (
        <NameDialog
          title="Crear environment"
          label="Nombre del environment"
          onClose={() => setEnvironmentForm(false)}
          onSubmit={createEnvironment}
          withColor
        />
      ) : null}
      {environmentToRename ? (
        <NameDialog
          title="Renombrar environment"
          label="Nuevo nombre"
          defaultValue={environmentToRename.name}
          submitLabel="Guardar cambios"
          onClose={() => setEnvironmentToRename(null)}
          onSubmit={renameEnvironment}
        />
      ) : null}
      {pendingEnvironmentDelete ? (
        <EnvironmentDeleteDialog
          environment={pendingEnvironmentDelete}
          deleting={deletingEnvironment}
          onCancel={() => setPendingEnvironmentDelete(null)}
          onConfirm={deleteEnvironment}
        />
      ) : null}
      {requestForm ? (
        <NameDialog
          title="Nueva petición"
          label="Nombre de la petición"
          onClose={() => setRequestForm(false)}
          onSubmit={createRequest}
        />
      ) : null}
      {pendingRequestDelete ? (
        <RequestDeleteDialog
          request={pendingRequestDelete}
          workspaceName={activeWorkspace?.name ?? "este workspace"}
          deleting={deletingRequest}
          onCancel={() => setPendingRequestDelete(null)}
          onConfirm={deleteRequest}
        />
      ) : null}
      {requestToRename ? (
        <NameDialog
          title="Renombrar petición"
          label="Nuevo nombre"
          defaultValue={requestToRename.name}
          submitLabel="Guardar cambios"
          onClose={() => setRequestToRename(null)}
          onSubmit={renameRequest}
        />
      ) : null}
    </div>
  );
}

function SectionTitle({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      <span>{label}</span>
      <button
        onClick={onAdd}
        className="grid size-7 place-items-center rounded-md text-violet-300 hover:bg-violet-400/10"
        aria-label={`Crear ${label}`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function SelectControl({
  value,
  onChange,
  placeholder,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: Environment[];
}) {
  return (
    <label className="relative hidden min-w-0 shrink sm:block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-[clamp(108px,16vw,190px)] appearance-none truncate rounded-lg border border-white/[0.07] bg-[#171024] pr-8 pl-3 text-xs text-violet-100 outline-none focus:border-violet-400/40"
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute top-3 right-2.5 text-muted-foreground"
      />
    </label>
  );
}

function WorkspaceSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Workspace[];
}) {
  return (
    <label className="relative block min-w-0 shrink">
      <span className="sr-only">Workspace activo</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-[clamp(108px,16vw,190px)] appearance-none truncate rounded-lg border border-white/[0.07] bg-[#171024] pr-8 pl-3 text-xs font-medium text-white outline-none focus:border-violet-400/40"
      >
        <option value="">Sin workspace</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute top-3 right-2.5 text-muted-foreground"
      />
    </label>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="max-w-md text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/10 text-violet-300">
        <FolderKanban size={24} />
      </div>
      <h1 className="mt-6 font-sans text-3xl font-semibold tracking-[-0.04em] text-white">
        Crea tu primer workspace
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Un workspace agrupa tus colecciones, environments y próximas requests.
      </p>
      <button
        onClick={onCreate}
        className="mt-7 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
      >
        <Plus size={15} /> Crear workspace
      </button>
    </section>
  );
}

function EmptyEnvironment({
  workspace,
  onCreate,
}: {
  workspace: Workspace;
  onCreate: () => void;
}) {
  return (
    <section className="max-w-md text-center">
      <Globe2 className="mx-auto text-violet-300" size={34} />
      <h1 className="mt-5 font-sans text-2xl font-semibold text-white">
        Añade un environment
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {workspace.name} todavía no tiene entornos. Crea Development, Staging o
        Production.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/10 px-4 text-sm text-violet-100 hover:bg-violet-500/15"
      >
        <Plus size={15} /> Crear environment
      </button>
    </section>
  );
}

function EmptyRequest({
  workspace,
  onCreate,
}: {
  workspace: Workspace;
  onCreate: () => void;
}) {
  return (
    <section className="max-w-md text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/10 text-violet-300">
        <FileJson2 size={24} />
      </div>
      <h1 className="mt-6 font-sans text-2xl font-semibold text-white">
        Crea una petición
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Ponle un nombre y quedará guardada dentro de {workspace.name}.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
      >
        <Plus size={15} /> Nueva petición
      </button>
    </section>
  );
}

function methodColor(method: string) {
  if (method === "GET") return "text-emerald-300";
  if (method === "POST") return "text-amber-300";
  if (method === "DELETE") return "text-rose-300";
  if (method === "PUT") return "text-sky-300";
  if (method === "PATCH") return "text-violet-300";
  if (method === "HEAD") return "text-emerald-200";
  if (method === "OPTIONS") return "text-pink-300";
  return "text-sky-300";
}

function EnvironmentView({
  environment,
  variables,
  onBack,
  onRename,
  onDelete,
  onSaveVariable,
  onRemoveVariable,
}: {
  environment: Environment;
  variables: EnvironmentVariable[];
  onBack: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSaveVariable: (
    id: string | undefined,
    key: string,
    value: string,
  ) => Promise<void>;
  onRemoveVariable: (id: string) => Promise<void>;
}) {
  return (
    <section className="w-full max-w-4xl self-start pt-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft size={14} /> Volver a peticiones
      </button>
      <div className="mt-5 flex min-w-0 items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.16em] text-violet-300 uppercase">
            Environment
          </p>
          <h1 className="mt-2 font-sans text-2xl font-semibold tracking-[-0.03em] text-white">
            Editar {environment.name}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Gestiona las variables que Flux sustituye al enviar una petición.
          </p>
        </div>
        <div className="mb-1 flex shrink-0 items-center gap-1">
          <span
            className="mr-2 size-3 rounded-full"
            style={{ backgroundColor: environment.color }}
            aria-label={`Color de ${environment.name}`}
          />
          <button
            type="button"
            onClick={onRename}
            title="Renombrar environment"
            aria-label={`Renombrar environment ${environment.name}`}
            className="grid size-9 place-items-center rounded-lg border border-white/[0.07] text-muted-foreground hover:bg-violet-400/10 hover:text-violet-300"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar environment"
            aria-label={`Eliminar environment ${environment.name}`}
            className="grid size-9 place-items-center rounded-lg border border-white/[0.07] text-muted-foreground hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-300"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <VariablesPanel
        environment={environment}
        variables={variables}
        onSave={onSaveVariable}
        onRemove={onRemoveVariable}
      />
    </section>
  );
}

function VariablesPanel({
  environment,
  variables,
  onSave,
  onRemove,
}: {
  environment: Environment;
  variables: EnvironmentVariable[];
  onSave: (id: string | undefined, key: string, value: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<EnvironmentVariable | null>(null);
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
  return (
    <>
      <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-[#120c1e]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <KeyRound size={15} className="text-violet-400" /> Variables ·{" "}
              {environment.name}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Usa las claves en requests con{" "}
              <code className="text-violet-300">{"{{CLAVE}}"}</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-300/15 bg-violet-500/10 px-3 text-xs text-violet-200 hover:bg-violet-500/15"
          >
            <Plus size={13} /> Variable
          </button>
        </div>
        <div className="grid grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_76px] border-b border-white/[0.05] px-5 py-2 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <span>Clave</span>
          <span>Valor</span>
          <span />
        </div>
        {variables.length === 0 && !adding ? (
          <p className="px-5 py-10 text-center text-xs text-muted-foreground">
            Este environment aún no tiene variables.
          </p>
        ) : null}
        {variables.map((variable) => (
          <VariableRow
            key={variable.id}
            variable={variable}
            onSave={onSave}
            onRemove={async () => setPendingDelete(variable)}
          />
        ))}
        {adding ? (
          <VariableRow
            onSave={async (id, key, value) => {
              await onSave(id, key, value);
              setAdding(false);
            }}
            onRemove={async () => setAdding(false)}
          />
        ) : null}
      </div>
      {pendingDelete ? (
        <ConfirmDeleteDialog
          variable={pendingDelete}
          environment={environment}
          deleting={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}

function VariableRow({
  variable,
  onSave,
  onRemove,
}: {
  variable?: EnvironmentVariable;
  onSave: (id: string | undefined, key: string, value: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [key, setKey] = useState(variable?.key ?? "");
  const [value, setValue] = useState(variable?.value ?? "");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(variable?.id, key, value);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_76px] items-center gap-3 border-b border-white/[0.045] px-5 py-2.5 last:border-0"
    >
      <input
        required
        value={key}
        onChange={(event) => setKey(event.target.value.toUpperCase())}
        placeholder="BASE_URL"
        pattern="[A-Za-z_][A-Za-z0-9_]*"
        maxLength={100}
        className="h-9 rounded-lg border border-white/[0.07] bg-black/15 px-3 font-mono text-xs text-violet-200 outline-none focus:border-violet-400/40"
      />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://api.example.com"
        className="h-9 min-w-0 rounded-lg border border-white/[0.07] bg-black/15 px-3 font-mono text-xs text-white outline-none focus:border-violet-400/40"
      />
      <div className="flex justify-end gap-1">
        <button
          disabled={saving}
          type="submit"
          className="h-8 rounded-md px-2 text-[11px] text-violet-200 hover:bg-violet-400/10 disabled:opacity-50"
        >
          {saving ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => onRemove(variable?.id ?? "")}
          aria-label="Eliminar variable"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </form>
  );
}

function ConfirmDeleteDialog({
  variable,
  environment,
  deleting,
  onCancel,
  onConfirm,
}: {
  variable: EnvironmentVariable;
  environment: Environment;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-variable-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-[#151020] p-6 shadow-2xl">
        <div className="grid size-10 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
          <Trash2 size={18} />
        </div>
        <h2
          id="delete-variable-title"
          className="mt-4 font-sans text-lg font-semibold text-white"
        >
          Eliminar variable
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ¿Quieres eliminar{" "}
          <code className="rounded bg-violet-400/10 px-1.5 py-0.5 text-violet-200">
            {variable.key}
          </code>{" "}
          de <span className="text-white">{environment.name}</span>?
        </p>
        <p className="mt-2 text-xs text-rose-200/70">
          Las peticiones que utilicen {`{{${variable.key}}}`} dejarán de
          resolver ese valor.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            autoFocus
            className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60"
          >
            {deleting ? "Eliminando…" : "Eliminar variable"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnvironmentDeleteDialog({
  environment,
  deleting,
  onCancel,
  onConfirm,
}: {
  environment: Environment;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-environment-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-[#151020] p-6 shadow-2xl">
        <div className="grid size-10 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
          <Trash2 size={18} />
        </div>
        <h2
          id="delete-environment-title"
          className="mt-4 font-sans text-lg font-semibold text-white"
        >
          Eliminar environment
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ¿Quieres eliminar el environment{" "}
          <span className="text-white">{environment.name}</span>?
        </p>
        <p className="mt-2 text-xs leading-5 text-rose-200/70">
          También se eliminarán definitivamente todas sus variables. Las
          peticiones que las utilicen dejarán de resolver esos valores.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            autoFocus
            className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60"
          >
            {deleting ? "Eliminando…" : "Eliminar environment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceDeleteDialog({
  workspace,
  deleting,
  onCancel,
  onConfirm,
}: {
  workspace: Workspace;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-workspace-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-[#151020] p-6 shadow-2xl">
        <div className="grid size-10 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
          <Trash2 size={18} />
        </div>
        <h2
          id="delete-workspace-title"
          className="mt-4 font-sans text-lg font-semibold text-white"
        >
          Eliminar workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ¿Quieres eliminar el workspace{" "}
          <span className="text-white">{workspace.name}</span>?
        </p>
        <p className="mt-2 text-xs leading-5 text-rose-200/70">
          También se eliminarán definitivamente sus environments, variables y
          peticiones guardadas.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            autoFocus
            className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60"
          >
            {deleting ? "Eliminando…" : "Eliminar workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestDeleteDialog({
  request,
  workspaceName,
  deleting,
  onCancel,
  onConfirm,
}: {
  request: SavedRequest;
  workspaceName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-request-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-rose-300/10 bg-[#151020] p-6 shadow-2xl">
        <div className="grid size-10 place-items-center rounded-xl bg-rose-400/10 text-rose-300">
          <Trash2 size={18} />
        </div>
        <h2
          id="delete-request-title"
          className="mt-4 font-sans text-lg font-semibold text-white"
        >
          Eliminar petición
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          ¿Quieres eliminar <span className="text-white">{request.name}</span> de{" "}
          <span className="text-white">{workspaceName}</span>?
        </p>
        <p className="mt-2 text-xs text-rose-200/70">
          Se perderán su URL, headers, params, autorización y body guardados.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            autoFocus
            className="h-9 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60"
          >
            {deleting ? "Eliminando…" : "Eliminar petición"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NameDialog({
  title,
  label,
  defaultValue = "",
  submitLabel = "Crear",
  onClose,
  onSubmit,
  withColor = false,
}: {
  title: string;
  label: string;
  defaultValue?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  withColor?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl"
      >
        <h2 className="font-sans text-xl font-semibold text-white">{title}</h2>
        <label className="mt-5 block text-xs text-muted-foreground">
          {label}
          <input
            name="name"
            defaultValue={defaultValue}
            required
            minLength={2}
            maxLength={60}
            autoFocus
            className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
          />
        </label>
        {withColor ? (
          <label className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            Color{" "}
            <input
              name="color"
              type="color"
              defaultValue="#8b5cf6"
              className="h-8 w-12 rounded border-0 bg-transparent"
            />
          </label>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="h-9 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
