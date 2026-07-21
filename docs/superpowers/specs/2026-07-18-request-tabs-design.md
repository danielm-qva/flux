# Multiple Request Tabs — Design Spec

**Date:** 2026-07-18
**Status:** Approved (architecture), pending spec review
**Area:** `features/tabs`, `features/requests`, `features/workspaces`

## Problem

Flux currently manages a **single active request**. `authenticated-shell.tsx` holds
`activeRequestId` + `requests[]`; `RequestBuilder` mounts with `key={activeRequest.id}`,
initializing its own `useState` from the `request` prop and remounting on every switch.
Consequences:

- Only one request open at a time. Switching requests in the tree loses any in-editor state.
- Creating a request forces a name dialog + immediate DB row, then swaps the single view.

Users want a **multi-tab editor** (like Postman/Insomnia): several requests open at once,
each preserving its own unsaved edits, plus an unsaved "draft" flow for new requests.

## Approved decisions

1. **Per-tab edit preservation** — each open tab keeps its full unsaved edit state
   (method, url, params, headers, auth, body, live response) in memory. Switching tabs
   never discards edits.
2. **Draft new requests** — the `+` button opens an "Untitled" tab with **no DB write**.
   Persisted to DB only on Save (name requested then). Creating a new request auto-opens
   and focuses its tab (satisfies "salir de la vista guardada automáticamente").
3. **Focus existing tab** — clicking a tree request already open focuses that tab instead
   of duplicating.
4. **Restore session** — open tabs + active tab (including draft contents) persist across
   app restart via Tauri Store.
5. **Confirm on dirty close** — closing a tab with unsaved changes prompts to discard.

No Rust/backend changes. Persistence is local (Tauri Store), same mechanism as
`first-run-store.ts`.

## Architecture

### New unit: `features/tabs/tabs-store.ts` (Zustand + persist)

Zustand is already a dependency but unused. This is its first use.

```ts
// Editable, per-tab state. Mirrors the fields RequestBuilder edits today,
// but held centrally so it survives tab switches and app restart.
export type RequestDraft = {
  name: string;                 // "Untitled" for a fresh draft
  method: string;               // HttpMethod
  url: string;
  params: Pair[];               // hydrated from paramsJson
  headers: Pair[];              // hydrated from headersJson
  authType: string;
  auth: AuthState;              // hydrated from authJson
  bodyType: string;
  body: string;
  response: HttpResponse | null; // live response for this tab
};

export type Tab = {
  tabId: string;                // client-generated, stable per open tab
  workspaceId: string;
  requestId: string | null;     // null => unsaved draft
  folderId: string | null;      // target folder for a draft's first save
  draft: RequestDraft;
  savedSnapshot: RequestDraft | null; // last persisted state; null for drafts
  dirty: boolean;               // draft !== savedSnapshot  => "●" indicator
};

type TabsState = {
  tabs: Tab[];
  activeTabId: string | null;
};
```

Actions:

| Action | Behavior |
|--------|----------|
| `openSaved(saved: SavedRequest)` | If a tab with `requestId === saved.id` exists → set it active. Else map `SavedRequest → RequestDraft` and push a new tab, set active. |
| `openDraft(workspaceId, folderId?)` | Push a tab: `requestId=null`, name `"Untitled N"`, empty defaults, `dirty=true`, set active. |
| `closeTab(tabId)` | Caller confirms if `dirty` first. Removes tab; if it was active, activate the neighbor (right, else left, else null). |
| `setActive(tabId)` | Sets `activeTabId`. |
| `patchDraft(tabId, partial)` | Shallow-merge into `draft`; recompute `dirty` vs `savedSnapshot` (drafts stay dirty until first save). |
| `markSaved(tabId, saved)` | Set `requestId=saved.id`, `draft` and `savedSnapshot` ← mapped `saved`, `dirty=false`. |
| `renameTab(tabId, name)` | Convenience patch of `draft.name` (used when a saved request is renamed in the tree). |
| `closeRequestTab(requestId)` | Remove any tab bound to a deleted saved request. |

**Mapping helpers** (extracted so both store and builder share them):
`savedToDraft(saved)` and `draftToUpdatePayload(tabId, draft)`. The parse/normalize
logic currently inline in `request-builder.tsx` (`parseSavedValue`, `normalizeBodyType`,
`normalizeBodyValue`) moves to a shared `features/requests/request-draft.ts` so the store
can hydrate drafts identically.

