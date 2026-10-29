"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Preferences = {
  codeSize: number;
  timeoutMs: number;
  suggestions: boolean;
  foldHeaders: boolean;
};
export const DEFAULT_PREFERENCES: Preferences = {
  codeSize: 13,
  timeoutMs: 30000,
  suggestions: true,
  foldHeaders: true,
};
const key = "flux.preferences";
function subscribe(callback: () => void) {
  window.addEventListener("flux-preferences-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("flux-preferences-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
export function usePreferences(): Preferences {
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => {
    try {
      const parsed = JSON.parse(value);
      return {
        codeSize: [12, 13, 15].includes(parsed.codeSize) ? parsed.codeSize : 13,
        timeoutMs: Number.isFinite(parsed.timeoutMs)
          ? Math.min(300000, Math.max(1000, parsed.timeoutMs))
          : 30000,
        suggestions: parsed.suggestions !== false,
        foldHeaders: parsed.foldHeaders !== false,
      };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  }, [value]);
}
export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* The current session remains usable without storage. */
  }
  window.dispatchEvent(new Event("flux-preferences-change"));
}
