"use client";

import { Check, Palette, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { UpdateControl } from "@/features/updater/update-control";
import { WorkspaceTransfer } from "@/features/workspaces/workspace-transfer";
import type { Workspace } from "@/features/workspaces/workspace-client";
import type { WorkspaceImport } from "@/features/workspaces/workspace-transfer-client";

type ThemeId = "ultraviolet" | "arctic" | "amber";
const THEMES: Array<{ id: ThemeId; name: string; description: string; colors: string[] }> = [
  { id: "ultraviolet", name: "Ultravioleta", description: "Ciruela profunda con primary violeta.", colors: ["#0b0715", "#181022", "#7c3cff", "#c4b5fd"] },
  { id: "arctic", name: "Cian Ártico", description: "Azul petróleo con primary cian.", colors: ["#041116", "#0d2a34", "#0891b2", "#67e8f9"] },
  { id: "amber", name: "Ámbar Carbono", description: "Grafito profundo con primary ámbar.", colors: ["#0c0d0f", "#242117", "#d99a24", "#f8d27a"] },
];

export function ThemeRuntime() {
  useEffect(() => {
    const saved = window.localStorage.getItem("flux.color-theme");
    document.documentElement.dataset.fluxTheme = saved === "coral" ? "amber" : THEMES.some((item) => item.id === saved) ? saved! : "ultraviolet";
  }, []);
  return null;
}

export function SettingsView({ currentVersion, userId, workspace, onWorkspaceImported }: { currentVersion: string | null; userId: string; workspace: Workspace | null; onWorkspaceImported: (result: WorkspaceImport) => void }) {
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "ultraviolet";
    const saved = window.localStorage.getItem("flux.color-theme");
    if (saved === "coral") return "amber";
    return THEMES.some((item) => item.id === saved) ? (saved as ThemeId) : "ultraviolet";
  });

  useEffect(() => {
    document.documentElement.dataset.fluxTheme = theme;
    window.localStorage.setItem("flux.color-theme", theme);
  }, [theme]);

  return <section className="mx-auto w-full max-w-4xl self-start py-3">
    <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl border border-violet-300/10 bg-violet-500/10 text-violet-300"><Palette size={18} /></div><div><p className="font-mono text-[9px] tracking-[0.17em] text-violet-300 uppercase">Personalización</p><h1 className="mt-1 text-xl font-semibold text-white">Settings</h1></div></div>
    <p className="mt-4 max-w-xl text-xs leading-5 text-muted-foreground">Ajusta la identidad visual de Flux y administra las actualizaciones de la aplicación.</p>

    <div className="mt-7 rounded-2xl border border-white/[0.07] bg-[#120c1e]/90 p-5">
      <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">Tema de color</h2><p className="mt-1 text-[11px] text-muted-foreground">Cambia el acento sin alterar la legibilidad del editor.</p></div><span className="rounded-full border border-white/[0.07] px-2.5 py-1 text-[9px] text-muted-foreground">Se guarda automáticamente</span></div>
      <div className="mt-5 grid grid-cols-3 gap-3 max-lg:grid-cols-1">{THEMES.map((item) => <button key={item.id} type="button" onClick={() => setTheme(item.id)} className={`relative overflow-hidden rounded-xl border p-4 text-left transition ${theme === item.id ? "border-violet-400/35 bg-violet-500/[0.08]" : "border-white/[0.07] bg-black/10 hover:border-white/15"}`}>
        <span className="flex gap-1.5">{item.colors.map((color) => <span key={color} className="h-6 flex-1 rounded-md" style={{ backgroundColor: color }} />)}</span><span className="mt-4 flex items-center justify-between"><span><span className="block text-xs font-medium text-white">{item.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{item.description}</span></span>{theme === item.id ? <span className="grid size-6 place-items-center rounded-full bg-violet-500 text-white"><Check size={12} /></span> : null}</span>
      </button>)}</div>
    </div>

    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#120c1e]/90 p-5">
      <div className="mb-4"><h2 className="text-sm font-semibold text-white">Portabilidad</h2><p className="mt-1 text-[11px] text-muted-foreground">Mueve un workspace completo entre instalaciones de Flux.</p></div>
      <WorkspaceTransfer userId={userId} workspace={workspace} onImported={onWorkspaceImported}/>
    </div>

    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#120c1e]/90 p-5">
      <div className="mb-4 flex items-center gap-3"><RefreshCw size={15} className="text-violet-300"/><div><h2 className="text-sm font-semibold text-white">Sistema y updates</h2><p className="mt-1 text-[11px] text-muted-foreground">Busca, descarga e instala nuevas versiones firmadas.</p></div></div>
      <UpdateControl currentVersion={currentVersion} variant="panel" autoCheck={false} />
    </div>
  </section>;
}
