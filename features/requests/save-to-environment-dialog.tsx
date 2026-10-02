"use client";

import { Check, LoaderCircle, Plus, Search } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  workspaceApi,
  type Environment,
  type EnvironmentVariable,
} from "@/features/workspaces/workspace-client";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function SaveToEnvironmentDialog({
  userId,
  workspaceId,
  environments,
  defaultEnvironmentId,
  path,
  value,
  onClose,
  onSaved,
  onEnvironmentCreated,
}: {
  userId: string;
  workspaceId: string;
  environments: Environment[];
  defaultEnvironmentId: string;
  path: string;
  value: string;
  onClose: () => void;
  onSaved: (variable: EnvironmentVariable) => void;
  onEnvironmentCreated: (environment: Environment) => void;
}) {
  const [environmentId, setEnvironmentId] = useState(
    () => defaultEnvironmentId || environments[0]?.id || "",
  );
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [loading, setLoading] = useState(
    () => Boolean(defaultEnvironmentId || environments[0]?.id),
  );
  const [search, setSearch] = useState("");
  const [key, setKey] = useState(() => suggestKey(path));
  const [saving, setSaving] = useState("");
  const [creatingEnvironment, setCreatingEnvironment] = useState(
    () => environments.length === 0,
  );

  function selectEnvironment(id: string) {
    if (id === environmentId) return;
    setEnvironmentId(id);
    setVariables([]);
    setLoading(Boolean(id));
  }

  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    workspaceApi
      .listVariables(userId, environmentId)
      .then((items) => {
        if (active) setVariables(items);
      })
      .catch((cause) => {
        if (!active) return;
        setVariables([]);
        toast.error("No se pudieron cargar las variables", {
          description: String(cause),
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [environmentId, userId]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      variables.filter(
        (variable) =>
          !term ||
          variable.key.toLowerCase().includes(term) ||
          variable.value.toLowerCase().includes(term),
      ),
    [term, variables],
  );
  const environment = environments.find((item) => item.id === environmentId);
  const trimmedKey = key.trim();
  const duplicate = variables.find(
    (variable) => variable.key.toLowerCase() === trimmedKey.toLowerCase(),
  );
  const keyValid = KEY_PATTERN.test(trimmedKey);

  async function save(variableId: string | undefined, variableKey: string) {
    if (!environment) return;
    setSaving(variableId ?? "new");
    try {
      const saved = await workspaceApi.saveVariable(
        userId,
        environment.id,
        variableKey,
        value,
        variableId,
      );
      onSaved(saved);
      toast.success("Environment actualizado", {
        description: variableId
          ? `La variable ${saved.key} se actualizó en ${environment.name}.`
          : `La variable ${saved.key} se añadió a ${environment.name}.`,
      });
      onClose();
    } catch (cause) {
      toast.error("No se pudo guardar la variable", {
        description: String(cause),
      });
    } finally {
      setSaving("");
    }
  }

  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    setSaving("environment");
    try {
      const created = await workspaceApi.createEnvironment(
        userId,
        workspaceId,
        name,
      );
      onEnvironmentCreated(created);
      selectEnvironment(created.id);
      setCreatingEnvironment(false);
      toast.success("Environment creado", { description: created.name });
    } catch (cause) {
      toast.error("No se pudo crear el environment", {
        description: String(cause),
      });
    } finally {
      setSaving("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 px-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-violet-200/10 bg-[#151020] p-6 shadow-2xl">
        <h2 className="font-sans text-xl font-semibold text-white">
          Guardar en environment
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono text-violet-300">{path}</span>
        </p>
        <div className="mt-3 max-h-24 overflow-auto rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2 font-mono text-[11px] break-words whitespace-pre-wrap text-emerald-300">
          {value || "(vacío)"}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {environments.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectEnvironment(item.id)}
              className={`flex h-8 items-center gap-2 rounded-lg border px-3 text-xs ${
                item.id === environmentId
                  ? "border-violet-400/40 bg-violet-500/15 text-white"
                  : "border-white/[0.07] text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCreatingEnvironment((open) => !open)}
            className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-white/[0.12] px-3 text-xs text-muted-foreground hover:border-violet-400/40 hover:text-white"
          >
            <Plus size={12} /> Nuevo environment
          </button>
        </div>

        {creatingEnvironment ? (
          <form onSubmit={createEnvironment} className="mt-3 flex gap-2">
            <input
              name="name"
              required
              minLength={2}
              maxLength={60}
              autoFocus
              placeholder="Nombre del environment"
              className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-violet-400/50"
            />
            <button
              type="submit"
              disabled={saving === "environment"}
              className="h-9 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              Crear
            </button>
          </form>
        ) : null}

        {environment ? (
          <>
            <label className="relative mt-5 block">
              <Search
                size={12}
                className="absolute top-3 left-3 text-muted-foreground"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar variable…"
                className="h-9 w-full rounded-xl border border-white/[0.07] bg-black/20 pr-3 pl-8 text-xs text-white outline-none focus:border-violet-400/50"
              />
            </label>

            <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06]">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                  <LoaderCircle size={13} className="animate-spin" /> Cargando
                  variables…
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {variables.length === 0
                    ? `${environment.name} no tiene variables todavía.`
                    : "Ninguna variable coincide con la búsqueda."}
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {filtered.map((variable) => (
                    <li key={variable.id}>
                      <button
                        type="button"
                        disabled={Boolean(saving)}
                        onClick={() => void save(variable.id, variable.key)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[11px] text-violet-200">
                            {variable.key}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {variable.value || "(vacío)"}
                          </span>
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {saving === variable.id ? (
                            <LoaderCircle size={12} className="animate-spin" />
                          ) : (
                            "Actualizar"
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex items-end gap-2">
              <label className="min-w-0 flex-1 text-xs text-muted-foreground">
                Nueva variable
                <input
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                  placeholder="ACCESS_TOKEN"
                  className="mt-2 h-9 w-full rounded-xl border border-white/10 bg-black/20 px-3 font-mono text-xs text-white outline-none focus:border-violet-400/50"
                />
              </label>
              <button
                type="button"
                disabled={!keyValid || Boolean(saving)}
                onClick={() => void save(duplicate?.id, trimmedKey)}
                className="flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {saving === "new" ? (
                  <LoaderCircle size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                {duplicate ? "Actualizar" : "Crear"}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {trimmedKey && !keyValid
                ? "La clave solo admite letras, números y guion bajo, y no puede empezar con un número."
                : duplicate
                  ? `${duplicate.key} ya existe en ${environment.name}: se actualizará su valor.`
                  : `Se usará como {{${trimmedKey || "CLAVE"}}} en tus requests.`}
            </p>
          </>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">
            Este workspace no tiene environments. Crea uno para guardar el
            valor.
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function suggestKey(path: string) {
  const last = path.split(".").pop() ?? "";
  const name = last.replace(/\[\d+]/g, "");
  if (!name || name === "$") return "";
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}
