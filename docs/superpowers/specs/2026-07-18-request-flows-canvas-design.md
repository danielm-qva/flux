# Request Flows (Canvas) — Design Spec

**Date:** 2026-07-18
**Status:** Approved — ready to implement
**Area:** `src-tauri` (new `flow.rs`), `features/flows` (new), `features/requests`, `features/workspaces`

## Problem

Flux runs one saved request at a time. Real API work is multi-step: create a product →
give it stock → assign it to a warehouse, where each step needs a value produced by the
previous one (e.g. the new product `id`). Users want to **chain requests visually**,
reorder them, and **pass data from one response into the next request**.

## Solution

A new **Flows** view: a node canvas (React Flow) where each node references an existing
saved request. Edges define execution order. After a node runs, the user extracts values
from its response (by path) into named **flow variables**, referenced downstream with the
existing `{{VAR}}` syntax. Flows persist per workspace in SQLite.

## Approved decisions

1. **Canvas:** React Flow (`@xyflow/react` v12, MIT) — drag/zoom/pan/connect out of the box.
2. **Data passing:** post-response extraction `path → variable`, consumed via `{{VAR}}`
   (reuses the existing variable engine).
3. **Node source:** each node references a `SavedRequest` by id (the request keeps living in
   the tree and its normal editor). Flow only orchestrates.
4. **Persistence:** new SQLite table `request_flows` + Rust commands, mirroring
   `saved_requests`. `graph_json` is opaque to the backend.
5. **Save UX:** explicit **Guardar** + debounced autosave on structural change; dirty flag.
6. **Execution:** topological order, **stop-on-error**.
7. **Tests:** none for now (repo has no runner); runner/path helpers written as pure
   functions so Vitest can be added later.

## Architecture

### Backend — `src-tauri`

**Table (`database.rs`, added to the schema batch):**
```sql
CREATE TABLE IF NOT EXISTS request_flows (
  id           TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  graph_json   TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE(workspace_id, name COLLATE NOCASE)
);
```

**Module `flow.rs`** — mirrors `request.rs` conventions (rusqlite, `#[serde(rename_all =
"camelCase")]`, `Uuid::new_v4()`, `CURRENT_TIMESTAMP`, `map_*` row mapper):

