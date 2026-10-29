"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheck,
  Info,
  TriangleAlert,
  CircleX,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(callback: () => void) {
  window.addEventListener("flux-theme-change", callback);
  return () => window.removeEventListener("flux-theme-change", callback);
}

export function Toaster({
  className,
  style,
  toastOptions,
  icons,
  ...props
}: ToasterProps) {
  const theme = useSyncExternalStore<"light" | "dark">(
    subscribe,
    () =>
      document.documentElement.dataset.fluxTheme === "day" ? "light" : "dark",
    () => "dark",
  );
  return (
    <Sonner
      theme={theme}
      className={cn("fx-toaster", className)}
      containerAriaLabel="Notificaciones"
      icons={{
        success: <CircleCheck size={18} />,
        info: <Info size={18} />,
        warning: <TriangleAlert size={18} />,
        error: <CircleX size={18} />,
        loading: <LoaderCircle size={18} className="animate-spin" />,
        ...icons,
      }}
      style={
        {
          "--normal-bg": "var(--flux-raised)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "16px",
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("fx-toast", toastOptions?.classNames?.toast),
        },
      }}
      {...props}
    />
  );
}
