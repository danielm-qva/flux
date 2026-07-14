"use client";

import Image from "next/image";
import { History, LogIn, LogOut, Settings, X } from "lucide-react";

import type { AuthUser } from "@/features/auth/auth-client";

const actionClass =
  "grid size-9 place-items-center rounded-lg border border-white/8 bg-white/[0.025] text-muted-foreground transition hover:border-violet-400/25 hover:bg-violet-400/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type PublicNavbarProps = {
  user: AuthUser | null;
  authOpen: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
};

export function PublicNavbar({ user, authOpen, onOpenAuth, onLogout }: PublicNavbarProps) {
  return (
    <header className="sticky top-0 z-[60] shrink-0 border-b border-white/[0.045] bg-[#100a20]/90 backdrop-blur-xl">
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex h-[82px] w-full max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <a
          href="#main-content"
          aria-label="Ir al inicio de Flux"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/flux-icon.png"
            alt=""
            width={34}
            height={34}
            priority
            className="drop-shadow-[0_0_16px_rgba(124,60,255,0.38)]"
          />
          <span className="font-sans text-[15px] font-semibold tracking-[-0.03em] text-white">
            Flux
          </span>
        </a>

        <div className="flex items-center gap-2">
          <button type="button" className={actionClass} aria-label="Ver historial" title="Historial">
            <History aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          <button type="button" className={actionClass} aria-label="Abrir configuración" title="Configuración">
            <Settings aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="ml-1 flex h-9 items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-1.5 pr-3 text-xs font-medium text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Cerrar sesión de ${user.name}`}
              title="Cerrar sesión"
            >
              <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-violet-300 to-violet-500 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(139,92,255,0.35)]">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden max-w-28 truncate sm:inline">{user.name}</span>
              <LogOut aria-hidden="true" size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className={`ml-1 flex h-9 items-center gap-2 rounded-full border px-1.5 pr-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                authOpen
                  ? "border-white/10 bg-white/[0.05] text-muted-foreground hover:bg-white/[0.08] hover:text-white"
                  : "border-violet-300/20 bg-violet-400/10 text-violet-100 hover:border-violet-300/35 hover:bg-violet-400/15"
              }`}
              aria-label={authOpen ? "Cerrar autenticación" : "Iniciar sesión"}
              aria-expanded={authOpen}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-white ${
                  authOpen
                    ? "bg-white/10"
                    : "bg-gradient-to-br from-violet-300 to-violet-500 shadow-[0_0_14px_rgba(139,92,255,0.35)]"
                }`}
              >
                {authOpen ? (
                  <X aria-hidden="true" size={13} strokeWidth={2} />
                ) : (
                  <LogIn aria-hidden="true" size={13} strokeWidth={2} />
                )}
              </span>
              <span className="hidden sm:inline">{authOpen ? "Cerrar" : "Entrar"}</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
