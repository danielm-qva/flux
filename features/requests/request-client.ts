import { invoke } from "@tauri-apps/api/core";

export type HttpHeader = { name: string; value: string };
export type HttpResponse = {
  status: number;
  statusText: string;
  headers: HttpHeader[];
  body: string;
  durationMs: number;
  sizeBytes: number;
};

export type SavedRequest = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  method: string;
  url: string;
  paramsJson: string;
  headersJson: string;
  authType: string;
  authJson: string;
  bodyType: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export const savedRequestApi = {
  list(userId: string, workspaceId: string) {
    return invoke<SavedRequest[]>("list_saved_requests", {
      input: { userId, workspaceId },
    });
  },
  create(userId: string, workspaceId: string, name: string, folderId?: string | null) {
    return invoke<SavedRequest>("create_saved_request", {
      input: { userId, workspaceId, name, folderId: folderId ?? null },
    });
  },
  update(
    userId: string,
    request: Pick<
      SavedRequest,
      | "id"
      | "name"
      | "method"
      | "url"
      | "paramsJson"
      | "headersJson"
      | "authType"
      | "authJson"
      | "bodyType"
      | "body"
    >,
  ) {
    return invoke<SavedRequest>("update_saved_request", {
      input: { userId, requestId: request.id, ...request },
    });
  },
  rename(userId: string, requestId: string, name: string) {
    return invoke<SavedRequest>("rename_saved_request", {
      input: { userId, requestId, name },
    });
  },
  duplicate(userId: string, requestId: string) {
    return invoke<SavedRequest>("duplicate_saved_request", {
      input: { userId, requestId },
    });
  },
  remove(userId: string, requestId: string) {
    return invoke<void>("delete_saved_request", {
      input: { userId, requestId },
    });
  },
  move(userId: string, requestId: string, folderId: string | null) {
    return invoke<SavedRequest>("move_saved_request", { input: { userId, requestId, folderId } });
  },
};

export type RequestFolder = { id: string; workspaceId: string; parentId: string | null; name: string; createdAt: string; updatedAt: string };
export type RequestHistoryEntry = { id: string; workspaceId: string; requestId: string | null; requestName: string; method: string; resolvedUrl: string; status: number | null; statusText: string; durationMs: number | null; sizeBytes: number | null; responseHeaders: string; responseBody: string; error: string | null; createdAt: string };

export const requestFolderApi = {
  list: (userId: string, workspaceId: string) => invoke<RequestFolder[]>("list_request_folders", { input: { userId, workspaceId } }),
  create: (userId: string, workspaceId: string, name: string, parentId: string | null) => invoke<RequestFolder>("create_request_folder", { input: { userId, workspaceId, name, parentId } }),
  rename: (userId: string, folderId: string, name: string) => invoke<RequestFolder>("rename_request_folder", { input: { userId, folderId, name } }),
  remove: (userId: string, folderId: string) => invoke<void>("delete_request_folder", { input: { userId, folderId } }),
};

export const requestHistoryApi = {
  list: (userId: string, workspaceId: string) => invoke<RequestHistoryEntry[]>("list_request_history", { input: { userId, workspaceId } }),
  record: (input: Record<string, unknown>) => invoke<RequestHistoryEntry>("record_request_history", { input }),
  clear: (userId: string, workspaceId: string) => invoke<void>("clear_request_history", { input: { userId, workspaceId } }),
};

export function executeHttpRequest(input: {
  method: string;
  url: string;
  headers: HttpHeader[];
  body?: string;
  timeoutMs?: number;
}) {
  return invoke<HttpResponse>("execute_http_request", { input });
}
