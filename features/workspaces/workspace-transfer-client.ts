import { invoke } from "@tauri-apps/api/core";

export type TransferSummary = { workspaceName: string; folders: number; requests: number; environments: number; variables: number; redactedValues: number };
export type WorkspaceExport = { fileName: string; content: string; summary: TransferSummary };
export type WorkspaceImport = { workspaceId: string; workspaceName: string; summary: TransferSummary };

export const workspaceTransferApi = {
  export(userId: string, workspaceId: string, includeSecrets: boolean) {
    return invoke<WorkspaceExport>("export_workspace", { input: { userId, workspaceId, includeSecrets } });
  },
  preview(content: string) {
    return invoke<TransferSummary>("preview_workspace_import", { input: { content } });
  },
  import(userId: string, content: string) {
    return invoke<WorkspaceImport>("import_workspace", { input: { userId, content } });
  },
};
