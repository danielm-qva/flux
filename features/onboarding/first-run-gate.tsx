"use client";

import { ArrowRight, Braces, LoaderCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PublicNavbar } from "@/components/app-shell/public-navbar";
import { AuthDialog } from "@/features/auth/auth-dialog";
import {
  clearSession,
  restoreSession,
  type AuthUser,
} from "@/features/auth/auth-client";
import { AuthenticatedShell } from "@/features/workspaces/authenticated-shell";
import { ThemeRuntime } from "@/features/settings/settings-view";
import { completeOnboarding, hasCompletedOnboarding } from "./first-run-store";

type LaunchState = "loading" | "first-run" | "ready";

export function FirstRunGate() {
  const [state, setState] = useState<LaunchState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([hasCompletedOnboarding(), restoreSession()]).then(
      ([completed, restoredUser]) => {
        if (active) {
          setUser(restoredUser);
          setState(completed ? "ready" : "first-run");
        }
      },
    );
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
  if (state !== "loading" && user)
    return <AuthenticatedShell user={user} onLogout={handleLogout} />;
  return (
    <div className="fx-welcome-page">
      <ThemeRuntime />
      <PublicNavbar
        user={user}
        authOpen={authOpen}
        onOpenAuth={() => setAuthOpen((open) => !open)}
        onLogout={handleLogout}
      />
      <main id="main-content" className="fx-welcome-main">
        {state === "loading" ? (
          <div role="status" className="fx-launch-loader">
            <LoaderCircle className="animate-spin" size={24} />
            Preparando Flux…
          </div>
        ) : null}
        {state === "first-run" ? <WelcomeView onStart={handleStart} /> : null}
        {state === "ready" ? (
          <ReadyView onOpenAuth={() => setAuthOpen(true)} />
        ) : null}
      </main>
      <footer className="fx-welcome-footer">
        <span>Flux</span>
        <span>Tu espacio para trabajar con APIs.</span>
      </footer>
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={setUser}
      />
    </div>
  );
}

function WelcomeView({ onStart }: { onStart: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function start() {
    setSaving(true);
    try {
      await onStart();
    } catch {
      toast.error("No se pudo abrir Flux", {
        description: "Inténtalo de nuevo.",
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="fx-welcome-hero">
      <span className="fx-welcome-mark" aria-hidden="true">
        fx
      </span>
      <span className="fx-welcome-eyebrow">
        <span />
        Bienvenido a Flux
      </span>
      <h1>
        Tus APIs,
        <br className="fx-welcome-break" /> sin el ruido.
      </h1>
      <p className="fx-welcome-description">
        Un espacio local para crear, enviar y entender tus peticiones. Todo lo
        que necesitas, con la velocidad de una herramienta nativa.
      </p>
      <div className="fx-welcome-features">
        <span>
          <Send size={14} aria-hidden="true" />
          Peticiones rápidas
        </span>
        <span>
          <Braces size={14} aria-hidden="true" />
          Datos locales
        </span>
      </div>
      <button className="fx-welcome-cta" onClick={start} disabled={saving}>
        {saving ? <LoaderCircle size={16} className="animate-spin" /> : null}
        {saving ? "Abriendo…" : "Abrir Flux"}
        {!saving && <ArrowRight size={16} aria-hidden="true" />}
      </button>
      <p className="fx-welcome-note">
        Tus colecciones y preferencias permanecen en este equipo.
      </p>
    </section>
  );
}

function ReadyView({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <section className="fx-welcome-hero">
      <span className="fx-welcome-mark" aria-hidden="true">
        fx
      </span>
      <span className="fx-welcome-eyebrow">
        <span />
        Workspace local
      </span>
      <h1>
        Tu próxima petición
        <br /> empieza aquí.
      </h1>
      <p className="fx-welcome-description">
        Inicia sesión o crea una cuenta local para organizar tus colecciones,
        peticiones y entornos.
      </p>
      <button className="fx-welcome-cta" onClick={onOpenAuth}>
        Entrar o registrarme
        <ArrowRight size={16} aria-hidden="true" />
      </button>
      <p className="fx-welcome-note">
        Tu cuenta y tus datos se guardan en este equipo.
      </p>
    </section>
  );
}
