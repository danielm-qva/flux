import {
  executeHttpRequest,
  type HttpResponse,
  type SavedRequest,
} from "@/features/requests/request-client";
import {
  prepareHttpRequest,
  savedRequestToConfig,
} from "@/features/requests/prepare-http-request";
import { getByPath } from "./get-by-path";
import type { FlowAssertion, FlowGraph, FlowNode } from "./flow-client";

export type FlowVar = { key: string; value: string };
export type NodeStatus = "idle" | "running" | "success" | "error";

export type AssertionResult = { id: string; label: string; passed: boolean; detail: string };

export type NodeRun = {
  nodeId: string;
  status: "success" | "error";
  assertions: AssertionResult[];
  response?: HttpResponse;
  error?: string;
  /** `path` guarda de qué extracción salió el valor, para no confundirlo si luego se edita o se recrea. */
  extracted: (FlowVar & { path?: string })[];
  warnings: string[];
};

export type FlowRunResult = {
  runs: NodeRun[];
  vars: FlowVar[];
  stoppedAt: string | null;
};

export class FlowCycleError extends Error {
  constructor() {
    super("El flujo tiene un ciclo; no se puede ejecutar en orden.");
    this.name = "FlowCycleError";
  }
}

export class FlowInvalidNodeError extends Error {
  constructor(
    public nodeId: string,
    message: string,
  ) {
    super(message);
    this.name = "FlowInvalidNodeError";
  }
}

/**
 * Orders the nodes so every edge goes from an earlier node to a later one
 * (Kahn's algorithm). Edges pointing at unknown nodes are ignored. Throws
 * `FlowCycleError` when the graph cannot be linearized.
 */
export function topologicalOrder(graph: FlowGraph): FlowNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));

  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  // Preserve node insertion order among ready nodes for deterministic runs.
  const queue = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((n) => n.id);
  const ordered: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(byId.get(id)!);
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }

  if (ordered.length !== graph.nodes.length) throw new FlowCycleError();
  return ordered;
}

/**
 * Executes every node in topological order, accumulating variables extracted
 * from each response and feeding them (over the environment variables) into
 * later requests. Stops at the first failed request (network error or HTTP status >= 400).
 */
export async function runFlow(
  graph: FlowGraph,
  requestsById: Map<string, SavedRequest>,
  envVariables: FlowVar[],
  onNodeStatus?: (nodeId: string, status: NodeStatus) => void,
  options: { untilNodeId?: string } = {},
): Promise<FlowRunResult> {
  let order = topologicalOrder(graph);
  if (options.untilNodeId) {
    const needed = ancestorsOf(graph, options.untilNodeId);
    needed.add(options.untilNodeId);
    order = order.filter((node) => needed.has(node.id));
  }

  for (const node of order) {
    if (!node.requestId || !requestsById.has(node.requestId)) {
      throw new FlowInvalidNodeError(
        node.id,
        "Un nodo no referencia una petición válida.",
      );
    }
  }

  const flowVars: FlowVar[] = [];
  const runs: NodeRun[] = [];

  for (const node of order) {
    onNodeStatus?.(node.id, "running");
    const saved = requestsById.get(node.requestId!)!;
    const prepared = prepareHttpRequest(savedRequestToConfig(saved), [
      ...envVariables,
      ...flowVars,
    ]);

    try {
      const response = await executeHttpRequest({ ...prepared, timeoutMs: 30_000 });
      const extracted: (FlowVar & { path?: string })[] = [];
      const warnings: string[] = [];
      const parsedBody = safeJson(response.body);

      for (const extraction of node.extractions) {
        const variable = extraction.variable.trim();
        if (!variable || !extraction.path.trim()) continue;
        const value = getByPath(parsedBody, extraction.path);
        if (value === undefined) {
          warnings.push(`Sin coincidencia para "${extraction.path}".`);
          continue;
        }
        const flowVar = { key: variable, value: stringifyValue(value) };
        extracted.push({ ...flowVar, path: extraction.path.trim() });
        flowVars.push(flowVar);
      }

      const assertions = evaluateAssertions(node.assertions ?? [], response, parsedBody);
      const failed = assertions.filter((item) => !item.passed);
      const expectsStatus = (node.assertions ?? []).some((item) => item.kind === "status");
      const httpFailure = response.status >= 400 && !expectsStatus;

      if (httpFailure || failed.length) {
        runs.push({
          nodeId: node.id,
          status: "error",
          response,
          assertions,
          error: httpFailure
            ? `La petición respondió ${response.status} ${response.statusText}`.trim()
            : `${failed.length} aserción${failed.length > 1 ? "es" : ""} no se cumpli${failed.length > 1 ? "eron" : "ó"}`,
          extracted,
          warnings,
        });
        onNodeStatus?.(node.id, "error");
        return { runs, vars: flowVars, stoppedAt: node.id };
      }

      runs.push({ nodeId: node.id, status: "success", response, assertions, extracted, warnings });
      onNodeStatus?.(node.id, "success");
    } catch (cause) {
      runs.push({
        nodeId: node.id,
        status: "error",
        assertions: [],
        error: String(cause),
        extracted: [],
        warnings: [],
      });
      onNodeStatus?.(node.id, "error");
      return { runs, vars: flowVars, stoppedAt: node.id };
    }
  }

  return { runs, vars: flowVars, stoppedAt: null };
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ancestorsOf(graph: FlowGraph, nodeId: string): Set<string> {
  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) parents.set(edge.target, [...(parents.get(edge.target) ?? []), edge.source]);
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    for (const parent of parents.get(stack.pop()!) ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        stack.push(parent);
      }
    }
  }
  return seen;
}

export function describeAssertion(assertion: FlowAssertion): string {
  switch (assertion.kind) {
    case "status":
      return `status = ${assertion.value || "?"}`;
    case "exists":
      return `${assertion.path || "?"} existe`;
    case "equals":
      return `${assertion.path || "?"} = ${assertion.value}`;
    case "time":
      return `tiempo ≤ ${assertion.value || "?"} ms`;
  }
}

function evaluateAssertions(
  assertions: FlowAssertion[],
  response: HttpResponse,
  parsedBody: unknown,
): AssertionResult[] {
  return assertions.map((assertion) => {
    const label = describeAssertion(assertion);
    let passed = false;
    let detail = "";
    if (assertion.kind === "status") {
      passed = response.status === Number(assertion.value);
      detail = `respondió ${response.status}`;
    } else if (assertion.kind === "time") {
      passed = response.durationMs <= Number(assertion.value);
      detail = `tardó ${response.durationMs} ms`;
    } else {
      const value = getByPath(parsedBody, assertion.path);
      if (assertion.kind === "exists") {
        passed = value !== undefined && value !== null;
        detail = passed ? "encontrado" : "no encontrado";
      } else {
        const actual = value === undefined ? undefined : stringifyValue(value);
        passed = actual === assertion.value;
        detail = actual === undefined ? "no encontrado" : `valor: ${actual}`;
      }
    }
    return { id: assertion.id, label, passed, detail };
  });
}
