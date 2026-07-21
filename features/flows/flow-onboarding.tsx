"use client";

import {
  ArrowLeft,
  ArrowRight,
  Braces,
  CircleCheck,
  Link2,
  ListPlus,
  Play,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type Step = {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  visual: ReactNode;
};

const STEPS: Step[] = [
  {
    eyebrow: "Bienvenido a Flow",
    title: "Convierte requests sueltas en procesos completos",
    description:
      "Flow ejecuta varias peticiones en el orden que tú defines y mueve datos entre ellas automáticamente.",
    detail: "Ideal para login, creación de recursos, validaciones y pruebas de APIs de principio a fin.",
    visual: <FlowSequence />,
  },
  {
    eyebrow: "Paso 1 · Organiza",
    title: "Crea un flujo para cada recorrido",
    description:
      "Usa el selector superior para cambiar de flujo. El botón + crea uno nuevo y Renombrar te ayuda a mantenerlos claros.",
    detail: "Un buen nombre describe el resultado: “Login y perfil” o “Crear pedido”.",
    visual: (
      <div className="flex items-center gap-2 rounded-xl border border-violet-300/15 bg-black/20 p-3">
        <Workflow size={15} className="text-violet-300" />
        <div className="flex h-9 flex-1 items-center rounded-lg border border-violet-300/20 bg-[#171024] px-3 text-xs text-white">
          Login y perfil
        </div>
        <div className="grid size-9 place-items-center rounded-lg bg-violet-500/20 text-violet-200">+</div>
      </div>
    ),
  },
  {
    eyebrow: "Paso 2 · Construye",
    title: "Añade tus requests como nodos",
    description:
      "Pulsa Añadir nodo y elige una request guardada. Cada tarjeta muestra el método, el nombre y sus extracciones.",
    detail: "Puedes mover los nodos libremente para que el recorrido sea fácil de leer.",
    visual: (
      <div className="grid grid-cols-[auto_1fr] items-center gap-4">
        <div className="grid size-11 place-items-center rounded-xl border border-violet-300/20 bg-violet-500/12 text-violet-200">
          <ListPlus size={19} />
        </div>
        <FlowNode method="POST" name="Iniciar sesión" caption="1 extracción" />
      </div>
    ),
  },
  {
    eyebrow: "Paso 3 · Conecta",
    title: "Une los nodos para definir el orden",
    description:
      "Arrastra desde el punto derecho de un nodo hasta el punto izquierdo del siguiente. La conexión marca qué request se ejecuta después.",
    detail: "Flow detecta ciclos y evita ejecutar recorridos que no tengan un orden válido.",
    visual: <FlowSequence emphasized />,
  },
  {
    eyebrow: "Paso 4 · Comparte datos",
    title: "Extrae valores de una respuesta",
    description:
      "Selecciona un nodo y añade una extracción en el panel lateral. Define la ruta del JSON y el nombre de la variable.",
    detail: "Después usa {{TOKEN}} en la URL, headers, auth o body de cualquier nodo siguiente.",
    visual: (
      <div className="grid gap-2 rounded-xl border border-violet-300/15 bg-black/20 p-3 font-mono text-[11px]">
        <div className="flex items-center gap-2 text-muted-foreground"><Braces size={14} className="text-violet-300" /> Respuesta JSON</div>
        <div className="rounded-lg bg-[#0d0818] px-3 py-2 text-sky-200">data.token <span className="text-muted-foreground">→</span> <span className="text-violet-200">TOKEN</span></div>
        <div className="px-1 text-muted-foreground">Authorization: Bearer <span className="text-emerald-300">{"{{TOKEN}}"}</span></div>
      </div>
    ),
  },
  {
    eyebrow: "Paso 5 · Ejecuta",
    title: "Guarda y observa cada resultado",
    description:
      "Guardar conserva el lienzo. Ejecutar recorre los nodos en orden y marca cada uno mientras trabaja.",
    detail: "Verde significa éxito; rojo señala exactamente dónde se detuvo el flujo para que puedas inspeccionarlo.",
    visual: (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-300/15 bg-black/20 p-3">
        <div className="flex items-center gap-2 text-xs text-emerald-300"><CircleCheck size={17} /> 3 requests completadas</div>
        <div className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white"><Play size={14} /> Ejecutar</div>
      </div>
    ),
  },
];

export function FlowOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    const resetTimer = window.setTimeout(() => setStep(0), 0);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-[#07040e]/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="flow-onboarding-title">
      <section className="relative w-full max-w-[720px] overflow-hidden rounded-2xl border border-violet-200/15 bg-[#130d22] shadow-[0_32px_100px_rgba(0,0,0,.7),0_0_80px_rgba(124,60,255,.12)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />
        <button type="button" onClick={onClose} aria-label="Cerrar guía de Flow" className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white"><X size={15} /></button>

        <div className="grid min-h-[430px] grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1">
          <aside className="flex flex-col border-r border-white/[0.06] bg-[#0d0818]/65 p-5 max-md:border-r-0 max-md:border-b">
            <div className="flex items-center gap-2 text-xs font-semibold text-white"><span className="grid size-8 place-items-center rounded-lg bg-violet-500/15 text-violet-300"><Workflow size={16} /></span> Guía de Flow</div>
            <div className="mt-8 space-y-1 max-md:mt-4 max-md:flex max-md:gap-1 max-md:space-y-0">
              {STEPS.map((item, index) => (
                <button key={item.eyebrow} type="button" onClick={() => setStep(index)} aria-label={`Ir al paso ${index + 1}`} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[10px] transition-colors max-md:block max-md:h-1.5 max-md:flex-1 max-md:p-0 ${index === step ? "bg-violet-500/12 text-violet-200 max-md:bg-violet-400" : index < step ? "text-white/55 max-md:bg-violet-500/35" : "text-muted-foreground max-md:bg-white/[0.07]"}`}>
                  <span className="grid size-5 shrink-0 place-items-center rounded-md border border-current/20 max-md:hidden">{index + 1}</span>
                  <span className="max-md:hidden">{index === 0 ? "Introducción" : item.eyebrow.split(" · ")[1]}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="mt-auto self-start px-2 text-[10px] text-muted-foreground hover:text-white max-md:hidden">Saltar guía</button>
          </aside>

          <div className="flex min-w-0 flex-col p-8 max-sm:p-5">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-violet-300 uppercase">{current.eyebrow}</p>
            <h2 id="flow-onboarding-title" className="mt-3 max-w-lg font-sans text-2xl font-semibold tracking-[-0.03em] text-white max-sm:text-xl">{current.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">{current.description}</p>
            <div className="my-6">{current.visual}</div>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-violet-400" />{current.detail}</p>

            <div className="mt-auto flex items-center justify-between gap-3 pt-7">
              <span className="text-[10px] text-muted-foreground">{step + 1} de {STEPS.length}</span>
              <div className="flex items-center gap-2">
                {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"><ArrowLeft size={13} /> Atrás</button> : null}
                <button type="button" autoFocus onClick={() => last ? onClose() : setStep((value) => value + 1)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500">
                  {last ? "Empezar a crear" : "Siguiente"}{last ? <CircleCheck size={14} /> : <ArrowRight size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlowNode({ method, name, caption }: { method: string; name: string; caption: string }) {
  return <div className="relative rounded-xl border border-violet-300/20 bg-[#181126] px-3 py-3 shadow-lg shadow-black/25"><span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-violet-400" /><span className="absolute top-1/2 -right-1 size-2 -translate-y-1/2 rounded-full bg-violet-400" /><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-bold text-emerald-300">{method}</span><span className="truncate text-xs text-white">{name}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{caption}</p></div>;
}

function FlowSequence({ emphasized = false }: { emphasized?: boolean }) {
  return <div className="grid grid-cols-[1fr_54px_1fr] items-center"><FlowNode method="POST" name="Login" caption="Extrae TOKEN" /><div className="relative h-px bg-violet-300/35"><Link2 size={15} className={`absolute top-1/2 left-1/2 -translate-1/2 ${emphasized ? "text-violet-200" : "text-violet-300/60"}`} /></div><FlowNode method="GET" name="Mi perfil" caption="Usa {{TOKEN}}" /></div>;
}
