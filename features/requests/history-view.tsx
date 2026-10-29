"use client";

import { useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { JsonTree } from "./json-tree";
import type { RequestHistoryEntry } from "./request-client";

export function HistoryView({
  history,
  onRepeat,
  onClear,
}: {
  history: RequestHistoryEntry[];
  onRepeat: (entry: RequestHistoryEntry) => void;
  onClear: () => Promise<void>;
}) {
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const visible = history.filter(
    (entry) =>
      filter === "all" ||
      (filter === "error"
        ? entry.error || (entry.status ?? 0) >= 400
        : !entry.error && entry.status !== null && entry.status < 400),
  );
  const selected =
    visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const groups = new Map<string, RequestHistoryEntry[]>();
  for (const entry of visible) {
    const date = new Date(entry.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const day = date.toDateString() === today.toDateString() ? "Hoy" : date.toDateString() === yesterday.toDateString() ? "Ayer" : date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
    groups.set(day, [...(groups.get(day) ?? []), entry]);
  }
  return (
    <section className="fx-history">
      <div className="fx-history-toolbar">
        <div
          className="fx-segments"
          role="group"
          aria-label="Filtrar historial"
        >
          {[
            ["all", "Todo"],
            ["ok", "Correctas"],
            ["error", "Con error"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label} {id === "all" && history.length}
            </button>
          ))}
        </div>
        <button
          className="fx-quiet-button"
          disabled={clearing || !history.length}
          onClick={async () => {
            setClearing(true);
            try {
              await onClear();
            } finally {
              setClearing(false);
            }
          }}
        >
          {clearing ? "Limpiando…" : "Limpiar"}
        </button>
      </div>
      {!visible.length ? (
        <div className="fx-empty">
          <Clock3 size={24} />
          <h2>
            {history.length ? "Sin resultados" : "Tu historial empieza aquí"}
          </h2>
          <p>Las peticiones que envíes aparecerán en esta vista.</p>
        </div>
      ) : (
        <div className="fx-history-columns">
          <div className="fx-history-list">
            {Array.from(groups, ([day, entries]) => (
              <div key={day}>
                <h2 className="fx-group-label">{day}</h2>
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    className={`fx-history-row ${selected?.id === entry.id ? "is-on" : ""}`}
                    aria-pressed={selected?.id === entry.id}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <time className="fx-history-time" dateTime={entry.createdAt}>
                      {new Date(entry.createdAt).toLocaleTimeString("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </time>
                    <span
                      className={`fx-history-method fx-method fx-method-${entry.method.toLowerCase()}`}
                    >
                      {entry.method}
                    </span>
                    <span className="fx-history-url" title={entry.resolvedUrl}>
                      {entry.resolvedUrl}
                    </span>
                    <span
                      className={`fx-history-status fx-status ${entry.status === null || entry.status >= 500 ? "is-server-error" : entry.status >= 400 ? "is-error" : entry.status >= 300 ? "is-redirect" : "is-ok"}`}
                    >
                      <strong>{entry.status ?? "Error"}</strong>
                      <span>{entry.statusText || (entry.error ? "Error de conexión" : "")}</span>
                    </span>
                    <span className="fx-history-duration">{entry.durationMs === null ? "—" : `${entry.durationMs} ms`}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          {selected && (
            <div className="fx-history-detail">
              <div className="fx-history-detail-heading">
                <span
                  className={`fx-method fx-method-${selected.method.toLowerCase()}`}
                >
                  {selected.method}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selected.status} {selected.statusText} ·{" "}
                  {selected.durationMs ?? 0} ms
                </span>
                <button
                  className="fx-quiet-button"
                  onClick={() => onRepeat(selected)}
                >
                  <RotateCcw size={14} /> Abrir petición
                </button>
              </div>
              <p className="my-5 break-all font-mono text-xs text-muted-foreground">
                {selected.resolvedUrl}
              </p>
              {selected.error ? (
                <p role="alert">{selected.error}</p>
              ) : (
                <JsonTree source={selected.responseBody} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
