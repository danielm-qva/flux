"use client";

import { ArrowRight, LogOut, X } from "lucide-react";
import type { AuthUser } from "@/features/auth/auth-client";
import { ThemePicker } from "@/features/settings/theme-picker";

type PublicNavbarProps = {
  user: AuthUser | null;
  authOpen: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
};

export function PublicNavbar({
  user,
  authOpen,
  onOpenAuth,
  onLogout,
}: PublicNavbarProps) {
  return (
    <header className="fx-public-header">
      <nav aria-label="Navegación principal" className="fx-public-nav">
        <a
          href="#main-content"
          aria-label="Ir al inicio de Flux"
          className="fx-public-brand"
        >
          <span className="fx-public-monogram" aria-hidden="true">
            fx
          </span>
          <span>Flux</span>
        </a>
        <div className="fx-public-actions">
          <ThemePicker />
          {user ? (
            <button
              className="fx-public-login"
              onClick={onLogout}
              aria-label={`Cerrar sesión de ${user.name}`}
            >
              {user.name}
              <LogOut size={15} />
            </button>
          ) : (
            <button
              className="fx-public-login"
              onClick={onOpenAuth}
              aria-expanded={authOpen}
              aria-label={authOpen ? "Cerrar autenticación" : "Iniciar sesión"}
            >
              {authOpen ? "Cerrar" : "Entrar"}
              {authOpen ? <X size={15} /> : <ArrowRight size={15} />}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
