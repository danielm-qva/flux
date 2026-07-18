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

export type FlowNode = {
  id: string;
  requestId: string | null;
  position: { x: number; y: number };
  extractions: FlowExtraction[];
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
