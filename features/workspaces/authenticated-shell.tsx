"use client";

import { AppSelect } from "@/components/ui/app-select";

import { getVersion } from "@tauri-apps/api/app";
import {
  Search,
  List,
  Eye,
  EyeOff,
  Clock,
  Clock3,
  Home,
  Layers,
  FileJson2,
  FolderKanban,
  FolderPlus,
  LogOut,
  Plus,
  Pencil,
  Settings,
  Trash2,
  Workflow,
  MoreHorizontal,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type { AuthUser } from "@/features/auth/auth-client";
import { WhatsNewModal } from "@/features/updater/whats-new-modal";
import { UpdateControl } from "@/features/updater/update-control";
import { SettingsView, ThemeRuntime } from "@/features/settings/settings-view";
import type { WorkspaceImport } from "@/features/workspaces/workspace-transfer-client";
import { WorkspaceTransfer } from "@/features/workspaces/workspace-transfer";
import { CommandPalette } from "./command-palette";
import { sampleAlreadySeeded, seedSampleWorkspace } from "./sample-workspace";
import { RequestBuilder } from "@/features/requests/request-builder";
import { RequestTree } from "@/features/requests/request-tree";
import { RequestTabs } from "@/features/requests/request-tabs";
import { FlowsView } from "@/features/flows/flows-view";
import {
  createFlowFromRequests,
  parseGraph,
  requestFlowApi,
  type RequestFlow,
} from "@/features/flows/flow-client";
import { suggestExtractions } from "@/features/flows/suggest-extractions";
import { HistoryView } from "@/features/requests/history-view";
import { ThemePicker } from "@/features/settings/theme-picker";
import { AutomationsView } from "@/features/automations/automations-view";
import { useAutomations } from "@/features/automations/use-automations";
import {
  requestFolderApi,
  requestHistoryApi,
  savedRequestApi,
  type RequestFolder,
  type RequestHistoryEntry,
  type SavedRequest,
} from "@/features/requests/request-client";
import {
  workspaceApi,
  type Environment,
  type EnvironmentVariable,
  type Workspace,
} from "./workspace-client";

type Props = { user: AuthUser; onLogout: () => Promise<void> };
type FlowVariable = { key: string; from: string };

function collectFlowVariables(flows: RequestFlow[]): FlowVariable[] {
  const seen = new Map<string, FlowVariable>();
  for (const flow of flows) {
    for (const node of parseGraph(flow.graphJson).nodes) {
      for (const extraction of node.extractions ?? []) {
        const key = extraction.variable.trim();
        if (key && !seen.has(key.toLowerCase()))
          seen.set(key.toLowerCase(), { key, from: flow.name });
      }
    }
  }
  return [...seen.values()];
}

type MainView =
  "request" | "environment" | "settings" | "flows" | "automations" | "history";

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
  const [folders, setFolders] = useState<RequestFolder[]>([]);
  const [folderForm, setFolderForm] = useState<string | null | undefined>();
  const [folderToRename, setFolderToRename] = useState<RequestFolder | null>(
    null,
  );
  const [folderToDelete, setFolderToDelete] = useState<RequestFolder | null>(
    null,
  );
  const [requestFolderId, setRequestFolderId] = useState<string | null>(null);
  const [requestToMove, setRequestToMove] = useState<SavedRequest | null>(null);
  const [history, setHistory] = useState<RequestHistoryEntry[]>([]);
  const [requestSearch, setRequestSearch] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [introFlowId, setIntroFlowId] = useState<string | undefined>();
  const [flowVariables, setFlowVariables] = useState<FlowVariable[]>([]);
  const handleFlowsChange = useCallback(
    (flows: RequestFlow[]) => setFlowVariables(collectFlowVariables(flows)),
    [],
  );
  const [activeRequestId, setActiveRequestId] = useState("");
  const [openRequestIds, setOpenRequestIds] = useState<string[]>([]);
  const [dirtyRequestIds, setDirtyRequestIds] = useState<Set<string>>(
    new Set(),
  );
  const requestSavers = useRef(new Map<string, () => Promise<boolean>>());
  const [pendingRequestDelete, setPendingRequestDelete] =
    useState<SavedRequest | null>(null);
  const [requestToRename, setRequestToRename] = useState<SavedRequest | null>(
    null,
  );
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
    function closeMenus(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      document
        .querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((menu) => {
          if (!menu.contains(target)) menu.removeAttribute("open");
        });
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      document
        .querySelectorAll<HTMLDetailsElement>("details[open]")
        .forEach((menu) => menu.removeAttribute("open"));
    }

    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    workspaceApi
      .list(user.id)
      .then(async (items) => {
        if (!active) return;
        if (!items.length && !sampleAlreadySeeded(user.id)) {
          try {
            items = [await seedSampleWorkspace(user.id)];
            toast.success("Te preparamos un workspace de ejemplo", {
              description:
                "Abre una petición y pulsa Enviar para ver una respuesta real.",
            });
          } catch {
            /* si falla el ejemplo, se muestra el estado vacío normal */
          }
        }
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
        setOpenRequestIds(items[0] ? [items[0].id] : []);
      })
      .catch((cause) => active && setError(String(cause)));
    return () => {
      active = false;
    };
  }, [activeWorkspaceId, user.id]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let active = true;
    requestFlowApi
      .list(user.id, activeWorkspaceId)
      .then((items) => active && setFlowVariables(collectFlowVariables(items)))
      .catch(() => active && setFlowVariables([]));
    return () => {
      active = false;
    };
  }, [activeWorkspaceId, user.id]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    requestFolderApi
      .list(user.id, activeWorkspaceId)
      .then(setFolders)
      .catch((cause) => setError(String(cause)));
    requestHistoryApi
      .list(user.id, activeWorkspaceId)
      .then(setHistory)
      .catch((cause) => setError(String(cause)));
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
      setOpenRequestIds([]);
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
    if (!(await saveOpenRequest())) return;
    const name = String(form.get("name") ?? "").trim();
    const duplicated = requests.some(
      (request) =>
        request.name.localeCompare(name, undefined, {
          sensitivity: "accent",
        }) === 0,
    );
    if (duplicated) {
      toast.warning("Ese nombre ya está en uso", {
        description:
          "Usa un nombre diferente para identificar la petición en este workspace.",
      });
      return;
    }
    try {
      const created = await savedRequestApi.create(
        user.id,
        activeWorkspace.id,
        name,
        requestFolderId,
      );
      setRequests((items) => [...items, created]);
      setActiveRequestId(created.id);
      setOpenRequestIds((ids) => [
        ...ids.filter((id) => id !== created.id),
        created.id,
      ]);
      setRequestForm(false);
      setRequestFolderId(null);
      setMainView("request");
      setError(null);
      toast.success("Petición creada", {
        description: `${created.name} se añadió a ${activeWorkspace.name}.`,
      });
    } catch (cause) {
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
      await workspaceApi.removeEnvironment(
        user.id,
        pendingEnvironmentDelete.id,
      );
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
      setOpenRequestIds((ids) =>
        ids.filter((id) => id !== pendingRequestDelete.id),
      );
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
    const nextName = String(form.get("name") ?? "").trim();
    if (
      requests.some(
        (request) =>
          request.id !== requestToRename.id &&
          request.name.localeCompare(nextName, undefined, {
            sensitivity: "accent",
          }) === 0,
      )
    ) {
      toast.warning("Ese nombre ya está en uso", {
        description: "Elige otro nombre para la petición.",
      });
      return;
    }
    try {
      const renamed = await savedRequestApi.rename(
        user.id,
        requestToRename.id,
        nextName,
      );
      setRequests((items) =>
        items.map((request) => (request.id === renamed.id ? renamed : request)),
      );
      setRequestToRename(null);
      setError(null);
      toast.success("Petición renombrada", {
        description: `${requestToRename.name} ahora se llama ${renamed.name}.`,
      });
    } catch (cause) {
      toast.error("No se pudo renombrar la petición", {
        description: String(cause),
      });
    }
  }

  async function duplicateRequest(request: SavedRequest) {
    if (!(await saveOpenRequest())) return;
    try {
      const duplicate = await savedRequestApi.duplicate(user.id, request.id);
      setRequests((items) => [...items, duplicate]);
      setActiveRequestId(duplicate.id);
      setOpenRequestIds((ids) => [
        ...ids.filter((id) => id !== duplicate.id),
        duplicate.id,
      ]);
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

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeWorkspace) return;
    try {
      const created = await requestFolderApi.create(
        user.id,
        activeWorkspace.id,
        String(new FormData(event.currentTarget).get("name") ?? ""),
        folderForm ?? null,
      );
      setFolders((items) => [...items, created]);
      setFolderForm(undefined);
      toast.success("Carpeta creada");
    } catch (cause) {
      toast.error("No se pudo crear la carpeta", {
        description: String(cause),
      });
    }
  }
  async function renameFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderToRename) return;
    try {
      const updated = await requestFolderApi.rename(
        user.id,
        folderToRename.id,
        String(new FormData(event.currentTarget).get("name") ?? ""),
      );
      setFolders((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setFolderToRename(null);
      toast.success("Carpeta renombrada");
    } catch (cause) {
      toast.error("No se pudo renombrar", { description: String(cause) });
    }
  }
  async function deleteFolder() {
    if (!folderToDelete) return;
    try {
      await requestFolderApi.remove(user.id, folderToDelete.id);
      const removed = new Set([folderToDelete.id]);
      let found = true;
      while (found) {
        found = false;
        for (const folder of folders)
          if (
            folder.parentId &&
            removed.has(folder.parentId) &&
            !removed.has(folder.id)
          ) {
            removed.add(folder.id);
            found = true;
          }
      }
      setFolders((items) => items.filter((item) => !removed.has(item.id)));
      setRequests((items) =>
        items.map((item) =>
          item.folderId && removed.has(item.folderId)
            ? { ...item, folderId: null }
            : item,
        ),
      );
      setFolderToDelete(null);
      toast.success("Carpeta eliminada", {
        description: "Las peticiones quedaron en Sin carpeta.",
      });
    } catch (cause) {
      toast.error("No se pudo eliminar", { description: String(cause) });
    }
  }
  async function moveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requestToMove) return;
    const folderId =
      String(new FormData(event.currentTarget).get("folderId") ?? "") || null;
    try {
      const moved = await savedRequestApi.move(
        user.id,
        requestToMove.id,
        folderId,
      );
      setRequests((items) =>
        items.map((item) => (item.id === moved.id ? moved : item)),
      );
      setRequestToMove(null);
      toast.success("Petición movida");
    } catch (cause) {
      toast.error("No se pudo mover", { description: String(cause) });
    }
  }
  const statusById = useMemo(() => {
    const map = new Map<string, "ok" | "error">();
    for (const entry of history) {
      if (!entry.requestId || map.has(entry.requestId)) continue;
      map.set(
        entry.requestId,
        !entry.error && entry.status !== null && entry.status < 400
          ? "ok"
          : "error",
      );
    }
    return map;
  }, [history]);

  const lastBodyByRequestId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of history) {
      if (entry.requestId && !map.has(entry.requestId) && entry.responseBody)
        map.set(entry.requestId, entry.responseBody);
    }
    return map;
  }, [history]);

  async function saveAllDirtyRequests() {
    for (const id of dirtyRequestIds) {
      if (!((await requestSavers.current.get(id)?.()) ?? true)) return false;
    }
    return true;
  }

  async function folderToFlow(folder: RequestFolder) {
    if (!activeWorkspace) return;
    const ids = requests
      .filter((item) => item.folderId === folder.id)
      .map((item) => item.id);
    if (!ids.length) {
      toast.warning("La carpeta está vacía", {
        description: "Añade peticiones para convertirla en un Flow.",
      });
      return;
    }
    try {
      if (!(await saveAllDirtyRequests())) return;
      const byId = new Map(requests.map((item) => [item.id, item]));
      let summary: ReturnType<typeof suggestExtractions> | null = null;
      const flow = await createFlowFromRequests(
        user.id,
        activeWorkspace.id,
        folder.name,
        ids,
        (graph) => {
          summary = suggestExtractions(
            graph,
            byId,
            variables.map((item) => item.key),
            (requestId) => lastBodyByRequestId.get(requestId),
          );
          return summary.graph;
        },
      );
      setIntroFlowId(flow.id);
      setMainView("flows");
      const chained =
        (summary as ReturnType<typeof suggestExtractions> | null)?.added
          .length ?? 0;
      toast.success(`Flow creado con ${ids.length} pasos`, {
        description: chained
          ? `${chained} variable${chained > 1 ? "s" : ""} encadenada${chained > 1 ? "s" : ""} automáticamente.`
          : "Pulsa «Sugerir variables» cuando tus peticiones usen {{variables}} de pasos anteriores.",
      });
    } catch (cause) {
      toast.error("No se pudo crear el Flow", { description: String(cause) });
    }
  }

  async function recordExecution(result: {
    method: string;
    resolvedUrl: string;
    response?: import("@/features/requests/request-client").HttpResponse;
    error?: string;
  }) {
    if (!activeWorkspace || !activeRequest) return;
    try {
      const entry = await requestHistoryApi.record({
        userId: user.id,
        workspaceId: activeWorkspace.id,
        requestId: activeRequest.id,
        requestName: activeRequest.name,
        method: result.method,
        resolvedUrl: result.resolvedUrl,
        status: result.response?.status ?? null,
        statusText: result.response?.statusText ?? "",
        durationMs: result.response?.durationMs ?? null,
        sizeBytes: result.response?.sizeBytes ?? null,
        responseHeaders: JSON.stringify(result.response?.headers ?? []),
        responseBody: result.response?.body ?? "",
        error: result.error ?? null,
      });
      setHistory((items) => [entry, ...items].slice(0, 200));
    } catch (cause) {
      toast.error("No se pudo guardar el historial", {
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

  const automations = useAutomations({
    userId: user.id,
    workspaceId: activeWorkspaceId,
    requests,
    onVariableSaved: mergeVariable,
  });
  const activeAutomations = automations.items.filter(
    (item) => item.enabled,
  ).length;
  const automatedIds = useMemo(
    () => new Set(automations.items.map((item) => item.requestId)),
    [automations.items],
  );

  function mergeVariable(saved: EnvironmentVariable) {
    if (saved.environmentId !== activeEnvironmentId) return;
    setVariables((items) => {
      const exists = items.some((item) => item.id === saved.id);
      return exists
        ? items.map((item) => (item.id === saved.id ? saved : item))
        : [...items, saved];
    });
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

  const registerRequestSave = useCallback(
    (requestId: string, save: () => Promise<boolean>) => {
      requestSavers.current.set(requestId, save);
      return () => {
        requestSavers.current.delete(requestId);
      };
    },
    [],
  );

  const updateRequestDirty = useCallback(
    (requestId: string, dirty: boolean) => {
      setDirtyRequestIds((current) => {
        const next = new Set(current);
        if (dirty) next.add(requestId);
        else next.delete(requestId);
        return next;
      });
    },
    [],
  );

  async function saveOpenRequest(requestId = activeRequestId) {
    if (!requestId || !dirtyRequestIds.has(requestId)) return true;
    return (await requestSavers.current.get(requestId)?.()) ?? true;
  }

  async function openRequest(request: SavedRequest) {
    setIntroFlowId(undefined);
    if (request.id !== activeRequestId && !(await saveOpenRequest())) return;
    setOpenRequestIds((ids) =>
      ids.includes(request.id) ? ids : [...ids, request.id],
    );
    setActiveRequestId(request.id);
    setMainView("request");
  }

  async function closeRequestTab(requestId: string) {
    if (!(await saveOpenRequest(requestId))) return;
    const index = openRequestIds.indexOf(requestId);
    const remaining = openRequestIds.filter((id) => id !== requestId);
    setOpenRequestIds(remaining);
    if (activeRequestId === requestId)
      setActiveRequestId(remaining[index] ?? remaining[index - 1] ?? "");
  }

  async function leaveRequestView(view: MainView) {
    setIntroFlowId(undefined);
    if (!(await saveAllDirtyRequests())) return;
    setMainView(view);
  }

  function changeWorkspace(workspaceId: string) {
    void saveOpenRequest();
    setRequests([]);
    setFolders([]);
    setHistory([]);
    setActiveRequestId("");
    setOpenRequestIds([]);
    setActiveWorkspaceId(workspaceId);
    setMainView("request");
  }

  function changeEnvironment(environmentId: string) {
    setVariables([]);
    setActiveEnvironmentId(environmentId);
    setMainView("request");
  }

  async function workspaceImported(result: WorkspaceImport) {
    try {
      const items = await workspaceApi.list(user.id);
      setWorkspaces(items);
      changeWorkspace(result.workspaceId);
      toast.success("Workspace disponible", {
        description: `${result.workspaceName} se añadió a Flux.`,
      });
    } catch (cause) {
      toast.error("El workspace se importó, pero no se pudo abrir", {
        description: String(cause),
      });
    }
  }

  return (
    <div
      className={`fx-workspace ${mainView === "history" || mainView === "settings" ? "fx-without-side" : ""}`}
    >
      <nav className="fx-rail" aria-label="Navegación principal">
        <button
          className="fx-brand"
          aria-label="Flux · Peticiones"
          onClick={() => void leaveRequestView("request")}
        >
          fx
        </button>
        {(
          [
            ["request", List, "Peticiones"],
            ["history", Clock3, "Historial"],
            ["environment", Layers, "Entornos"],
            ["flows", Workflow, "Flow"],
          ] as const
        ).map(([view, Icon, label]) => (
          <button
            key={view}
            type="button"
            title={label}
            aria-label={label}
            aria-current={mainView === view ? "page" : undefined}
            className={`fx-rail-button ${mainView === view ? "is-on" : ""}`}
            onClick={() => void leaveRequestView(view)}
          >
            <Icon size={17} />
          </button>
        ))}
        <button
          className="fx-rail-button"
          title="Buscar ⌘K"
          aria-label="Buscar"
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={17} />
        </button>
        {automations.items.length > 0 && (
          <button
            className={`fx-rail-button ${mainView === "automations" ? "is-on" : ""}`}
            title="Automatizaciones"
            aria-label="Automatizaciones"
            onClick={() => void leaveRequestView("automations")}
          >
            <Clock size={17} />
            {activeAutomations > 0 && <span className="fx-live-dot" />}
          </button>
        )}
        <div className="fx-rail-bottom">
          <ThemePicker />
          <button
            className={`fx-rail-button ${mainView === "settings" ? "is-on" : ""}`}
            title="Ajustes"
            aria-label="Ajustes"
            onClick={() => void leaveRequestView("settings")}
          >
            <Settings size={17} />
          </button>
          <button
            className="fx-rail-button"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            onClick={onLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>
      <aside className="fx-sidebar">
        <div className="fx-sidebar-heading">
          <WorkspaceSelect
            value={activeWorkspaceId}
            onChange={changeWorkspace}
            items={workspaces}
          />
          <details className="relative">
            <summary
              className="fx-icon-button"
              aria-label="Acciones del workspace"
            >
              <MoreHorizontal size={16} />
            </summary>
            <div
              className="fx-popover"
              onClick={(event) =>
                event.currentTarget.closest("details")?.removeAttribute("open")
              }
            >
              <button onClick={() => setWorkspaceForm(true)}>
                Crear workspace
              </button>
              {activeWorkspace && (
                <>
                  <button onClick={() => setWorkspaceToRename(activeWorkspace)}>
                    Renombrar workspace
                  </button>
                  <button
                    onClick={() => setPendingWorkspaceDelete(activeWorkspace)}
                  >
                    Eliminar workspace
                  </button>
                </>
              )}
            </div>
          </details>
        </div>
        {mainView === "environment" ? (
          <>
            <div className="fx-sidebar-heading">
              <span>Entornos</span>
              <button
                className="fx-icon-button"
                aria-label="Crear entorno"
                onClick={() => setEnvironmentForm(true)}
              >
                <Plus size={16} />
              </button>
            </div>
            {environments.map((env) => (
              <button
                key={env.id}
                className={`fx-side-item ${activeEnvironmentId === env.id ? "is-on" : ""}`}
                onClick={() => {
                  if (activeEnvironmentId !== env.id) {
                    setVariables([]);
                    setActiveEnvironmentId(env.id);
                  }
                }}
              >
                <span
                  className="fx-live-dot"
                  style={{ background: env.color }}
                />
                {env.name}
                {activeEnvironmentId === env.id && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Activo
                  </span>
                )}
              </button>
            ))}
            {!environments.length && (
              <p className="p-4 text-xs text-muted-foreground">
                Crea un entorno para guardar tus variables.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="fx-sidebar-search">
              <Search size={14} />
              <input
                aria-label="Buscar peticiones"
                placeholder="Buscar"
                value={requestSearch}
                onChange={(event) => setRequestSearch(event.target.value)}
              />
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label="Búsqueda global"
              >
                <kbd>⌘K</kbd>
              </button>
            </div>
            <SectionTitle
              label="Peticiones"
              onAdd={() => {
                setRequestFolderId(null);
                setRequestForm(true);
              }}
              onAddFolder={() => setFolderForm(null)}
            />
            <div ref={requestListRef} className="min-h-0 flex-1 overflow-auto">
              <RequestTree
                statusById={statusById}
                onFolderToFlow={(folder) => void folderToFlow(folder)}
                folders={folders}
                requests={requests.filter((request) =>
                  request.name
                    .toLowerCase()
                    .includes(requestSearch.toLowerCase()),
                )}
                activeRequestId={mainView === "request" ? activeRequestId : ""}
                onSelect={(request) => void openRequest(request)}
                onNewRequest={(folderId) => {
                  setRequestFolderId(folderId);
                  setRequestForm(true);
                }}
                onNewFolder={(parentId) => setFolderForm(parentId)}
                onRenameFolder={setFolderToRename}
                onDeleteFolder={setFolderToDelete}
                onRequestMenu={(request, action) => {
                  if (action === "rename") setRequestToRename(request);
                  else if (action === "duplicate")
                    void duplicateRequest(request);
                  else if (action === "move") setRequestToMove(request);
                  else setPendingRequestDelete(request);
                }}
              />
            </div>
          </>
        )}
      </aside>
      <div className="fx-main">
        <header className="fx-topbar">
          <div className="min-w-0">
            <p className="fx-breadcrumb">
              {mainView === "request"
                ? (folders.find(
                    (folder) => folder.id === activeRequest?.folderId,
                  )?.name ??
                  activeWorkspace?.name ??
                  "Flux")
                : (activeWorkspace?.name ?? "Flux")}{" "}
              /
            </p>
            <h1 className="fx-page-title">
              {mainView === "request"
                ? (activeRequest?.name ?? "Peticiones")
                : (
                    {
                      environment: "Entornos",
                      history: "Historial",
                      settings: "Ajustes",
                      flows: "Flow",
                      automations: "Automatizaciones",
                    } as const
                  )[mainView]}
              {activeRequest &&
                mainView === "request" &&
                dirtyRequestIds.has(activeRequest.id) && (
                  <span className="fx-dirty-dot" />
                )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {activeWorkspace && (
              <SelectControl
                value={activeEnvironmentId}
                onChange={changeEnvironment}
                placeholder="Sin entorno"
                items={environments}
              />
            )}
            {mainView === "environment" && (
              <button
                className="fx-icon-button"
                aria-label="Crear entorno"
                onClick={() => setEnvironmentForm(true)}
              >
                <Plus size={16} />
              </button>
            )}
            {mainView === "request" && activeRequest && (
              <button
                className="fx-icon-button"
                title="Guardar ⌘S"
                aria-label="Guardar petición activa"
                onClick={() =>
                  void requestSavers.current.get(activeRequest.id)?.()
                }
              >
                <FileJson2 size={16} />
              </button>
            )}
            <WorkspaceTransfer
              variant="toolbar"
              userId={user.id}
              workspace={activeWorkspace}
              onImported={(result) => void workspaceImported(result)}
            />
          </div>
        </header>

        <main
          className={`fx-content relative flex min-h-0 flex-1 ${mainView === "request" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Cargando workspaces…
            </p>
          ) : null}
          {!loading && !activeWorkspace && mainView !== "settings" ? (
            <EmptyWorkspace onCreate={() => setWorkspaceForm(true)} />
          ) : null}
          {activeWorkspace && activeRequest && mainView === "request" ? (
            <div className="flex h-full min-h-0 w-full flex-col">
              {openRequestIds.length > 1 && (
                <RequestTabs
                  tabs={openRequestIds
                    .map((id) => requests.find((item) => item.id === id))
                    .filter((item): item is SavedRequest => Boolean(item))}
                  activeId={activeRequestId}
                  dirtyIds={dirtyRequestIds}
                  statusById={statusById}
                  automatedIds={automatedIds}
                  onSelect={(id) => {
                    const request = requests.find((item) => item.id === id);
                    if (request) void openRequest(request);
                  }}
                  onClose={(id) => void closeRequestTab(id)}
                  onNew={() => setRequestForm(true)}
                />
              )}
              <div className="relative min-h-0 flex-1">
                {openRequestIds.map((id) => {
                  const request = requests.find((item) => item.id === id);
                  if (!request) return null;
                  return (
                    <div
                      key={id}
                      className={id === activeRequestId ? "h-full" : "hidden"}
                    >
                      <RequestBuilder
                        userId={user.id}
                        workspace={activeWorkspace}
                        variables={activeEnvironment ? variables : []}
                        flowVariables={flowVariables}
                        automations={automations}
                        environments={environments}
                        activeEnvironmentId={activeEnvironmentId}
                        onVariableSaved={mergeVariable}
                        onEnvironmentCreated={(created) => {
                          setEnvironments((items) => [...items, created]);
                          if (!activeEnvironmentId)
                            setActiveEnvironmentId(created.id);
                        }}
                        request={request}
                        onSaved={(saved) =>
                          setRequests((items) =>
                            items.map((item) =>
                              item.id === saved.id ? saved : item,
                            ),
                          )
                        }
                        onDirtyChange={updateRequestDirty}
                        registerSave={registerRequestSave}
                        onExecuted={(result) => void recordExecution(result)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {activeWorkspace && !activeRequest && mainView === "request" ? (
            <EmptyRequest
              workspace={activeWorkspace}
              onCreate={() => setRequestForm(true)}
            />
          ) : null}
          {activeWorkspace &&
            !activeEnvironment &&
            mainView === "environment" && (
              <div className="fx-empty">
                <Layers size={24} />
                <h2>Crea tu primer entorno</h2>
                <button
                  className="fx-quiet-button"
                  onClick={() => setEnvironmentForm(true)}
                >
                  Crear entorno
                </button>
              </div>
            )}
          {activeWorkspace &&
          activeEnvironment &&
          mainView === "environment" ? (
            <EnvironmentView
              environment={activeEnvironment}
              variables={variables}
              onRename={() => setEnvironmentToRename(activeEnvironment)}
              onDelete={() => setPendingEnvironmentDelete(activeEnvironment)}
              onSaveVariable={saveVariable}
              onRemoveVariable={removeVariable}
            />
          ) : null}
          {activeWorkspace && mainView === "flows" ? (
            <FlowsView
              userId={user.id}
              workspace={activeWorkspace}
              requests={requests}
              variables={activeEnvironment ? variables : []}
              initialFlowId={introFlowId}
              lastBodyByRequestId={lastBodyByRequestId}
              onRequestUpdated={(saved) =>
                setRequests((items) =>
                  items.map((item) => (item.id === saved.id ? saved : item)),
                )
              }
              onFlowsChange={handleFlowsChange}
            />
          ) : null}
          {activeWorkspace && mainView === "automations" ? (
            <AutomationsView
              userId={user.id}
              api={automations}
              requests={requests}
              onOpenRequest={(request) => void openRequest(request)}
            />
          ) : null}
          {mainView === "settings" ? (
            <SettingsView
              currentVersion={systemVersion}
              userId={user.id}
              workspace={activeWorkspace}
              onWorkspaceImported={(result) => void workspaceImported(result)}
            />
          ) : null}
          {error ? (
            <p className="absolute bottom-5 rounded-lg border border-red-400/15 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              {error}
            </p>
          ) : null}
          {mainView === "history" && activeWorkspace ? (
            <HistoryView
              history={history}
              onRepeat={(entry) => {
                const request = requests.find(
                  (item) => item.id === entry.requestId,
                );
                if (request) void openRequest(request);
                else toast.info("La petición original ya no existe");
              }}
              onClear={async () => {
                try {
                  await requestHistoryApi.clear(user.id, activeWorkspace.id);
                  setHistory([]);
                } catch (cause) {
                  toast.error("No se pudo limpiar el historial", {
                    description: String(cause),
                  });
                }
              }}
            />
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        requests={requests}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        environments={environments}
        activeEnvironmentId={activeEnvironmentId}
        onOpenRequest={(request) => void openRequest(request)}
        onNewRequest={() => {
          setRequestFolderId(null);
          setRequestForm(true);
        }}
        onNewFolder={() => setFolderForm(null)}
        onOpenView={(view) => void leaveRequestView(view)}
        onOpenHistory={() => void leaveRequestView("history")}
        onChangeWorkspace={changeWorkspace}
        onChangeEnvironment={changeEnvironment}
      />
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
      {folderForm !== undefined ? (
        <NameDialog
          title={folderForm ? "Nueva subcarpeta" : "Nueva carpeta"}
          label="Nombre de la carpeta"
          onClose={() => setFolderForm(undefined)}
          onSubmit={createFolder}
        />
      ) : null}
      {folderToRename ? (
        <NameDialog
          title="Renombrar carpeta"
          label="Nuevo nombre"
          defaultValue={folderToRename.name}
          submitLabel="Guardar cambios"
          onClose={() => setFolderToRename(null)}
          onSubmit={renameFolder}
        />
      ) : null}
      {folderToDelete ? (
        <SimpleConfirm
          title="Eliminar carpeta"
          description={`Se eliminará ${folderToDelete.name} y sus subcarpetas. Las peticiones no se borrarán.`}
          onCancel={() => setFolderToDelete(null)}
          onConfirm={deleteFolder}
        />
      ) : null}
      {requestToMove ? (
        <MoveRequestDialog
          request={requestToMove}
          folders={folders}
          onClose={() => setRequestToMove(null)}
          onSubmit={moveRequest}
        />
      ) : null}
      <WhatsNewModal currentVersion={systemVersion} />
      <UpdateControl currentVersion={systemVersion} variant="headless" />
      <ThemeRuntime />
    </div>
  );
}

function SimpleConfirm({
  title,
  description,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151021] p-5">
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-rose-500/15 px-4 py-2 text-xs text-rose-200"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function MoveRequestDialog({
  request,
  folders,
  onClose,
  onSubmit,
}: {
  request: SavedRequest;
  folders: RequestFolder[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151021] p-5"
      >
        <h2 className="font-semibold text-white">Mover {request.name}</h2>
        <AppSelect
          name="folderId"
          defaultValue={request.folderId ?? ""}
          className="mt-4 h-10 w-full rounded-lg border border-white/10 bg-[#0d0818] px-3 text-sm"
        >
          <option value="">Sin carpeta</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </AppSelect>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground"
          >
            Cancelar
          </button>
          <button className="rounded-lg bg-violet-600 px-4 py-2 text-xs text-white">
            Mover
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionTitle({
  label,
  onAdd,
  onAddFolder,
}: {
  label: string;
  onAdd: () => void;
  onAddFolder: () => void;
}) {
  return (
    <div className="flex items-center justify-between pr-0.5 pl-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">
      <span>{label}</span>
      <div className="flex items-center">
        <button
          onClick={onAddFolder}
          title="Nueva carpeta"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-white"
          aria-label="Crear carpeta"
        >
          <FolderPlus size={13} strokeWidth={1.8} />
        </button>
        <button
          onClick={onAdd}
          title="Nueva petición"
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-white"
          aria-label={`Crear ${label}`}
        >
          <Plus size={13} />
        </button>
      </div>
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
    <label className="relative block min-w-0 shrink">
      <Layers
        size={13}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--flux-primary-text)]"
      />
      <AppSelect
        aria-label="Entorno activo"
        value={value}
        onValueChange={(value) => onChange(value)}
        className="h-7 w-[clamp(96px,14vw,170px)] cursor-pointer appearance-none truncate rounded-md bg-white/[0.05] pr-6 pl-7 text-xs text-zinc-200 ring-1 ring-white/[0.08] outline-none transition hover:bg-white/[0.1] hover:ring-white/[0.16] focus:ring-[var(--flux-primary-border)]"
      >
        <option value="">{placeholder}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </AppSelect>
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
      <Home
        size={13}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--flux-primary-text)]"
      />
      <AppSelect
        aria-label="Workspace activo"
        value={value}
        onValueChange={(value) => onChange(value)}
        className="h-7 w-[clamp(96px,14vw,170px)] cursor-pointer appearance-none truncate rounded-md bg-white/[0.05] pr-6 pl-7 text-xs font-medium text-white ring-1 ring-white/[0.08] outline-none transition hover:bg-white/[0.1] hover:ring-white/[0.16] focus:ring-[var(--flux-primary-border)]"
      >
        <option value="">Sin workspace</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </AppSelect>
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

function EnvironmentView({
  environment,
  variables,
  onRename,
  onDelete,
  onSaveVariable,
  onRemoveVariable,
}: {
  environment: Environment;
  variables: EnvironmentVariable[];
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
    <section className="fx-environment-view">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Variables de {environment.name}
        </span>
        <div className="flex gap-1">
          <button
            className="fx-icon-button"
            aria-label="Renombrar entorno"
            onClick={onRename}
          >
            <Pencil size={14} />
          </button>
          <button
            className="fx-icon-button"
            aria-label="Eliminar entorno"
            onClick={onDelete}
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
      <div className="fx-variable-table">
        <div className="grid grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.3fr)_76px] border-b border-white/[0.05] px-5 py-2 text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <span>Variable</span>
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
            key={`${environment.id}-${variable.id}`}
            variable={variable}
            onSave={onSave}
            onRemove={async () => setPendingDelete(variable)}
          />
        ))}
        {adding ? (
          <VariableRow
            key={environment.id}
            onSave={async (id, key, value) => {
              await onSave(id, key, value);
              setAdding(false);
            }}
            onRemove={async () => setAdding(false)}
          />
        ) : null}
      </div>
      <button
        className="fx-quiet-button mt-3"
        onClick={() => setAdding(true)}
        disabled={adding}
      >
        <Plus size={14} /> Añadir variable
      </button>
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
  const [showSecret, setShowSecret] = useState(false);
  const secret = /token|secret|password|api.?key/i.test(key);
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
      <div className="fx-variable-value">
        <input
          aria-label={`Valor de ${key || "nueva variable"}`}
          type={secret && !showSecret ? "password" : "text"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://api.example.com"
          className="h-9 min-w-0 rounded-lg border border-white/[0.07] bg-black/15 px-3 font-mono text-xs text-white outline-none focus:border-violet-400/40"
        />
        {secret && (
          <button
            className="fx-icon-button"
            type="button"
            aria-label={showSecret ? "Ocultar secreto" : "Mostrar secreto"}
            onClick={() => setShowSecret(!showSecret)}
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
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
          ¿Quieres eliminar <span className="text-white">{request.name}</span>{" "}
          de <span className="text-white">{workspaceName}</span>?
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
