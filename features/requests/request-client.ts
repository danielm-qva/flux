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
  create(userId: string, workspaceId: string, name: string) {
    return invoke<SavedRequest>("create_saved_request", {
      input: { userId, workspaceId, name },
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