| Command | Signature | Notes |
|---------|-----------|-------|
| `list_request_flows` | `(state, input{userId, workspaceId}) -> Vec<RequestFlow>` | ordered by `created_at` |
| `create_request_flow` | `(state, input{userId, workspaceId, name}) -> RequestFlow` | empty graph default |
| `rename_request_flow` | `(state, input{userId, flowId, name}) -> RequestFlow` | |
| `update_request_flow` | `(state, input{userId, flowId, graphJson}) -> RequestFlow` | persists the graph |
| `delete_request_flow` | `(state, input{userId, flowId}) -> ()` | |

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFlow {
    id: String,
    workspace_id: String,
    name: String,
    graph_json: String,
    created_at: String,
    updated_at: String,
}
```

Register all five in `lib.rs` `generate_handler!`. The backend never parses `graph_json`;
it validates only that `name` is unique per workspace (DB constraint → surface error string).

### Frontend — `features/flows/`

**`flow-client.ts`** — types + Tauri wrappers:
```ts
export type RequestFlow = {
  id: string; workspaceId: string; name: string;
  graphJson: string; createdAt: string; updatedAt: string;
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

export const requestFlowApi = {
  list(userId, workspaceId): Promise<RequestFlow[]>,
  create(userId, workspaceId, name): Promise<RequestFlow>,
  rename(userId, flowId, name): Promise<RequestFlow>,
  update(userId, flowId, graphJson): Promise<RequestFlow>,
  remove(userId, flowId): Promise<void>,
};

export function parseGraph(graphJson: string): FlowGraph; // safe-parse w/ fallback
export function serializeGraph(graph: FlowGraph): string;
```

**`flows-view.tsx`** — top-level view. Owns:
- Flow list for the workspace (load via `requestFlowApi.list`), a selector +
  create/rename/delete (reuse `NameDialog` / confirm dialogs pattern from the shell).
- The React Flow canvas bound to the selected flow's graph (nodes/edges/positions).
- Toolbar: **Añadir nodo** (dialog picking a `SavedRequest`), **Guardar**, **Ejecutar**,
  run status summary.
- Selection → opens `flow-inspector` for the active node.
- Autosave: debounced `update` on nodes/edges/position/extraction changes; explicit Guardar;
  dirty indicator.

**`flow-node.tsx`** — custom React Flow node. Shows referenced request's `method` (colored)
+ `name`, extraction chips (`$.data.id → productId`), and a status badge
(`idle | running | success | error`). Source/target handles for edges. Invalid state when
`requestId` no longer exists in `requests`.

**`flow-inspector.tsx`** — side panel for the selected node: pick/replace the referenced
`SavedRequest`, edit extractions (add/remove `path → variable` rows), and view the node's
last response body + extracted variables after a run.

**`flow-runner.ts`** — pure execution engine (no React):
```ts
type NodeRun = { nodeId: string; status: 'success'|'error'; response?: HttpResponse; error?: string; vars: {key:string;value:string}[] };
export async function runFlow(
  graph: FlowGraph,
  requestsById: Map<string, SavedRequest>,
  envVariables: {key:string;value:string}[],
  onNodeStatus: (nodeId: string, status: 'running'|'success'|'error') => void,
): Promise<NodeRun[]>;
```
Algorithm:
1. Topological sort of `nodes` by `edges` (Kahn). Cycle → throw `FlowCycleError`.
2. `flowVars: {key,value}[]` accumulator, starts `[]`.
3. For each node in order:
   - Look up its `SavedRequest`; missing → throw `FlowInvalidNodeError`.
   - `prepareHttpRequest(saved, [...envVariables, ...flowVars])` → execute input.
     **flowVars override env vars on key collision** (later entries win in the resolver's Map).
   - `onNodeStatus(id, 'running')`, `executeHttpRequest(...)`, then success/error.
   - On success, apply `extractions`: `getByPath(JSON.parse(response.body), path)` →
     push `{ variable, String(value) }` into `flowVars`. Missing path → skip + record warning.
   - On HTTP error → mark node error, **stop** (return accumulated runs).

**`get-by-path.ts`** — pure: `getByPath(root: unknown, path: string): unknown`. Supports
`$.a.b`, `a.b`, and array indexes `a.items[0].id`. Leading `$.`/`$` optional. Returns
`undefined` on any miss.

### Shared refactor — `features/requests/prepare-http-request.ts`

The logic that turns a request config (method/url/params/headers/auth/body) + variables into
the `executeHttpRequest` input currently lives inline in `request-builder.tsx` `sendRequest`
(content-type handling, basic/api-key/bearer auth, variable resolution). Extract it to a pure
function:
```ts
export function prepareHttpRequest(
  config: { method: string; url: string; headers: Pair[]; authType: string; auth: AuthState; bodyType: string; body: string },
  variables: {key:string;value:string}[],
): { method: string; url: string; headers: HttpHeader[]; bodyType: string; body?: string };
```
`request-builder.tsx` `sendRequest` calls it (behavior unchanged); `flow-runner.ts` reuses it
so auth/content-type behave identically. This requires sharing the `Pair`/`AuthState`
types (place them in `prepare-http-request.ts` or a small shared `request-types.ts`).

### Shell integration — `authenticated-shell.tsx`

- `type MainView = "request" | "environment" | "settings" | "flows";`
- Header nav button (near settings) → `setMainView("flows")`.
- Render `{mainView === "flows" ? <FlowsView userId={user.id} workspace={activeWorkspace}
  requests={requests} variables={activeEnvironment ? variables : []} /> : null}`.
- `FlowsView` receives `requests` (to resolve node references) and env `variables`.

## Data flow

```
BUILD
  Flows view → create/select flow → graph loaded from graph_json
  Añadir nodo → pick SavedRequest → node on canvas
  connect nodes → edges (order)
  select node → inspector → add extraction path→variable
  change → debounced update_request_flow (autosave) / Guardar

RUN
  Ejecutar → runFlow(graph, requestsById, envVars)
    topo order → per node:
      prepareHttpRequest(saved, env + flowVars) → executeHttpRequest → response
      extractions: getByPath(response.body, path) → flowVars += {variable, value}
      status badge updates live via onNodeStatus
    stop on first HTTP/invalid/cycle error
  inspector shows each node's response + extracted vars
```

## Error handling

| Case | Behavior |
|------|----------|
| Cycle in graph | `runFlow` throws before executing; toast "El flujo tiene un ciclo". |
| Node references deleted request | node marked invalid; run blocked with toast. |
| Extraction path no match | variable not set; downstream `{{var}}` stays literal; warning in inspector. |
| HTTP error / timeout | node → error, execution stops, cause shown in node/inspector. |
| Duplicate flow name | backend UNIQUE constraint error surfaced as toast. |
| Empty graph / no start node | Ejecutar disabled or no-op with hint. |

## Testing

No automated tests (repo has no runner). `flow-runner.ts` and `get-by-path.ts` are written as
pure functions to keep them unit-testable if Vitest is added later. Manual verification: build
the 3-step store flow (create product → set stock → assign warehouse) against a test API and
confirm `productId` propagates.

## Scope / non-goals (YAGNI)

- No parallel branch execution (sequential in topological order even if the graph branches).
- No request snapshotting (uses the current saved version at run time).
- No conditionals, loops, retries, or delays between nodes in v1.
- No realtime/collaboration.
- No persistence of run results (graph persists; runs are in-memory per session).

## Key files

| File | Change |
|------|--------|
| `src-tauri/src/database.rs` | **add** `request_flows` table to schema batch |
| `src-tauri/src/flow.rs` | **new** — 5 flow commands + `RequestFlow` struct + row mapper |
| `src-tauri/src/lib.rs` | register 5 commands in `generate_handler!` (+ `mod flow;`) |
| `features/flows/flow-client.ts` | **new** — types + `requestFlowApi` + graph (de)serialize |
| `features/flows/flows-view.tsx` | **new** — canvas view, flow list, toolbar, autosave |
| `features/flows/flow-node.tsx` | **new** — custom node |
| `features/flows/flow-inspector.tsx` | **new** — node side panel (extractions, response) |
| `features/flows/flow-runner.ts` | **new** — pure execution engine |
| `features/flows/get-by-path.ts` | **new** — pure path evaluator |
| `features/requests/prepare-http-request.ts` | **new** — shared request-builder logic |
| `features/requests/request-builder.tsx` | `sendRequest` calls `prepareHttpRequest` |
| `features/workspaces/authenticated-shell.tsx` | `MainView += "flows"`, nav button, render `FlowsView` |
| `package.json` | add `@xyflow/react` |
```
