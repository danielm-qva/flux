"use client";

import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type UpdateStatus =
  "idle" | "checking" | "available" | "downloading" | "current" | "error";

type Props = { currentVersion: string | null };

export function UpdateControl({ currentVersion }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async (manual = false) => {
    if (!isTauri() || checkingRef.current) return;
    checkingRef.current = true;
    setStatus("checking");
    setError("");

    try {
      const result = await check({ timeout: 20_000 });
      setUpdate(result);
      if (result) {
        setStatus("available");
        setOpen(true);
      } else {
        setStatus("current");
        if (manual) setOpen(true);
      }
    } catch (cause) {
      setStatus("error");
      setError(normalizeUpdaterError(cause));
      if (manual) setOpen(true);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const timer = window.setTimeout(() => void checkForUpdate(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [checkForUpdate]);

  async function installUpdate() {
    if (!update || status === "downloading") return;
    setStatus("downloading");
    setDownloaded(0);
    setTotal(0);
    setError("");

    try {
      let received = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setTotal(event.data.contentLength ?? 0);
        }
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setDownloaded(received);
        }
      });
      await relaunch();
    } catch (cause) {
      setStatus("error");
      setError(normalizeUpdaterError(cause));
    }
  }

  const progress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0;
  const hasUpdate =
    status === "available" || (status === "downloading" && !!update);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (status === "idle" || status === "error")
            void checkForUpdate(true);
        }}
        className="relative hidden size-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white xl:grid"
        aria-label={
          hasUpdate
            ? "Actualización disponible"
            : "Configuración y actualizaciones"
        }
        title={
          hasUpdate
            ? `Flux ${update?.version} disponible`
            : "Configuración y actualizaciones"
        }
      >
        <Settings size={15} />
        {hasUpdate ? (
          <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#100a1d] bg-violet-400 shadow-[0_0_9px_rgba(167,139,250,0.8)]" />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="updater-title"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              status !== "downloading"
            )
              setOpen(false);
          }}
        >
          <section className="w-full max-w-md overflow-hidden rounded-2xl border border-violet-200/10 bg-[#151020] shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
              <div className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet-300/10 bg-violet-500/10 text-violet-300">
                  {status === "checking" || status === "downloading" ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : hasUpdate ? (
                    <Sparkles size={18} />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                </div>
                <div>
                  <p className="font-mono text-[9px] tracking-[0.16em] text-violet-300 uppercase">
                    Sistema
                  </p>
                  <h2
                    id="updater-title"
                    className="mt-1 font-sans text-lg font-semibold text-white"
                  >
                    Actualizaciones de Flux
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={status === "downloading"}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white disabled:opacity-30"
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3">
                <span className="text-xs text-muted-foreground">
                  Versión instalada
                </span>
                <code className="text-xs text-violet-200">
                  v{currentVersion || "—"}
                </code>
              </div>

              {status === "checking" ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Buscando una versión nueva…
                </p>
              ) : null}

              {status === "current" ? (
                <div className="py-7 text-center">
                  <CheckCircle2
                    className="mx-auto text-emerald-400"
                    size={24}
                  />
                  <p className="mt-3 text-sm font-medium text-white">
                    Flux está actualizado
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    No hay una versión más reciente disponible.
                  </p>
                </div>
              ) : null}

              {update &&
              (status === "available" || status === "downloading") ? (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Flux {update.version}
                      </p>
                      <p className="mt-1 text-[11px] text-violet-300">
                        Nueva versión disponible
                      </p>
                    </div>
                    {update.date ? (
                      <time className="text-[10px] text-muted-foreground">
                        {formatDate(update.date)}
                      </time>
                    ) : null}
                  </div>
                  <div className="mt-4 max-h-32 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/15 p-4">
                    <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                      {update.body?.trim() ||
                        "Esta versión incluye mejoras y correcciones para Flux."}
                    </p>
                  </div>
                  {status === "downloading" ? (
                    <div className="mt-5">
                      <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
                        <span>Descargando e instalando…</span>
                        <span>
                          {total > 0
                            ? `${Math.round(progress)}%`
                            : formatBytes(downloaded)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={`h-full rounded-full bg-violet-500 transition-[width] ${total === 0 ? "w-1/3 animate-pulse" : ""}`}
                          style={
                            total > 0 ? { width: `${progress}%` } : undefined
                          }
                        />
                      </div>
                      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                        Flux se cerrará y volverá a abrir cuando termine la
                        instalación.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {status === "error" ? (
                <div className="mt-5 rounded-xl border border-rose-300/10 bg-rose-400/[0.06] p-4">
                  <p className="text-xs font-medium text-rose-200">
                    No se pudo comprobar la actualización
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-rose-200/65">
                    {error}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
              {status === "available" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
                  >
                    Más tarde
                  </button>
                  <button
                    type="button"
                    onClick={() => void installUpdate()}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
                  >
                    <Download size={14} /> Instalar ahora
                  </button>
                </>
              ) : null}
              {status === "current" ? (
                <button
                  type="button"
                  onClick={() => void checkForUpdate(true)}
                  className="h-9 rounded-lg border border-white/[0.08] px-4 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
                >
                  Comprobar otra vez
                </button>
              ) : null}
              {status === "error" ? (
                <button
                  type="button"
                  onClick={() => void checkForUpdate(true)}
                  className="h-9 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  Reintentar
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function normalizeUpdaterError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/404|not found/i.test(message))
    return "Aún no existe una release publicada para este canal.";
  if (/network|fetch|dns|connect/i.test(message))
    return "Revisa tu conexión a internet e inténtalo de nuevo.";
  return message || "El servicio de actualizaciones no respondió.";
}

function formatBytes(bytes: number) {
  if (!bytes) return "Preparando…";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}
