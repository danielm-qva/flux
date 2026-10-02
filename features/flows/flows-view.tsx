"use client";

import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type ReactFlowInstance,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, LoaderCircle, Play, Plus, Save, Sparkles, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";

import type { SavedRequest } from "@/features/requests/request-client";
import type { Workspace } from "@/features/workspaces/workspace-client";
import {
  FlowActionsContext,
  FlowRequestsContext,
  RequestFlowNodeView,
  type RequestFlowNode,
} from "./flow-node";
import { FlowInspector } from "./flow-inspector";
import { FlowRunSummary } from "./flow-run-summary";
import {
  insertVariable,
  removeUsage,
  TARGET_LABELS,
  type InsertOptions,
  type InsertTarget,
  type VariableUsage,
} from "./insert-variable";
import { savedRequestApi } from "@/features/requests/request-client";
import { requestPlaceholders, suggestExtractions } from "./suggest-extractions";
import { FlowOnboarding } from "./flow-onboarding";
import {
  parseGraph,
  requestFlowApi,
  serializeGraph,
  type FlowAssertion,
  type FlowExtraction,
  type FlowGraph,
  type RequestFlow,
} from "./flow-client";
import {
  FlowCycleError,
  FlowInvalidNodeError,
  runFlow,
  type FlowRunResult,
  type NodeRun,
  type NodeStatus,
} from "./flow-runner";

const nodeTypes = { request: RequestFlowNodeView };
const FLOW_ONBOARDING_VERSION = "v1";

