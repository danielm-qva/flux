"use client";

import { useEffect, useState } from "react";
import { savePreferences, usePreferences } from "./preferences";
import { UpdateControl } from "@/features/updater/update-control";
import { WorkspaceTransfer } from "@/features/workspaces/workspace-transfer";
import type { Workspace } from "@/features/workspaces/workspace-client";
import type { WorkspaceImport } from "@/features/workspaces/workspace-transfer-client";

export type ThemeId = "night" | "day";
export const THEMES: Array<{
  id: ThemeId;
  name: string;
  description: string;
  colors: string[];
}> = [
  {
    id: "night",
    name: "Noche",
    description: "Verde carbón y acento naranja.",
    colors: ["#0f1110", "#161917", "#ff8552", "#eceee6"],
  },
  {
    id: "day",
    name: "Día",
    description: "Papel cálido y acento terracota.",
    colors: ["#f3f2ec", "#faf9f5", "#c2410c", "#191b18"],
  },
];

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.fluxTheme = id;
  try {
    window.localStorage.setItem("flux.color-theme", id);
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new CustomEvent("flux-theme-change", { detail: id }));
}

export function applyContrast(high: boolean) {
  if (high) document.documentElement.dataset.fluxContrast = "high";
  else delete document.documentElement.dataset.fluxContrast;
  try {
    window.localStorage.setItem("flux.contrast", high ? "high" : "normal");
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new CustomEvent("flux-theme-change"));
}

export function ThemeRuntime() {
  const preferences = usePreferences();
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--fx-code-size",
      `${preferences.codeSize}px`,
    );
  }, [preferences.codeSize]);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("flux.contrast") === "high")
        document.documentElement.dataset.fluxContrast = "high";
    } catch {
      /* sin almacenamiento */
    }
    const saved = window.localStorage.getItem("flux.color-theme");
    document.documentElement.dataset.fluxTheme = THEMES.some(
      (item) => item.id === saved,
    )
      ? saved!
      : "night";
  }, []);
  return null;
}

export function SettingsView({
  currentVersion,
  userId,
  workspace,
  onWorkspaceImported,
}: {
  currentVersion: string | null;
  userId: string;
  workspace: Workspace | null;
  onWorkspaceImported: (result: WorkspaceImport) => void;
}) {
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "night";
    const saved = window.localStorage.getItem("flux.color-theme");
    return THEMES.some((item) => item.id === saved)
      ? (saved as ThemeId)
      : "night";
  });

  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<ThemeId | undefined>).detail;
      if (next) setTheme(next);
    };
    window.addEventListener("flux-theme-change", onChange);
    return () => window.removeEventListener("flux-theme-change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.fluxTheme = theme;
    window.localStorage.setItem("flux.color-theme", theme);
  }, [theme]);

  const preferences = usePreferences();
  return (
    <section className="fx-settings">
      <h2>Apariencia</h2>
      <div className="fx-setting-row">
        <div>
          <h3>Tema</h3>
          <p>Noche es el predeterminado.</p>
        </div>
        <div className="fx-segments">
          {THEMES.map((item) => (
            <button
              key={item.id}
              aria-pressed={theme === item.id}
              onClick={() => {
                setTheme(item.id);
                applyTheme(item.id);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      <div className="fx-setting-row">
        <h3>Tamaño de letra del código</h3>
        <div className="fx-segments">
          {[12, 13, 15].map((size) => (
            <button
              key={size}
              aria-pressed={preferences.codeSize === size}
              onClick={() =>
                savePreferences({ ...preferences, codeSize: size })
              }
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <h2>Peticiones</h2>
      <div className="fx-setting-row">
        <div>
          <h3>Plegar encabezados generados</h3>
          <p>Muestra primero los que escribes tú.</p>
        </div>
        <input
          className="fx-switch"
          type="checkbox"
          aria-label="Plegar encabezados generados"
          checked={preferences.foldHeaders}
          onChange={(event) =>
            savePreferences({
              ...preferences,
              foldHeaders: event.target.checked,
            })
          }
        />
      </div>
      <div className="fx-setting-row">
        <div>
          <h3>Sugerencias al fallar</h3>
          <p>Explica errores como 401 o 415 y propone el arreglo.</p>
        </div>
        <input
          className="fx-switch"
          type="checkbox"
          aria-label="Sugerencias al fallar"
          checked={preferences.suggestions}
          onChange={(event) =>
            savePreferences({
              ...preferences,
              suggestions: event.target.checked,
            })
          }
        />
      </div>
      <div className="fx-setting-row">
        <div>
          <h3>Tiempo de espera</h3>
          <p>Cancela la petición pasado este tiempo.</p>
        </div>
        <label className="fx-setting-input">
          <input
            aria-label="Tiempo de espera en milisegundos"
            type="number"
            min={1000}
            max={300000}
            step={1000}
            value={preferences.timeoutMs}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value))
                savePreferences({
                  ...preferences,
                  timeoutMs: Math.min(300000, Math.max(1000, value)),
                });
            }}
          />
          <span>ms</span>
        </label>
      </div>
      <h2>Portabilidad</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Mueve un workspace completo entre instalaciones de Flux.
      </p>
      <WorkspaceTransfer
        userId={userId}
        workspace={workspace}
        onImported={onWorkspaceImported}
      />
      <h2>Sistema y actualizaciones</h2>
      <UpdateControl
        currentVersion={currentVersion}
        variant="panel"
        autoCheck={false}
      />
    </section>
  );
}
