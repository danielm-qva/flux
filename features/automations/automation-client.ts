import { invoke } from "@tauri-apps/api/core";

export type AutomationSchedule = { everySeconds: number; runOnStart: boolean };
export type SaveVariableAction = { id: string; path: string; variable: string };
export type AutomationActions = {
  onSuccess: { saveVariables: SaveVariableAction[] };
  onFailure: {
    retries: number;
    retryDelaySeconds: number;
    pauseAfterFailures: number;
    notify: boolean;
  };
};

export type Automation = {
  id: string;
  workspaceId: string;
  requestId: string;
  environmentId: string | null;
  name: string;
  enabled: boolean;
  scheduleJson: string;
  actionsJson: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "success" | "failed" | "skipped" | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationRun = {
  id: string;
  automationId: string;
  startedAt: string;
  durationMs: number | null;
  status: "success" | "failed" | "skipped";
  httpStatus: number | null;
  error: string | null;
  savedVars: string | null;
};

export const DEFAULT_SCHEDULE: AutomationSchedule = { everySeconds: 480, runOnStart: true };
export const DEFAULT_ACTIONS: AutomationActions = {
  onSuccess: { saveVariables: [] },
  onFailure: { retries: 2, retryDelaySeconds: 10, pauseAfterFailures: 5, notify: true },
};

function parse<T>(source: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(source) as object) } as T;
  } catch {
    return fallback;
  }
}

export const parseSchedule = (automation: Pick<Automation, "scheduleJson">): AutomationSchedule =>
  parse(automation.scheduleJson, DEFAULT_SCHEDULE);

export function parseActions(automation: Pick<Automation, "actionsJson">): AutomationActions {
  const raw = parse<Partial<AutomationActions>>(automation.actionsJson, {});
  return {
    onSuccess: { saveVariables: raw.onSuccess?.saveVariables ?? [] },
    onFailure: { ...DEFAULT_ACTIONS.onFailure, ...(raw.onFailure ?? {}) },
  };
}

export type SaveAutomationInput = {
  name: string;
  environmentId: string | null;
  schedule: AutomationSchedule;
  actions: AutomationActions;
};

export const automationApi = {
  list: (userId: string, workspaceId: string) =>
    invoke<Automation[]>("list_automations", { input: { userId, workspaceId } }),
  create: (userId: string, workspaceId: string, requestId: string, input: SaveAutomationInput) =>
    invoke<Automation>("create_automation", {
      input: {
        userId,
        workspaceId,
        requestId,
        environmentId: input.environmentId,
        name: input.name,
        scheduleJson: JSON.stringify(input.schedule),
        actionsJson: JSON.stringify(input.actions),
      },
    }),
  update: (userId: string, automationId: string, input: SaveAutomationInput) =>
    invoke<Automation>("update_automation", {
      input: {
        userId,
        automationId,
        environmentId: input.environmentId,
        name: input.name,
        scheduleJson: JSON.stringify(input.schedule),
        actionsJson: JSON.stringify(input.actions),
      },
    }),
  setEnabled: (userId: string, automationId: string, enabled: boolean) =>
    invoke<Automation>("set_automation_enabled", { input: { userId, automationId, enabled } }),
  remove: (userId: string, automationId: string) =>
    invoke<void>("delete_automation", { input: { userId, automationId } }),
  recordRun: (input: {
    userId: string;
    automationId: string;
    startedAt: string;
    status: "success" | "failed" | "skipped";
    httpStatus?: number | null;
    durationMs?: number | null;
    error?: string | null;
    savedVars?: string | null;
    nextRunAt: string | null;
    consecutiveFailures: number;
    pause: boolean;
  }) => invoke<Automation>("record_automation_run", { input }),
  runs: (userId: string, automationId: string, limit = 30) =>
    invoke<AutomationRun[]>("list_automation_runs", { input: { userId, automationId, limit } }),
};
