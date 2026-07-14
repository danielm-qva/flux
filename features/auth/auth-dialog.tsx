"use client";

import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, UserRound, X } from "lucide-react";
import { FormEvent, useState } from "react";

import { authenticate, type AuthMode, type AuthUser } from "./auth-client";

type AuthDialogProps = {
  open: boolean;
  initialMode?: AuthMode;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
};

export function AuthDialog({ open, initialMode = "login", onClose, onAuthenticated }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    setMode(initialMode);
    setError(null);
    setShowPassword(false);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const values = {
      name: mode === "register" ? String(data.get("name") ?? "").trim() : undefined,
      email: String(data.get("email") ?? "").trim(),
      password,
    };

    if (mode === "register" && password !== String(data.get("confirmPassword") ?? "")) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    try {
      const user = await authenticate(mode, values);
      onAuthenticated(user);
      close();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo completar la operación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-[82px] bottom-0 z-50 grid place-items-center overflow-y-auto bg-[#07040e]/78 px-4 py-5 backdrop-blur-md"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        className="relative w-full max-w-[410px] overflow-hidden rounded-2xl border border-violet-200/10 bg-[#130d22]/95 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_70px_rgba(91,34,214,0.12)] sm:p-8"
      >
        <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full bg-violet-600/20 blur-[70px]" />
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" size={17} />
        </button>

        <div className="relative">
          <p className="mb-2 text-[10px] tracking-[0.22em] text-violet-300/65 uppercase">Cuenta local</p>
          <h2 id="auth-title" className="font-sans text-2xl font-semibold tracking-[-0.04em] text-white">
            {mode === "login" ? "Vuelve a tu workspace" : "Crea tu acceso a Flux"}
          </h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {mode === "login"
              ? "Tus datos permanecen en este equipo."
              : "La cuenta y sus datos se guardan únicamente en tu PC."}
          </p>
        </div>

        <form onSubmit={submit} className="relative mt-6 space-y-4">
          {mode === "register" ? (
            <AuthField icon={<UserRound size={15} />} label="Nombre" name="name" autoComplete="name" minLength={2} />
          ) : null}
          <AuthField icon={<Mail size={15} />} label="Correo" name="email" type="email" autoComplete="email" />
          <AuthField
            icon={<LockKeyhole size={15} />}
            label="Contraseña"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            action={
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="text-muted-foreground transition hover:text-white"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />
          {mode === "register" ? (
            <AuthField
              icon={<LockKeyhole size={15} />}
              label="Confirmar contraseña"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
            />
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-red-400/15 bg-red-400/[0.07] px-3 py-2.5 text-xs text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(91,34,214,0.25)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" size={16} /> : null}
            {loading ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {mode === "login" ? "¿Primera vez aquí?" : "¿Ya tienes una cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode((current) => (current === "login" ? "register" : "login"));
              setError(null);
            }}
            className="font-medium text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:underline"
          >
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </p>
      </section>
    </div>
  );
}

type AuthFieldProps = {
  icon: React.ReactNode;
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  minLength?: number;
  action?: React.ReactNode;
};

function AuthField({ icon, label, name, type = "text", autoComplete, minLength, action }: AuthFieldProps) {
  return (
    <label className="block text-xs text-violet-100/80">
      <span className="mb-2 block">{label}</span>
      <span className="flex h-10 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-black/15 px-3 text-muted-foreground transition focus-within:border-violet-400/45 focus-within:ring-2 focus-within:ring-violet-500/10">
        <span aria-hidden="true">{icon}</span>
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={name === "password" || name === "confirmPassword" ? 128 : 254}
          required
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-muted-foreground"
        />
        {action}
      </span>
    </label>
  );
}
