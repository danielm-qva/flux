import { invoke } from "@tauri-apps/api/core";

export type RequestFlow = {
  id: string;
  workspaceId: string;
  name: string;
  graphJson: string;
  createdAt: string;
  updatedAt: string;
};

export type FlowExtraction = { id: string; path: string; variable: string };

export type FlowAssertionKind = "status" | "exists" | "equals" | "time";

/** `status`: código esperado · `exists`/`equals`: ruta (+ valor) en el JSON · `time`: tope en ms. */
export type FlowAssertion = { id: string; kind: FlowAssertionKind; path: string; value: string };

export type FlowNode = {
  id: string;
  requestId: string | null;
  position: { x: number; y: number };
  extractions: FlowExtraction[];
  assertions?: FlowAssertion[];
};

export type FlowEdge = { id: string; source: string; target: string };

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

export const requestFlowApi = {
  list: (userId: string, workspaceId: string) =>
    invoke<RequestFlow[]>("list_request_flows", { input: { userId, workspaceId } }),
  create: (userId: string, workspaceId: string, name: string) =>
    invoke<RequestFlow>("create_request_flow", { input: { userId, workspaceId, name } }),
  rename: (userId: string, flowId: string, name: string) =>
    invoke<RequestFlow>("rename_request_flow", { input: { userId, flowId, name } }),
  update: (userId: string, flowId: string, graphJson: string) =>
    invoke<RequestFlow>("update_request_flow", { input: { userId, flowId, graphJson } }),
  remove: (userId: string, flowId: string) =>
    invoke<void>("delete_request_flow", { input: { userId, flowId } }),
};

/** Encadena las peticiones en orden: cada una alimenta a la siguiente. */
export function buildChainGraph(requestIds: string[]): FlowGraph {
  const nodes: FlowNode[] = requestIds.map((requestId, index) => ({
    id: `node-${index + 1}`,
    requestId,
    position: { x: 40 + index * 300, y: 120 + (index % 2) * 60 },
    extractions: [],
  }));
  const edges: FlowEdge[] = nodes.slice(1).map((node, index) => ({
    id: `edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
  }));
  return { nodes, edges };
}

export async function createFlowFromRequests(
  userId: string,
  workspaceId: string,
  name: string,
  requestIds: string[],
  transform: (graph: FlowGraph) => FlowGraph = (graph) => graph,
): Promise<RequestFlow> {
  const created = await requestFlowApi.create(userId, workspaceId, name);
  return requestFlowApi.update(userId, created.id, serializeGraph(transform(buildChainGraph(requestIds))));
}

export function parseGraph(graphJson: string): FlowGraph {
  try {
    const parsed = JSON.parse(graphJson) as Partial<FlowGraph>;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export function serializeGraph(graph: FlowGraph): string {
  return JSON.stringify(graph);
}
