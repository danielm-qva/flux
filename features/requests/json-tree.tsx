"use client";

import { Check, ChevronDown, ChevronRight, Copy, FoldVertical, Search, UnfoldVertical } from "lucide-react";
import { useMemo, useState } from "react";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function JsonTree({ source }: { source: string }) {
  const parsed = useMemo(() => parseJson(source), [source]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState("");
  if (!parsed.ok) return <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-6 text-violet-100">{source || "La respuesta no contiene body."}</pre>;
  const containerPaths = collectContainerPaths(parsed.value);

  async function copy(value: string, marker: string) {
    await navigator.clipboard.writeText(value);
    setCopied(marker);
    window.setTimeout(() => setCopied(""), 1000);
  }

  return <div className="flex h-full min-h-0 flex-col"><div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2"><label className="relative min-w-0 flex-1"><Search size={12} className="absolute top-2.5 left-2.5 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clave o valor…" className="h-8 w-full rounded-md border border-white/[0.06] bg-black/15 pr-2 pl-8 text-[11px] text-white outline-none focus:border-violet-400/40" /></label><button type="button" onClick={() => setCollapsed(new Set())} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white" aria-label="Expandir todo"><UnfoldVertical size={13} /></button><button type="button" onClick={() => setCollapsed(new Set(containerPaths))} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white" aria-label="Contraer todo"><FoldVertical size={13} /></button><button type="button" onClick={() => copy(JSON.stringify(parsed.value, null, 2), "all")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-white" aria-label="Copiar JSON">{copied === "all" ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}</button></div><div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-6"><JsonNode name={null} value={parsed.value} path="$" depth={0} collapsed={collapsed} setCollapsed={setCollapsed} search={search.trim().toLowerCase()} copied={copied} onCopy={copy} /></div></div>;
}

function JsonNode({ name, value, path, depth, collapsed, setCollapsed, search, copied, onCopy }: { name: string | null; value: JsonValue; path: string; depth: number; collapsed: Set<string>; setCollapsed: (value: Set<string>) => void; search: string; copied: string; onCopy: (value: string, marker: string) => void }) {
  if (search && !nodeMatches(name, value, path, search)) return null;
  const container = Array.isArray(value) || (value !== null && typeof value === "object");
  const entries = container ? Object.entries(value as JsonValue[] | Record<string, JsonValue>) : [];
  const isCollapsed = search ? false : collapsed.has(path);
  const prefix = name === null ? null : <><span className="text-sky-300">{JSON.stringify(name)}</span><span className="text-muted-foreground">: </span></>;
  if (!container) return <div className="group flex min-w-max items-center" style={{ paddingLeft: depth * 16 }}><span className="w-4" />{prefix}<Primitive value={value} /><NodeActions path={path} value={value} copied={copied} onCopy={onCopy} /></div>;
  const open = Array.isArray(value) ? "[" : "{";
  const close = Array.isArray(value) ? "]" : "}";
  function toggle() { const next = new Set(collapsed); if (isCollapsed) next.delete(path); else next.add(path); setCollapsed(next); }
  return <div className="min-w-max"><div className="group flex items-center" style={{ paddingLeft: depth * 16 }}><button type="button" onClick={toggle} className="grid size-4 place-items-center text-muted-foreground hover:text-white">{isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>{prefix}<button type="button" onClick={toggle} className="text-violet-300">{open}</button>{isCollapsed ? <button type="button" onClick={toggle} className="ml-1 text-[10px] text-muted-foreground">{entries.length} {Array.isArray(value) ? "items" : "atributos"} {close}</button> : null}<NodeActions path={path} value={value} copied={copied} onCopy={onCopy} /></div>{!isCollapsed ? <>{entries.map(([key, child]) => <JsonNode key={`${path}-${key}`} name={key} value={child} path={Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`} depth={depth + 1} collapsed={collapsed} setCollapsed={setCollapsed} search={search} copied={copied} onCopy={onCopy} />)}<div style={{ paddingLeft: depth * 16 }}><span className="ml-4 text-violet-300">{close}</span></div></> : null}</div>;
}

function NodeActions({ path, value, copied, onCopy }: { path: string; value: JsonValue; copied: string; onCopy: (value: string, marker: string) => void }) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return <span className="ml-2 inline-flex opacity-0 group-hover:opacity-100"><button type="button" onClick={() => onCopy(path, `path:${path}`)} className="rounded px-1.5 text-[9px] text-muted-foreground hover:bg-white/5 hover:text-violet-200">{copied === `path:${path}` ? "Ruta copiada" : "Copiar ruta"}</button><button type="button" onClick={() => onCopy(serialized ?? "null", `value:${path}`)} className="rounded px-1.5 text-[9px] text-muted-foreground hover:bg-white/5 hover:text-violet-200">{copied === `value:${path}` ? "Copiado" : "Copiar valor"}</button></span>;
}

function Primitive({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-rose-300">null</span>;
  if (typeof value === "string") return <span className="text-emerald-300">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="text-amber-300">{value}</span>;
  return <span className="text-fuchsia-300">{String(value)}</span>;
}

function parseJson(source: string): { ok: true; value: JsonValue } | { ok: false } { try { return { ok: true, value: JSON.parse(source) as JsonValue }; } catch { return { ok: false }; } }
function collectContainerPaths(value: JsonValue, path = "$", result: string[] = []): string[] { if (Array.isArray(value) || (value !== null && typeof value === "object")) { result.push(path); Object.entries(value).forEach(([key, child]) => collectContainerPaths(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, result)); } return result; }
function nodeMatches(name: string | null, value: JsonValue, path: string, search: string): boolean { if (`${name ?? ""} ${path}`.toLowerCase().includes(search)) return true; if (Array.isArray(value)) return value.some((child, index) => nodeMatches(String(index), child, `${path}[${index}]`, search)); if (value !== null && typeof value === "object") return Object.entries(value).some(([key, child]) => nodeMatches(key, child, `${path}.${key}`, search)); return String(value).toLowerCase().includes(search); }
