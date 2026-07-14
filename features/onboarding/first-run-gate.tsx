"use client";

import Image from "next/image";
import { ArrowRight, Braces, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { PublicNavbar } from "@/components/app-shell/public-navbar";
import { AuthDialog } from "@/features/auth/auth-dialog";
import { clearSession, restoreSession, type AuthUser } from "@/features/auth/auth-client";
import { AuthenticatedShell } from "@/features/workspaces/authenticated-shell";
import { completeOnboarding, hasCompletedOnboarding } from "./first-run-store";

type LaunchState = "loading" | "first-run" | "ready";

export function FirstRunGate() {
  const [state, setState] = useState<LaunchState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([hasCompletedOnboarding(), restoreSession()]).then(([completed, restoredUser]) => {
      if (active) {
        setUser(restoredUser);
        setState(completed ? "ready" : "first-run");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleStart() {
    await completeOnboarding();
    setState("ready");
  }

  async function handleLogout() {
    await clearSession();
    setUser(null);
  }

  if (state !== "loading" && user) {
    return <AuthenticatedShell user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar
        user={user}
        authOpen={authOpen}
        onOpenAuth={() => setAuthOpen((open) => !open)}
        onLogout={handleLogout}
      />
      <main id="main-content" className="relative flex flex-1 items-center justify-center px-6 py-12 sm:py-16">
        {state === "loading" ? <LaunchLoader /> : null}
        {state === "first-run" ? <WelcomeView onStart={handleStart} /> : null}
        {state === "ready" ? <ReadyView user={user} onOpenAuth={() => setAuthOpen(true)} /> : null}
      </main>
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={setUser}
      />
    </div>
  );
}

function LaunchLoader() {
  return (
    <div role="status" className="flex flex-col items-center gap-4 text-sm text-muted-foreground">
      <span className="size-8 animate-spin rounded-full border-2 border-violet-300/15 border-t-violet-400" />
      Preparando Flux…
    </div>
  );
}

function WelcomeView({ onStart }: { onStart: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function start() {
    setSaving(true);
    await onStart();
  }

  return (
    <section className="relative flex w-full max-w-2xl flex-col items-center text-center">
      <div className="pointer-events-none absolute top-7 -z-10 h-52 w-52 rounded-full bg-violet-600/20 blur-[80px]" />
      <Image
        src="/flux-icon.png"
        alt="Flux"
        width={82}
        height={82}
        priority
        className="mb-8 drop-shadow-[0_0_32px_rgba(124,60,255,0.48)]"
      />
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-300/[0.06] px-3 py-1.5 text-[11px] tracking-[0.18em] text-violet-200/80 uppercase">
        <Sparkles aria-hidden="true" size={13} />
        Primera ejecución
      </div>
      <h1 className="max-w-xl font-sans text-4xl font-semibold tracking-[-0.055em] text-white sm:text-6xl">
        Tus APIs, sin el ruido.
      </h1>
      <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
        Flux es un workspace local para crear, enviar y entender requests con la velocidad de una herramienta nativa.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-2.5 text-xs text-violet-100/70">
        <span className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
          <Send aria-hidden="true" size={14} /> Requests rápidas
        </span>
        <span className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
          <Braces aria-hidden="true" size={14} /> Datos locales
        </span>
      </div>

      <button
        type="button"
        onClick={start}
        disabled={saving}
        className="group mt-9 inline-flex h-11 items-center gap-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 text-sm font-semibold text-white shadow-[0_12px_38px_rgba(101,50,205,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(101,50,205,0.42)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:pointer-events-none disabled:opacity-60 motion-reduce:transform-none"
      >
        {saving ? "Guardando…" : "Abrir Flux"}
        <ArrowRight aria-hidden="true" size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
      <p className="mt-4 text-[11px] text-muted-foreground/60">
        Tus colecciones y preferencias permanecen en este equipo.
      </p>
    </section>
  );
}

function ReadyView({ user, onOpenAuth }: { user: AuthUser | null; onOpenAuth: () => void }) {
  return (
    <section className="flex max-w-xl flex-col items-center text-center">
      <span className="mb-5 text-xs tracking-[0.2em] text-violet-300/70 uppercase">
        {user ? `Sesión local · ${user.name}` : "Workspace local"}
      </span>
      <h1 className="font-sans text-3xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">
        Tu próxima request empieza aquí.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
        {user
          ? "Tu cuenta está conectada a la base SQLite local. Ya podemos empezar a guardar colecciones y requests."
          : "Crea una cuenta local o inicia sesión para asociar tus próximas colecciones y requests."}
      </p>
      {!user ? (
        <button
          type="button"
          onClick={onOpenAuth}
          className="mt-7 h-10 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          Entrar o registrarme
        </button>
      ) : null}
    </section>
  );
}