export function FlowsView({
  userId,
  workspace,
  requests,
  variables,
  initialFlowId,
  lastBodyByRequestId,
  onRequestUpdated,
  onFlowsChange,
}: {
  userId: string;
  workspace: Workspace;
  requests: SavedRequest[];
  variables: { key: string; value: string }[];
  initialFlowId?: string;
  lastBodyByRequestId?: Map<string, string>;
  onRequestUpdated?: (request: SavedRequest) => void;
  onFlowsChange?: (flows: RequestFlow[]) => void;
}) {
  const requestsById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests],
  );

  const [flows, setFlows] = useState<RequestFlow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [dialog, setDialog] = useState<null | "create" | "rename" | "delete">(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const activeFlow = flows.find((flow) => flow.id === flowId) ?? null;

  useEffect(() => {
    onFlowsChange?.(flows);
  }, [flows, onFlowsChange]);

  useEffect(() => {
    let active = true;
    requestFlowApi
      .list(userId, workspace.id)
      .then((items) => {
        if (!active) return;
        setFlows(items);
        setFlowId((current) =>
          initialFlowId && items.some((item) => item.id === initialFlowId)
            ? initialFlowId
            : current || items[0]?.id || "",
        );
      })
      .catch((cause) =>
        toast.error("No se pudieron cargar los flujos", { description: String(cause) }),
      );
    return () => {
      active = false;
    };
  }, [userId, workspace.id, initialFlowId]);

  useEffect(() => {
    const key = `flux:flow-onboarding:${FLOW_ONBOARDING_VERSION}:${userId}`;
    const openTimer = window.setTimeout(() => {
      if (window.localStorage.getItem(key) !== "complete") setOnboardingOpen(true);
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [userId]);

  const closeOnboarding = useCallback(() => {
    window.localStorage.setItem(
      `flux:flow-onboarding:${FLOW_ONBOARDING_VERSION}:${userId}`,
      "complete",
    );
    setOnboardingOpen(false);
  }, [userId]);

  async function createFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    try {
      const created = await requestFlowApi.create(userId, workspace.id, name);
      setFlows((items) => [...items, created]);
      setFlowId(created.id);
      setDialog(null);
    } catch (cause) {
      toast.error("No se pudo crear el flujo", { description: String(cause) });
    }
  }

  async function renameFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeFlow) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    try {
      const renamed = await requestFlowApi.rename(userId, activeFlow.id, name);
      setFlows((items) => items.map((item) => (item.id === renamed.id ? renamed : item)));
      setDialog(null);
    } catch (cause) {
      toast.error("No se pudo renombrar", { description: String(cause) });
    }
  }

  async function deleteFlow() {
    if (!activeFlow) return;
    try {
      await requestFlowApi.remove(userId, activeFlow.id);
      const remaining = flows.filter((item) => item.id !== activeFlow.id);
      setFlows(remaining);
      setFlowId(remaining[0]?.id ?? "");
      setDialog(null);
      toast.success("Flujo eliminado");
    } catch (cause) {
      toast.error("No se pudo eliminar", { description: String(cause) });
    }
  }

  const handleSaved = useCallback((saved: RequestFlow) => {
    setFlows((items) => items.map((item) => (item.id === saved.id ? saved : item)));
  }, []);

  return (
    <FlowRequestsContext.Provider value={requestsById}>
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl bg-[var(--flux-panel-2)] ring-1 ring-[var(--flux-line)]">
        <div className="flex h-11 shrink-0 items-center gap-2 px-3">
          <Workflow size={15} className="text-violet-400" />
          <select
            value={flowId}
            onChange={(event) => setFlowId(event.target.value)}
            className="h-8 w-[200px] rounded-md bg-[var(--flux-well)] px-2 text-xs text-white ring-1 ring-[var(--flux-line)] outline-none focus:ring-[var(--flux-primary-border)]"
          >
            <option value="">Sin flujo</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDialog("create")}
            className="grid size-8 place-items-center rounded-lg text-violet-300 hover:bg-violet-400/10"
            aria-label="Crear flujo"
          >
            <Plus size={14} />
          </button>
          {activeFlow ? (
            <>
              <button
                type="button"
                onClick={() => setDialog("rename")}
                className="h-8 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-white"
              >
                Renombrar
              </button>
              <button
                type="button"
                onClick={() => setDialog("delete")}
                aria-label="Eliminar flujo"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-rose-400/10 hover:text-rose-300"
              >
                <Trash2 size={14} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
          >
            <CircleHelp size={13} /> Guía
          </button>
        </div>

        {activeFlow ? (
          <FlowEditor
            key={activeFlow.id}
            userId={userId}
            requests={requests}
            requestsById={requestsById}
            variables={variables}
            flow={activeFlow}
            intro={activeFlow.id === initialFlowId}
            lastBodyByRequestId={lastBodyByRequestId}
            onRequestUpdated={onRequestUpdated}
            onSaved={handleSaved}
          />
        ) : (
          <EmptyFlows onCreate={() => setDialog("create")} />
        )}
      </div>

      {dialog === "create" ? (
        <FlowNameDialog title="Nuevo flujo" onClose={() => setDialog(null)} onSubmit={createFlow} />
      ) : null}
      {dialog === "rename" && activeFlow ? (
        <FlowNameDialog
          title="Renombrar flujo"
          defaultValue={activeFlow.name}
          submitLabel="Guardar"
          onClose={() => setDialog(null)}
          onSubmit={renameFlow}
        />
      ) : null}
      {dialog === "delete" && activeFlow ? (
        <ConfirmDialog
          title="Eliminar flujo"
          description={`Se eliminará "${activeFlow.name}" y su lienzo. Las peticiones no se borran.`}
          onCancel={() => setDialog(null)}
          onConfirm={deleteFlow}
        />
      ) : null}
      <FlowOnboarding open={onboardingOpen} onClose={closeOnboarding} />
    </FlowRequestsContext.Provider>
  );
}

function FlowEditor({
  userId,
  requests,
  requestsById,
  variables,
  flow,
  intro,
  lastBodyByRequestId,
  onRequestUpdated,
  onSaved,
}: {
  userId: string;
  requests: SavedRequest[];
  requestsById: Map<string, SavedRequest>;
  variables: { key: string; value: string }[];
  flow: RequestFlow;
  intro: boolean;
  lastBodyByRequestId?: Map<string, string>;
  onRequestUpdated?: (request: SavedRequest) => void;
  onSaved: (flow: RequestFlow) => void;
}) {
  const initialGraph = useMemo(() => parseGraph(flow.graphJson), [flow.graphJson]);
  const [nodes, setNodes, onNodesChange] = useNodesState<RequestFlowNode>(
    graphToNodes(initialGraph, intro),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: intro,
    })),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runsByNode, setRunsByNode] = useState<Record<string, NodeRun>>({});
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<RequestFlowNode, Edge> | null>(null);
  const [lastRun, setLastRun] = useState<(FlowRunResult & { totalMs: number; partial: boolean }) | null>(null);

  const markDirty = useCallback(() => setDirty(true), []);

  useEffect(() => {
    if (!intro) return;
    const timer = window.setTimeout(() => {
      setEdges((current) => current.map((edge) => ({ ...edge, animated: false })));
      setNodes((current) =>
        current.map((node) => ({ ...node, data: { ...node.data, introDelay: undefined } })),
      );
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [intro, setEdges, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<RequestFlowNode>[]) => {
      onNodesChange(changes);
      if (changes.some((change) => change.type === "position" || change.type === "remove")) {
        markDirty();
      }
    },
    [onNodesChange, markDirty],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      if (changes.some((change) => change.type === "remove")) markDirty();
    },
    [onEdgesChange, markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge(connection, current));
      markDirty();
    },
    [setEdges, markDirty],
  );

  const persist = useCallback(
    async (explicit: boolean) => {
      setSaving(true);
      try {
        const graph = canvasToGraph(nodes, edges);
        const saved = await requestFlowApi.update(userId, flow.id, serializeGraph(graph));
        onSaved(saved);
        setDirty(false);
        if (explicit) toast.success("Flujo guardado");
      } catch (cause) {
        toast.error("No se pudo guardar el flujo", { description: String(cause) });
      } finally {
        setSaving(false);
      }
    },
    [nodes, edges, userId, flow.id, onSaved],
  );

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void persist(false), 800);
    return () => window.clearTimeout(timer);
  }, [dirty, persist]);

  const setNodeStatus = useCallback(
    (nodeId: string, status: NodeStatus) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, status } } : node,
        ),
      );
    },
    [setNodes],
  );

  async function run(untilNodeId?: string) {
    const graph = canvasToGraph(nodes, edges);
    if (!graph.nodes.length) {
      toast.warning("El flujo no tiene nodos");
      return;
    }
    if (disconnectedIds.size && !untilNodeId) {
      const names = nodes
        .filter((node) => disconnectedIds.has(node.id))
        .map((node) => (node.data.requestId ? requestsById.get(node.data.requestId)?.name : undefined) ?? "Sin petición");
      toast.warning(`${names.length} paso${names.length > 1 ? "s" : ""} sin conectar`, {
        description: `${names.join(", ")} se ejecutará${names.length > 1 ? "n" : ""} igual, pero sin recibir datos de otros pasos. Conéctalos o elimínalos.`,
      });
    }
    setRunning(true);
    setRunsByNode({});
    setLastRun(null);
    const startedAt = performance.now();
    setNodes((current) =>
      current.map((node) => ({ ...node, data: { ...node.data, status: "idle" as NodeStatus } })),
    );
    try {
      const result = await runFlow(graph, requestsById, variables, setNodeStatus, { untilNodeId });
      setRunsByNode(Object.fromEntries(result.runs.map((item) => [item.nodeId, item])));
      setLastRun({ ...result, totalMs: performance.now() - startedAt, partial: Boolean(untilNodeId) });
      if (result.stoppedAt) {
        toast.error("El flujo se detuvo por un error", {
          description: "Revisa el nodo marcado en rojo.",
        });
        setSelectedNodeId(result.stoppedAt);
      } else {
        toast.success("Flujo ejecutado", {
          description: `${result.runs.length} peticiones · ${result.vars.length} variables extraídas.`,
        });
      }
    } catch (cause) {
      if (cause instanceof FlowCycleError || cause instanceof FlowInvalidNodeError) {
        toast.error("No se puede ejecutar", { description: cause.message });
        if (cause instanceof FlowInvalidNodeError) setSelectedNodeId(cause.nodeId);
      } else {
        toast.error("Error al ejecutar el flujo", { description: String(cause) });
      }
    } finally {
      setRunning(false);
    }
  }

  function suggest() {
    const graph = canvasToGraph(nodes, edges);
    const result = suggestExtractions(
      graph,
      requestsById,
      variables.map((item) => item.key),
      (requestId) => {
        const nodeId = graph.nodes.find((node) => node.requestId === requestId)?.id;
        return (nodeId && runsByNode[nodeId]?.response?.body) || lastBodyByRequestId?.get(requestId);
      },
    );
    if (!result.added.length) {
      toast.info(
        result.unresolved.length
          ? `No encontramos de dónde sale ${result.unresolved.map((name) => `{{${name}}}`).join(", ")}`
          : "No hay variables por encadenar",
        {
          description: result.unresolved.length
            ? "Ejecuta las peticiones anteriores para que Flux pueda buscarlas en la respuesta."
            : "Las peticiones no usan {{variables}} que falten en el environment.",
        },
      );
      return;
    }
    const byId = new Map(result.graph.nodes.map((node) => [node.id, node.extractions]));
    setNodes((current) =>
      current.map((node) => ({ ...node, data: { ...node.data, extractions: byId.get(node.id) ?? node.data.extractions } })),
    );
    markDirty();
    toast.success(`${result.added.length} variable${result.added.length > 1 ? "s" : ""} encadenada${result.added.length > 1 ? "s" : ""}`, {
      description: result.added.map((item) => `${item.variable} ← ${item.from}`).join(" · "),
    });
  }

  const disconnectedIds = useMemo(() => {
    if (nodes.length < 2) return new Set<string>();
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    return new Set(nodes.filter((node) => !linked.has(node.id)).map((node) => node.id));
  }, [nodes, edges]);

  const displayNodes = useMemo(
    () => nodes.map((node) => (disconnectedIds.has(node.id) ? { ...node, data: { ...node.data, disconnected: true } } : node)),
    [nodes, disconnectedIds],
  );

  const labeledEdges = useMemo(
    () =>
      edges.map((edge) => {
        const source = nodes.find((node) => node.id === edge.source);
        const target = nodes.find((node) => node.id === edge.target);
        const targetRequest = target?.data.requestId ? requestsById.get(target.data.requestId) : undefined;
        const used = targetRequest ? requestPlaceholders(targetRequest).map((name) => name.toLowerCase()) : [];
        const names = (source?.data.extractions ?? [])
          .map((item) => item.variable.trim())
          .filter((name) => name && used.includes(name.toLowerCase()));
        return names.length
          ? {
              ...edge,
              label: names.join(", "),
              labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--flux-primary-text)" },
              labelBgStyle: { fill: "var(--flux-panel)" },
              labelBgPadding: [6, 3] as [number, number],
              labelBgBorderRadius: 6,
            }
          : edge;
      }),
    [edges, nodes, requestsById],
  );

  function removeNode(nodeId: string) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setRunsByNode((current) => {
      const { [nodeId]: _removed, ...rest } = current;
      void _removed;
      return rest;
    });
    setLastRun(null);
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    markDirty();
  }

  function addNode(requestId: string) {
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // El nodo nuevo aparece en el centro de lo que el usuario está viendo (respeta zoom y desplazamiento).
    const rect = canvasRef.current?.getBoundingClientRect();
    let position = { x: 80 + nodes.length * 36, y: 80 + nodes.length * 36 };
    if (flowRef.current && rect) {
      const center = flowRef.current.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      position = { x: center.x - 100, y: center.y - 25 };
      while (nodes.some((node) => Math.abs(node.position.x - position.x) < 40 && Math.abs(node.position.y - position.y) < 40)) {
        position = { x: position.x + 36, y: position.y + 36 };
      }
    }
    setNodes((current) => [
      ...current,
      {
        id,
        type: "request",
        position,
        data: { requestId, extractions: [], assertions: [], status: "idle" as NodeStatus },
      },
    ]);
    setAddNodeOpen(false);
    setSelectedNodeId(id);
    markDirty();
  }

  function updateSelectedExtractions(extractions: FlowExtraction[]) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, extractions } } : node,
      ),
    );
    markDirty();
  }

  const incoming = useMemo(() => {
    if (!selectedNodeId) return [];
    const parents = new Map<string, string[]>();
    for (const edge of edges) parents.set(edge.target, [...(parents.get(edge.target) ?? []), edge.source]);
    const seen = new Set<string>();
    const stack = [selectedNodeId];
    while (stack.length) {
      for (const parent of parents.get(stack.pop()!) ?? []) {
        if (!seen.has(parent)) {
          seen.add(parent);
          stack.push(parent);
        }
      }
    }
    const result: { name: string; from: string }[] = [];
    for (const node of nodes) {
      if (!seen.has(node.id)) continue;
      const from = node.data.requestId ? requestsById.get(node.data.requestId)?.name ?? "paso anterior" : "paso anterior";
      for (const extraction of node.data.extractions) {
        const name = extraction.variable.trim();
        if (name && !result.some((item) => item.name.toLowerCase() === name.toLowerCase())) result.push({ name, from });
      }
    }
    return result;
  }, [selectedNodeId, edges, nodes, requestsById]);

  function selectedRequest() {
    const nodeRequestId = nodes.find((node) => node.id === selectedNodeId)?.data.requestId;
    return nodeRequestId ? requestsById.get(nodeRequestId) : undefined;
  }

  async function saveRequestPatch(request: SavedRequest, patch: ReturnType<typeof removeUsage>, successTitle: string, description: string) {
    try {
      const saved = await savedRequestApi.update(userId, { id: request.id, name: request.name, method: request.method, ...patch });
      onRequestUpdated?.(saved);
      toast.success(successTitle, { description });
    } catch (cause) {
      toast.error("No se pudo actualizar la petición", { description: String(cause) });
    }
  }

  async function placeVariable(name: string, target: InsertTarget, options: InsertOptions) {
    const request = selectedRequest();
    if (!request) return;
    const patch = insertVariable(request, name, target, options);
    if (!patch) {
      toast.info("Este tipo de body se edita desde la petición", {
        description: `Abre «${request.name}» y escribe {{${name}}} donde lo necesites.`,
      });
      return;
    }
    await saveRequestPatch(request, patch, `{{${name}}} añadido`, `${TARGET_LABELS[target]} de «${request.name}».`);
  }

  async function dropVariable(name: string, usage: VariableUsage) {
    const request = selectedRequest();
    if (!request) return;
    await saveRequestPatch(request, removeUsage(request, name, usage.id), `{{${name}}} quitado`, `${usage.place} · ${usage.detail} de «${request.name}».`);
  }

  async function moveVariable(name: string, usage: VariableUsage, target: InsertTarget, options: InsertOptions) {
    const request = selectedRequest();
    if (!request) return;
    const without = { ...request, ...removeUsage(request, name, usage.id) };
    const patch = insertVariable(without, name, target, options);
    if (!patch) {
      toast.info("Este tipo de body se edita desde la petición", {
        description: `Abre «${request.name}» y escribe {{${name}}} donde lo necesites.`,
      });
      return;
    }
    await saveRequestPatch(request, patch, `{{${name}}} movido`, `De ${usage.place} a ${TARGET_LABELS[target].toLowerCase()} en «${request.name}».`);
  }

  function updateSelectedAssertions(assertions: FlowAssertion[]) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, assertions } } : node,
      ),
    );
    markDirty();
  }

  function updateSelectedRequest(requestId: string) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, requestId: requestId || null } }
          : node,
      ),
    );
    markDirty();
  }

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <FlowActionsContext.Provider value={{ runUntil: (nodeId) => void run(nodeId), removeNode, running }}>
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        {dirty ? <span className="text-[10px] text-amber-300/80">Sin guardar</span> : null}
        {disconnectedIds.size ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300 ring-1 ring-amber-400/20"
            title="Los pasos sin conexión se ejecutan igual, pero no reciben datos de otros pasos"
          >
            ⚠ {disconnectedIds.size} paso{disconnectedIds.size > 1 ? "s" : ""} sin conectar
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddNodeOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
          >
            <Plus size={13} /> Añadir nodo
          </button>
          <button
            type="button"
            onClick={suggest}
            title="Detecta las {{variables}} que faltan y las busca en las respuestas anteriores"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
          >
            <Sparkles size={13} /> Sugerir variables
          </button>
          {dirty ? (
          <button
            type="button"
            onClick={() => void persist(true)}
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] disabled:opacity-60"
          >
            {saving ? <LoaderCircle size={12} className="animate-spin" /> : <Save size={12} />}
            Guardar
          </button>
          ) : null}
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-65"
          >
            {running ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />}
            Ejecutar
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={canvasRef} className="min-h-0 flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={labeledEdges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onInit={(instance) => {
              flowRef.current = instance;
            }}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            fitViewOptions={{ padding: 0.35, maxZoom: 0.82 }}
            minZoom={0.35}
            proOptions={{ hideAttribution: true }}
            className="flow-canvas bg-[var(--flux-bg)]"
          >
            <Background color="var(--flux-line)" gap={22} size={1.4} />
            <Controls className="flow-controls" />
          </ReactFlow>
          </div>
          {lastRun ? (
            <FlowRunSummary
              rows={lastRun.runs.map((item) => {
                const node = nodes.find((candidate) => candidate.id === item.nodeId);
                const request = node?.data.requestId ? requestsById.get(node.data.requestId) : undefined;
                return { run: item, method: request?.method ?? "", name: request?.name ?? "Petición" };
              })}
              stoppedAt={lastRun.stoppedAt}
              partial={lastRun.partial}
              totalMs={lastRun.totalMs}
              variableCount={lastRun.vars.length}
              onSelect={setSelectedNodeId}
              onClose={() => setLastRun(null)}
            />
          ) : null}
        </div>
        {selectedNode ? (
          <FlowInspector
            node={{
              id: selectedNode.id,
              requestId: selectedNode.data.requestId,
              position: selectedNode.position,
              extractions: selectedNode.data.extractions,
              assertions: selectedNode.data.assertions,
            }}
            request={
              selectedNode.data.requestId
                ? requestsById.get(selectedNode.data.requestId) ?? null
                : null
            }
            requests={requests}
            run={runsByNode[selectedNode.id]}
            fallbackBody={
              selectedNode.data.requestId ? lastBodyByRequestId?.get(selectedNode.data.requestId) : undefined
            }
            running={running}
            incoming={incoming}
            onUseVariable={(name, target, options) => void placeVariable(name, target, options)}
            onRemoveUsage={(name, usage) => void dropVariable(name, usage)}
            onMoveUsage={(name, usage, target, options) => void moveVariable(name, usage, target, options)}
            onChangeRequest={updateSelectedRequest}
            onChangeExtractions={updateSelectedExtractions}
            onChangeAssertions={updateSelectedAssertions}
            onRunUntil={() => void run(selectedNode.id)}
            onDelete={() => removeNode(selectedNode.id)}
            onClose={() => setSelectedNodeId(null)}
          />
        ) : null}
      </div>

      {addNodeOpen ? (
        <AddNodeDialog
          requests={requests}
          onClose={() => setAddNodeOpen(false)}
          onPick={addNode}
        />
      ) : null}
    </FlowActionsContext.Provider>
  );
}