**Persistence.** `persist` middleware backed by a small Tauri Store adapter
(`createTauriStorage()` implementing Zustand's `StateStorage`: `getItem/setItem/removeItem`).
Persisted slice: `tabs` (with `draft`) + `activeTabId`, keyed so tabs are scoped per
workspace. `savedSnapshot` and `response` are serializable and persisted too (response is
optional; acceptable to persist last response). Rehydration on startup restores the session.

### Changed unit: `RequestBuilder` becomes controlled

`request-builder.tsx` today owns editor state via `useState` seeded from `request`. Change:

- New prop shape: `RequestBuilder({ userId, workspace, variables, tabId })`.
- Read the active tab's `draft` via a store selector; every edit calls
  `patchDraft(tabId, ...)` instead of local `setX`. Remove the `useState` seeds for
  `method/url/params/headers/authType/auth/bodyType/body/response`.
- **Transient UI state stays local** and is NOT in the store: `tab` (params/headers/auth/body
  sub-tab), `sending`, `saving`, `requestError`, `curlImporterOpen`. These reset on remount;
  acceptable.
- Remove `key={request.id}` remounting in the shell — one `RequestBuilder` instance stays
  mounted and reads whichever tab is active. (Monaco: single active editor, no multi-editor cost.)

**Save flow** (`saveRequest`):
- If `requestId === null` (draft): open `NameDialog` to get a name → `savedRequestApi.create(userId, workspaceId, name, folderId)` → `savedRequestApi.update(userId, draftToUpdatePayload(...))` → `markSaved(tabId, saved)` → notify shell to insert into `requests[]`.
- Else: `savedRequestApi.update(...)` → `markSaved(tabId, saved)` → shell updates `requests[]`.

**Send flow** (`sendRequest`): unchanged logic, but writes result via
`patchDraft(tabId, { response })` / local `requestError`, and still calls `onExecuted`
for history.

### New unit: `features/tabs/tab-bar.tsx`

Horizontal strip above `RequestBuilder`:

- One chip per tab: colored method label (reuse `METHOD_COLORS`) + `draft.name` +
  `●` when `dirty` + `×` close button.
- Click chip → `setActive`. Click `×` → if `dirty`, confirm dialog ("¿Descartar cambios de
  `<name>`?") then `closeTab`; else `closeTab`.
- Trailing `+` button → `openDraft(activeWorkspace.id)`.
- Overflow: horizontal scroll (YAGNI on dropdown/overflow menu for v1).

### Changed unit: `authenticated-shell.tsx`

- Remove `activeRequestId` single-state and the derived `activeRequest`. Read `tabs` /
  `activeTabId` from the store; the active `Tab` drives the main view.
- `RequestTree.onSelect(request)` → `tabsStore.openSaved(request)` (focus-or-open).
- Replace the old `createRequest` (name dialog + immediate DB create) as the primary path:
  the `+` in `TabBar` calls `openDraft`. Keep the tree's "new request in folder" affordance
  by calling `openDraft(workspaceId, folderId)`.
- Tree mutations stay authoritative over `requests[]` and must reconcile tabs:
  - rename saved request → `renameTab` for a matching open tab.
  - delete saved request → `closeRequestTab(requestId)`.
  - `onSaved` from builder still updates `requests[]`.
- Render: when `activeTabId` → `<TabBar/>` + `<RequestBuilder tabId={activeTabId} .../>`.
  When no tabs → empty state ("Abre una petición o crea una nueva con +").
- Workspace switch (`changeWorkspace`) scopes tabs to the new workspace
  (persisted per workspace; show only that workspace's tabs).

## Data flow (after change)

```
NEW DRAFT
  TabBar "+" → openDraft(ws) → tab{requestId:null, dirty:true} active
  edit → patchDraft (nothing hits DB)
  Save → NameDialog → create + update → markSaved → requests[] += saved

OPEN SAVED
  tree click → openSaved(saved)
    exists? focus : map savedToDraft, push tab
  edit → patchDraft (dirty ●)
  Save → update → markSaved (dirty cleared)

SWITCH TAB
  setActive → RequestBuilder reads new tab.draft (prev tab's edits intact in store)

RESTART
  Zustand persist rehydrates tabs + activeTabId from Tauri Store
```

## Error handling

- Save on draft with duplicate name: keep existing case-insensitive duplicate check before
  `create`; surface via toast, keep tab open/dirty.
- `create`/`update`/`execute` failures: toast error, leave tab dirty, no state corruption
  (only `markSaved` on success).
- Corrupt/partial persisted state on rehydrate: guard `savedToDraft`/parse with the existing
  `parseSavedValue` fallbacks; drop tabs that fail to parse rather than crash.
- Closing last tab → empty state, `activeTabId=null`.

## Testing

- **tabs-store unit tests** (Vitest): open/focus dedupe, openDraft naming, patchDraft dirty
  transitions, markSaved clears dirty + sets requestId, closeTab neighbor-activation,
  closeRequestTab on delete.
- **Mapping tests**: `savedToDraft` ↔ `draftToUpdatePayload` round-trip preserves params/
  headers/auth/body across the JSON boundary.
- **Persistence**: mock Tauri storage adapter; assert rehydrate restores tabs + active.
- **Component**: TabBar renders dirty `●`, close confirm on dirty, `+` opens draft;
  RequestBuilder reflects active tab and writes via patchDraft.

## Scope / non-goals (YAGNI)

- No tab drag-reorder, no tab overflow menu (scroll only), no split view.
- No server-side draft persistence (local Tauri Store only).
- No cross-workspace tab display.
- No auto-save; saving stays explicit.

## Key files

| File | Change |
|------|--------|
| `features/tabs/tabs-store.ts` | **new** — Zustand store + Tauri persist adapter |
| `features/tabs/tab-bar.tsx` | **new** — tab strip + `+` |
| `features/requests/request-draft.ts` | **new** — `RequestDraft`, `savedToDraft`, `draftToUpdatePayload`, moved parse/normalize helpers |
| `features/requests/request-builder.tsx` | controlled by `tabId`; save handles draft→create; remove seeded `useState` |
| `features/workspaces/authenticated-shell.tsx` | drop single `activeRequestId`; wire tree + TabBar to store; reconcile tabs on rename/delete |
| `features/requests/request-tree.tsx` | `onSelect` → `openSaved`; folder "+" → `openDraft(ws, folderId)` |
