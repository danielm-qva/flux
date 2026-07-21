import { invoke } from "@tauri-apps/api/core";

export type Workspace = { id: string; userId: string; name: string; createdAt: string };
export type Environment = { id: string; workspaceId: string; name: string; color: string; createdAt: string };
export type EnvironmentVariable = { id: string; environmentId: string; key: string; value: string; createdAt: string; updatedAt: string };

export const workspaceApi = {
  list: (userId: string) => invoke<Workspace[]>("list_workspaces", { userId }),
  create: (userId: string, name: string) =>
    invoke<Workspace>("create_workspace", { input: { userId, name } }),
  rename: (userId: string, workspaceId: string, name: string) =>
    invoke<Workspace>("rename_workspace", { input: { userId, workspaceId, name } }),
  remove: (userId: string, workspaceId: string) =>
    invoke<void>("delete_workspace", { input: { userId, workspaceId } }),
  listEnvironments: (userId: string, workspaceId: string) =>
    invoke<Environment[]>("list_environments", { input: { userId, workspaceId } }),
  createEnvironment: (userId: string, workspaceId: string, name: string, color = "#8b5cf6") =>
    invoke<Environment>("create_environment", { input: { userId, workspaceId, name, color } }),
  renameEnvironment: (userId: string, environmentId: string, name: string) =>
    invoke<Environment>("rename_environment", { input: { userId, environmentId, name } }),
  removeEnvironment: (userId: string, environmentId: string) =>
    invoke<void>("delete_environment", { input: { userId, environmentId } }),
  listVariables: (userId: string, environmentId: string) =>
    invoke<EnvironmentVariable[]>("list_environment_variables", { input: { userId, environmentId } }),
  saveVariable: (userId: string, environmentId: string, key: string, value: string, variableId?: string) =>
    invoke<EnvironmentVariable>("save_environment_variable", { input: { userId, environmentId, key, value, variableId } }),
  removeVariable: (userId: string, variableId: string) =>
    invoke<void>("delete_environment_variable", { input: { userId, variableId } }),
};

export function resolveEnvironmentVariables(
  template: string,
  variables: { key: string; value: string }[],
) {
  const values = new Map(variables.map((variable) => [variable.key.toUpperCase(), variable.value]));
  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key: string) =>
    values.get(key.toUpperCase()) ?? match,
  );
}
