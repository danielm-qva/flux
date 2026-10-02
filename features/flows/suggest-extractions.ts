import type { SavedRequest } from "@/features/requests/request-client";
import type { FlowExtraction, FlowGraph } from "./flow-client";
import { topologicalOrder } from "./flow-runner";

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Nombres de variable `{{VAR}}` que usa una petición en cualquiera de sus campos. */
export function requestPlaceholders(request: SavedRequest): string[] {
  const source = [request.url, request.paramsJson, request.headersJson, request.authJson, request.body].join("\n");
  return [...new Set([...source.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Busca en un JSON la ruta cuyo valor mejor encaja con el nombre de la variable. */
export function findPathForVariable(body: string | undefined, variable: string): string | null {
  if (!body) return null;
  let root: unknown;
  try {
    root = JSON.parse(body);
  } catch {
    return null;
  }
  const wanted = normalize(variable);
  let best: { path: string; score: number; depth: number } | null = null;

  const visit = (value: unknown, path: string, depth: number, parentKey: string) => {
    if (depth > 4 || value === null) return;
    if (Array.isArray(value)) {
      if (value.length) visit(value[0], `${path}[0]`, depth + 1, parentKey);
      return;
    }
    if (typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (child !== null && typeof child !== "object") {
        const normalizedKey = normalize(key);
        let score = 0;
        if (normalizedKey === wanted) score = 3;
        else if (normalizedKey === "id" && wanted.endsWith("id")) score = normalize(parentKey) && wanted.startsWith(normalize(parentKey)) ? 3 : 2;
        else if (wanted.includes("token") && normalizedKey.includes("token")) score = 2;
        if (score && (!best || score > best.score || (score === best.score && depth < best.depth))) {
          best = { path: childPath, score, depth };
        }
      }
      visit(child, childPath, depth + 1, key);
    }
  };
  visit(root, "$", 0, "");
  return (best as { path: string } | null)?.path ?? null;
}

/** Sin respuesta que mirar, se adivina una ruta típica según el nombre. */
export function guessPath(variable: string): string {
  const name = normalize(variable);
  if (name.endsWith("id")) return "$.id";
  if (name.includes("token")) return "$.token";
  return `$.${variable}`;
}

export type SuggestionResult = {
  graph: FlowGraph;
  added: { variable: string; path: string; from: string; to: string }[];
  unresolved: string[];
};

/**
 * Las peticiones de abajo ya piden `{{variables}}` que no están en el environment:
 * se buscan en la respuesta de las peticiones anteriores y se añaden como extracciones.
 */
export function suggestExtractions(
  graph: FlowGraph,
  requestsById: Map<string, SavedRequest>,
  envKeys: string[],
  bodyFor: (requestId: string) => string | undefined,
): SuggestionResult {
  const env = new Set(envKeys.map((key) => key.toUpperCase()));
  let order;
  try {
    order = topologicalOrder(graph);
  } catch {
    return { graph, added: [], unresolved: [] };
  }

  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) parents.set(edge.target, [...(parents.get(edge.target) ?? []), edge.source]);
  const ancestors = (id: string, seen = new Set<string>()): string[] => {
    for (const parent of parents.get(id) ?? []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        ancestors(parent, seen);
      }
    }
    return [...seen];
  };

  const extractions = new Map(graph.nodes.map((node) => [node.id, [...(node.extractions ?? [])] as FlowExtraction[]]));
  const position = new Map(order.map((node, index) => [node.id, index]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const added: SuggestionResult["added"] = [];
  const unresolved: string[] = [];

  for (const node of order) {
    const request = node.requestId ? requestsById.get(node.requestId) : undefined;
    if (!request) continue;
    const upstream = ancestors(node.id).sort((a, b) => (position.get(b) ?? 0) - (position.get(a) ?? 0));
    for (const variable of requestPlaceholders(request)) {
      if (env.has(variable.toUpperCase())) continue;
      const alreadyProvided = upstream.some((id) =>
        extractions.get(id)?.some((item) => item.variable.toLowerCase() === variable.toLowerCase()),
      );
      if (alreadyProvided) continue;

      let match: { source: string; path: string } | null = null;
      for (const sourceId of upstream) {
        const sourceRequest = nodeById.get(sourceId)?.requestId;
        const path = sourceRequest ? findPathForVariable(bodyFor(sourceRequest), variable) : null;
        if (path) {
          match = { source: sourceId, path };
          break;
        }
      }
      if (!match && upstream.length) {
        const nearest = upstream[0];
        const sourceRequest = nodeById.get(nearest)?.requestId;
        if (sourceRequest && !bodyFor(sourceRequest)) match = { source: nearest, path: guessPath(variable) };
      }
      if (!match) {
        unresolved.push(variable);
        continue;
      }
      extractions.get(match.source)!.push({
        id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: match.path,
        variable,
      });
      added.push({
        variable,
        path: match.path,
        from: requestsById.get(nodeById.get(match.source)?.requestId ?? "")?.name ?? "",
        to: request.name,
      });
    }
  }

  return {
    graph: { ...graph, nodes: graph.nodes.map((node) => ({ ...node, extractions: extractions.get(node.id) ?? node.extractions })) },
    added,
    unresolved: [...new Set(unresolved)],
  };
}
