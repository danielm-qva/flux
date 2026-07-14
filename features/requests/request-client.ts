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

export function executeHttpRequest(input: {
  method: string;
  url: string;
  headers: HttpHeader[];
  body?: string;
  timeoutMs?: number;
}) {
  return invoke<HttpResponse>("execute_http_request", { input });
}
