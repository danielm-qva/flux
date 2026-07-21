"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import type { SavedRequest } from "@/features/requests/request-client";
import type { FlowExtraction } from "./flow-client";
import type { NodeStatus } from "./flow-runner";

/** Lets nodes read the current requests without storing derived fields in node
 * data (which would force a state sync whenever requests change). */
export const FlowRequestsContext = createContext<Map<string, SavedRequest>>(new Map());

export type RequestNodeData = {
  requestId: string | null;
  extractions: FlowExtraction[];
  status: NodeStatus;
};

export type RequestFlowNode = Node<RequestNodeData, "request">;

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-300",
  POST: "text-amber-300",
  PUT: "text-sky-300",
  PATCH: "text-violet-300",
  DELETE: "text-rose-300",
  HEAD: "text-emerald-200",
  OPTIONS: "text-pink-300",
};

const STATUS_RING: Record<NodeStatus, string> = {
  idle: "border-white/10",
  running: "border-violet-400/60",
  success: "border-emerald-400/50",
  error: "border-rose-400/60",
};

export function RequestFlowNodeView({ data, selected }: NodeProps<RequestFlowNode>) {
  const requestsById = useContext(FlowRequestsContext);
  const request = data.requestId ? requestsById.get(data.requestId) : undefined;
  const invalid = !request;
  const name = request?.name ?? (data.requestId ? "Petición eliminada" : "Sin petición");
  const method = request?.method ?? "";

  return (
    <div
      className={`min-w-[190px] max-w-[240px] rounded-xl border bg-[#150f24] px-3 py-2.5 shadow-lg shadow-black/40 transition-colors ${
        selected ? "border-violet-400/70" : STATUS_RING[data.status]
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-0 !bg-violet-400"
      />
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-[10px] font-bold ${
            METHOD_COLORS[method] ?? "text-violet-200"
          }`}
        >
          {method || "—"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-white">{name}</span>
        <StatusBadge status={data.status} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        {invalid ? (
          <span className="flex items-center gap-1 text-rose-300">
            <AlertTriangle size={11} /> Petición no encontrada
          </span>
        ) : (
          <span>
            {data.extractions.length
              ? `${data.extractions.length} extracción${data.extractions.length > 1 ? "es" : ""}`
              : "Sin extracciones"}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-0 !bg-violet-400"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  if (status === "running")
    return <LoaderCircle size={13} className="shrink-0 animate-spin text-violet-300" />;
  if (status === "success")
    return <CircleCheck size={13} className="shrink-0 text-emerald-400" />;
  if (status === "error") return <CircleX size={13} className="shrink-0 text-rose-400" />;
  return null;
}
