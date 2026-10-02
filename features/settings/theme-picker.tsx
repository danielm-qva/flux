"use client";

import { Check, Contrast, Palette } from "lucide-react";
import { useSyncExternalStore } from "react";

import { THEMES, applyContrast, applyTheme, type ThemeId } from "./settings-view";

function subscribe(callback: () => void) {
  window.addEventListener("flux-theme-change", callback);
  return () => window.removeEventListener("flux-theme-change", callback);
}

function readTheme(): ThemeId {
  try {
    const saved = window.localStorage.getItem("flux.color-theme");
    return THEMES.some((item) => item.id === saved) ? (saved as ThemeId) : "ultraviolet";
  } catch {
    return "ultraviolet";
  }
}

function readContrast() {
  try {
    return window.localStorage.getItem("flux.contrast") === "high";
  } catch {
    return false;
  }
}

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "ultraviolet" as ThemeId);
  const highContrast = useSyncExternalStore(subscribe, readContrast, () => false);

  return (
    <details className="group relative">
      <summary
        aria-label="Cambiar tema"
        title="Tema"
        className="grid size-7 cursor-pointer list-none place-items-center rounded-md bg-white/[0.05] text-zinc-300 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1] hover:ring-white/[0.16] active:scale-95 [&::-webkit-details-marker]:hidden"
      >
        <Palette size={14} />
      </summary>
      <div className="absolute top-9 right-0 z-50 w-56 rounded-xl bg-[var(--flux-raised)] p-1.5 shadow-2xl ring-1 ring-[var(--flux-line)]">
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground/70 uppercase">Tema</p>
        <div className="grid grid-cols-1 gap-0.5">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyTheme(item.id)}
              className="flex h-8 items-center gap-2.5 rounded-md px-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"
            >
              <span className="flex -space-x-1">
                {item.colors.slice(1).map((color) => (
                  <span key={color} className="size-3.5 rounded-full ring-1 ring-black/40" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="flex-1">{item.name}</span>
              {theme === item.id ? <Check size={13} className="text-white" /> : null}
            </button>
          ))}
        </div>
        <div className="my-1.5 h-px bg-white/[0.07]" />
        <button
          type="button"
          role="switch"
          aria-checked={highContrast}
          onClick={() => applyContrast(!highContrast)}
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"
        >
          <Contrast size={14} className="text-muted-foreground" />
          <span className="flex-1">Alto contraste</span>
          <span className={`relative h-4 w-7 rounded-full transition-colors ${highContrast ? "bg-[var(--flux-primary)]" : "bg-white/15"}`}>
            <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${highContrast ? "left-3.5" : "left-0.5"}`} />
          </span>
        </button>
      </div>
    </details>
  );
}
