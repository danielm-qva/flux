"use client";

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { ArrowLeftRight, Download, FileJson2, LoaderCircle, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Workspace } from "./workspace-client";
import { workspaceTransferApi, type TransferSummary, type WorkspaceImport } from "./workspace-transfer-client";

type Props = { userId: string; workspace: Workspace | null; onImported: (result: WorkspaceImport) => void; variant?: "cards" | "toolbar" };

export function WorkspaceTransfer({ userId, workspace, onImported, variant = "cards" }: Props) {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [preview, setPreview] = useState<TransferSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseImport() {
    try {
      const path = await open({ multiple: false, filters: [{ name: "Flux workspace", extensions: ["json"] }] });
      if (!path || Array.isArray(path)) return;
      const content = await readTextFile(path);
      const summary = await workspaceTransferApi.preview(content);
      setLauncherOpen(false); setImportContent(content); setPreview(summary);
    } catch (cause) { toast.error("No se pudo abrir el workspace", { description: String(cause) }); }
  }

  async function exportWorkspace() {
    if (!workspace) return; setBusy(true);
    try {
      const result = await workspaceTransferApi.export(userId, workspace.id, includeSecrets);
      const path = await save({ defaultPath: result.fileName, filters: [{ name: "Flux workspace", extensions: ["flux.json", "json"] }] });
      if (!path) return;
      await writeTextFile(path, result.content);
      setExportOpen(false);
      toast.success("Workspace exportado", { description: `${result.summary.requests} peticiones y ${result.summary.environments} environments guardados.` });
    } catch (cause) { toast.error("No se pudo exportar", { description: String(cause) }); } finally { setBusy(false); }
  }

  async function importWorkspace() {
    if (!preview) return; setBusy(true);
    try {
      const result = await workspaceTransferApi.import(userId, importContent);
      setPreview(null); setImportContent(""); onImported(result);
      toast.success("Workspace importado", { description: `${result.workspaceName} está listo para usar.` });
    } catch (cause) { toast.error("No se pudo importar", { description: String(cause) }); } finally { setBusy(false); }
  }

  return <>
    {variant === "toolbar" ? (
      <button
        type="button"
        onClick={() => setLauncherOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-violet-300/15 bg-violet-500/[0.08] px-3 text-[11px] font-medium text-violet-100 transition-colors hover:border-violet-300/30 hover:bg-violet-500/15"
      >
        <ArrowLeftRight size={14} />
        <span>Importar / exportar</span>
      </button>
    ) : <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
      <button type="button" disabled={!workspace} onClick={() => setExportOpen(true)} className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-black/15 p-4 text-left hover:border-violet-400/20 hover:bg-violet-500/[0.06] disabled:cursor-not-allowed disabled:opacity-40"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Download size={17}/></span><span><span className="block text-sm font-medium text-white">Exportar workspace</span><span className="mt-1 block text-[10px] text-muted-foreground">Guarda {workspace?.name ?? "el workspace activo"} como .flux.json</span></span></button>
      <button type="button" onClick={() => void chooseImport()} className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-black/15 p-4 text-left hover:border-violet-400/20 hover:bg-violet-500/[0.06]"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Upload size={17}/></span><span><span className="block text-sm font-medium text-white">Importar workspace</span><span className="mt-1 block text-[10px] text-muted-foreground">Crea un workspace nuevo desde un archivo Flux</span></span></button>
    </div>}

    {launcherOpen ? <TransferModal title="Importar o exportar" onClose={() => setLauncherOpen(false)}><p className="mb-4 text-xs leading-5 text-muted-foreground">Mueve un workspace completo entre instalaciones de Flux.</p><div className="grid gap-2"><TransferChoice icon={<Upload size={17}/>} title="Importar workspace" description="Abrir un archivo .flux.json" onClick={() => void chooseImport()}/><TransferChoice icon={<Download size={17}/>} title="Exportar workspace" description={workspace ? `Guardar una copia de ${workspace.name}` : "Selecciona primero un workspace"} disabled={!workspace} onClick={() => { setLauncherOpen(false); setExportOpen(true); }}/></div></TransferModal> : null}

    {exportOpen ? <TransferModal title="Exportar workspace" onClose={() => setExportOpen(false)}><p className="text-xs leading-5 text-muted-foreground">Se incluirán carpetas, peticiones, environments y variables de <strong className="text-white">{workspace?.name}</strong>.</p><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/10 bg-amber-400/[0.05] p-3"><input type="checkbox" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} className="mt-0.5 accent-violet-500"/><span><span className="block text-xs text-amber-100">Incluir valores sensibles</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">Tokens, passwords, API keys y Authorization se vacían por defecto.</span></span></label><ActionButton busy={busy} onClick={() => void exportWorkspace()} label="Elegir ubicación y exportar"/></TransferModal> : null}
    {preview ? <TransferModal title="Importar workspace" onClose={() => { setPreview(null); setImportContent(""); }}><div className="flex items-center gap-3 rounded-xl border border-violet-300/10 bg-violet-500/[0.06] p-3"><FileJson2 size={20} className="text-violet-300"/><div><p className="text-sm font-medium text-white">{preview.workspaceName}</p><p className="mt-1 text-[10px] text-muted-foreground">Se creará como un workspace nuevo</p></div></div><Summary summary={preview}/><ActionButton busy={busy} onClick={() => void importWorkspace()} label="Importar workspace"/></TransferModal> : null}
  </>;
}

function TransferChoice({ icon, title, description, disabled, onClick }: { icon: React.ReactNode; title: string; description: string; disabled?: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="group flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-3 text-left transition-colors hover:border-violet-300/20 hover:bg-violet-500/[0.07] disabled:cursor-not-allowed disabled:opacity-40"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-300 transition-colors group-hover:bg-violet-500/15">{icon}</span><span><span className="block text-sm font-medium text-white">{title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{description}</span></span></button>; }

function Summary({ summary }: { summary: TransferSummary }) { return <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">{[["Carpetas",summary.folders],["Peticiones",summary.requests],["Environments",summary.environments],["Variables",summary.variables]].map(([label,value]) => <div key={String(label)} className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2"><span className="text-muted-foreground">{label}</span><strong className="float-right text-white">{value}</strong></div>)}</div>; }
function ActionButton({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) { return <button type="button" disabled={busy} onClick={onClick} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-60">{busy ? <LoaderCircle size={14} className="animate-spin"/> : null}{label}</button>; }
function TransferModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-2xl border border-violet-200/10 bg-[#151020] p-5 shadow-2xl"><header className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-white">{title}</h2><button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white"><X size={15}/></button></header>{children}</section></div>; }
