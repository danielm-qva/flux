"use client";

import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { SavedRequest } from "@/features/requests/request-client";
import { workspaceApi, type EnvironmentVariable } from "@/features/workspaces/workspace-client";
import {
  automationApi,
  parseActions,
  parseSchedule,
  type Automation,
  type SaveAutomationInput,
} from "./automation-client";
import { attemptRun, isDue, nextRunIso } from "./automation-runner";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export type AutomationsApi = {
  items: Automation[];
  runningIds: Set<string>;
  create: (requestId: string, input: SaveAutomationInput) => Promise<Automation | null>;
  update: (id: string, input: SaveAutomationInput) => Promise<Automation | null>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  runNow: (id: string) => void;
};

/**
 * Programador de peticiones. El backend solo emite un tick cada 5 s; aquí se decide qué toca
 * ejecutar, se reutiliza la preparación de peticiones de la interfaz y se actualiza el environment.
 * Solo corre mientras Flux está abierto y solo para el workspace activo.
 */
export function useAutomations({
  userId,
  workspaceId,
  requests,
  onVariableSaved,
}: {
  userId: string;
  workspaceId: string;
  requests: SavedRequest[];
  onVariableSaved: (variable: EnvironmentVariable) => void;
}): AutomationsApi {
  const [items, setItems] = useState<Automation[]>([]);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const itemsRef = useRef<Automation[]>([]);
  const requestsRef = useRef(requests);
  const running = useRef(new Set<string>());
  const onVariableSavedRef = useRef(onVariableSaved);

  useEffect(() => {
    itemsRef.current = items;
    requestsRef.current = requests;
    onVariableSavedRef.current = onVariableSaved;
  });

  const replace = useCallback((saved: Automation) => {
    setItems((current) => (current.some((item) => item.id === saved.id) ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]));
  }, []);

  const process = useCallback(
    async (automation: Automation) => {
      if (running.current.has(automation.id)) return;
      const request = requestsRef.current.find((item) => item.id === automation.requestId);
      if (!request) return;

      running.current.add(automation.id);
      setRunningIds(new Set(running.current));
      const schedule = parseSchedule(automation);
      const actions = parseActions(automation);
      const startedAt = new Date().toISOString();

      try {
        let envVariables: EnvironmentVariable[] = [];
        if (automation.environmentId) {
          envVariables = await workspaceApi.listVariables(userId, automation.environmentId).catch(() => []);
        }

        let result = await attemptRun(request, envVariables, actions);
        for (let attempt = 0; !result.ok && attempt < actions.onFailure.retries; attempt += 1) {
          await sleep(actions.onFailure.retryDelaySeconds * 1000);
          result = await attemptRun(request, envVariables, actions);
        }

        const savedNames: string[] = [];
        let error = result.ok ? null : result.error;
        if (result.ok && automation.environmentId) {
          try {
            for (const item of result.values) {
              const existing = envVariables.find((variable) => variable.key.toLowerCase() === item.variable.toLowerCase());
              const saved = await workspaceApi.saveVariable(userId, automation.environmentId, existing?.key ?? item.variable, item.value, existing?.id);
              onVariableSavedRef.current(saved);
              savedNames.push(saved.key);
            }
          } catch (cause) {
            error = `No se pudo guardar la variable: ${String(cause)}`.slice(0, 300);
          }
        } else if (result.ok && result.values.length) {
          error = "Elige un environment para guardar las variables.";
        }

        const ok = result.ok && error === null;
        const failures = ok ? 0 : automation.consecutiveFailures + 1;
        const pause = !ok && actions.onFailure.pauseAfterFailures > 0 && failures >= actions.onFailure.pauseAfterFailures;
        const saved = await automationApi.recordRun({
          userId,
          automationId: automation.id,
          startedAt,
          status: ok ? "success" : "failed",
          httpStatus: result.httpStatus ?? null,
          durationMs: result.durationMs ?? null,
          error,
          savedVars: savedNames.length ? JSON.stringify(savedNames) : null,
          nextRunAt: nextRunIso(schedule, Date.now()),
          consecutiveFailures: failures,
          pause,
        });
        replace(saved);

        if (!ok && actions.onFailure.notify) {
          toast.error(pause ? `«${automation.name}» se pausó` : `«${automation.name}» falló`, {
            description: pause ? `Tras ${failures} fallos seguidos. ${error ?? ""}` : (error ?? undefined),
          });
        }
      } catch (cause) {
        toast.error(`No se pudo ejecutar «${automation.name}»`, { description: String(cause) });
      } finally {
        running.current.delete(automation.id);
        setRunningIds(new Set(running.current));
      }
    },
    [replace, userId],
  );

  // Carga al cambiar de workspace; las que piden «ejecutar al abrir» arrancan una vez.
  useEffect(() => {
    let active = true;
    if (!workspaceId) return;
    automationApi
      .list(userId, workspaceId)
      .then((list) => {
        if (!active) return;
        setItems(list);
        itemsRef.current = list;
        for (const automation of list) {
          if (automation.enabled && parseSchedule(automation).runOnStart) void process(automation);
        }
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [userId, workspaceId, process]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void listen("automation://tick", () => {
      const now = Date.now();
      for (const automation of itemsRef.current) {
        if (isDue(automation, now)) void process(automation);
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else dispose = unlisten;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [process]);

  const create = useCallback<AutomationsApi["create"]>(
    async (requestId, input) => {
      try {
        const created = await automationApi.create(userId, workspaceId, requestId, input);
        replace(created);
        return created;
      } catch (cause) {
        toast.error("No se pudo crear la automatización", { description: String(cause) });
        return null;
      }
    },
    [replace, userId, workspaceId],
  );

  const update = useCallback<AutomationsApi["update"]>(
    async (id, input) => {
      try {
        const saved = await automationApi.update(userId, id, input);
        replace(saved);
        return saved;
      } catch (cause) {
        toast.error("No se pudo guardar la automatización", { description: String(cause) });
        return null;
      }
    },
    [replace, userId],
  );

  const setEnabled = useCallback<AutomationsApi["setEnabled"]>(
    async (id, enabled) => {
      try {
        replace(await automationApi.setEnabled(userId, id, enabled));
      } catch (cause) {
        toast.error("No se pudo cambiar el estado", { description: String(cause) });
      }
    },
    [replace, userId],
  );

  const remove = useCallback<AutomationsApi["remove"]>(
    async (id) => {
      try {
        await automationApi.remove(userId, id);
        setItems((current) => current.filter((item) => item.id !== id));
      } catch (cause) {
        toast.error("No se pudo eliminar", { description: String(cause) });
      }
    },
    [userId],
  );

  const runNow = useCallback<AutomationsApi["runNow"]>(
    (id) => {
      const automation = itemsRef.current.find((item) => item.id === id);
      if (automation) void process(automation);
    },
    [process],
  );

  return { items, runningIds, create, update, setEnabled, remove, runNow };
}