function graphToNodes(graph: FlowGraph, intro = false): RequestFlowNode[] {
  return graph.nodes.map((node, index) => ({
    id: node.id,
    type: "request",
    position: node.position,
    data: {
      requestId: node.requestId,
      extractions: node.extractions ?? [],
      assertions: node.assertions ?? [],
      status: "idle" as NodeStatus,
      introDelay: intro ? index * 220 : undefined,
    },
  }));
}

function canvasToGraph(nodes: RequestFlowNode[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      requestId: node.data.requestId,
      position: node.position,
      extractions: node.data.extractions,
      assertions: node.data.assertions,
    })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
  };
}

function EmptyFlows({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/10 text-violet-300">
          <Workflow size={24} />
        </div>
        <h2 className="mt-5 font-sans text-xl font-semibold text-white">Crea un flujo</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Encadena peticiones en un lienzo y pasa datos de una respuesta a la
          siguiente petición.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500"
        >
          <Plus size={15} /> Nuevo flujo
        </button>
      </div>
    </div>
  );
}

function FlowNameDialog({
  title,
  defaultValue = "",
  submitLabel = "Crear",
  onClose,
  onSubmit,
}: {
  title: string;
  defaultValue?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl"
      >
        <h2 className="font-sans text-xl font-semibold text-white">{title}</h2>
        <label className="mt-5 block text-xs text-muted-foreground">
          Nombre del flujo
          <input
            name="name"
            defaultValue={defaultValue}
            required
            minLength={1}
            maxLength={100}
            autoFocus
            className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-violet-400/50"
          />
        </label>
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

function AddNodeDialog({
  requests,
  onClose,
  onPick,
}: {
  requests: SavedRequest[];
  onClose: () => void;
  onPick: (requestId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl">
        <h2 className="font-sans text-lg font-semibold text-white">Añadir nodo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Elige la petición guardada que ejecutará este nodo.
        </p>
        <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {requests.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No hay peticiones guardadas en este workspace.
            </p>
          ) : (
            requests.map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => onPick(request.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-violet-400/10 hover:text-white"
              >
                <span className="w-10 shrink-0 font-mono text-[9px] font-bold text-violet-300">
                  {request.method}
                </span>
                <span className="truncate">{request.name}</span>
              </button>
            ))
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
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
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-xs text-muted-foreground">
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
