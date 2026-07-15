"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { RELEASE_NOTES } from "./release-notes";

const SEEN_VERSION_KEY = "flux.release-notes.seen-version";

export function WhatsNewModal({ currentVersion }: { currentVersion: string | null }) {
  const [open, setOpen] = useState(false);
  const notes = currentVersion ? RELEASE_NOTES[currentVersion] : undefined;

  useEffect(() => {
    if (!currentVersion || !RELEASE_NOTES[currentVersion]) return;
    const timer = window.setTimeout(() => {
      if (window.localStorage.getItem(SEEN_VERSION_KEY) !== currentVersion) {
        setOpen(true);
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [currentVersion]);

  function close() {
    if (currentVersion) window.localStorage.setItem(SEEN_VERSION_KEY, currentVersion);
    setOpen(false);
  }

  if (!open || !notes) return null;

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-violet-300/15 bg-[#151020] shadow-[0_28px_90px_rgba(0,0,0,.7)]">
        <div className="relative overflow-hidden border-b border-white/[0.06] px-6 py-6">
          <div className="absolute -top-16 -right-12 size-44 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-violet-300/15 bg-violet-500/10 text-violet-300"><Sparkles size={19} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] tracking-[0.18em] text-violet-300 uppercase">Actualización instalada · v{notes.version}</p>
              <h2 id="whats-new-title" className="mt-2 text-xl font-semibold text-white">{notes.title}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{notes.summary}</p>
            </div>
            <button type="button" onClick={close} aria-label="Cerrar novedades" className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white"><X size={15} /></button>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="mb-3 text-[9px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Qué cambió</p>
          <ul className="space-y-2.5">
            {notes.changes.map((change) => <li key={change} className="flex gap-3 text-xs leading-5 text-slate-300"><span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-violet-500/12 text-violet-300"><Check size={10} /></span>{change}</li>)}
          </ul>
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">
          <p className="text-[10px] text-muted-foreground">Estas novedades solo se muestran una vez.</p>
          <button type="button" onClick={close} className="h-9 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500">Entendido</button>
        </div>
      </section>
    </div>
  );
}
