import {
  savedRequestApi,
  requestFolderApi,
  type SavedRequest,
} from "@/features/requests/request-client";
import { workspaceApi, type Workspace } from "./workspace-client";

const SEED_KEY = "flux.sample-seeded";

export function sampleAlreadySeeded(userId: string) {
  try {
    return window.localStorage.getItem(`${SEED_KEY}.${userId}`) === "1";
  } catch {
    return true;
  }
}

function markSeeded(userId: string) {
  try {
    window.localStorage.setItem(`${SEED_KEY}.${userId}`, "1");
  } catch {
    /* sin almacenamiento: se omite */
  }
}

const pair = (id: string, key: string, value: string) => ({ id, enabled: true, key, value });

const SAMPLES: Array<{ name: string; url: string; params: ReturnType<typeof pair>[] }> = [
  {
    name: "Divisas actuales",
    url: "{{BASE_URL}}/v1/latest?base=USD",
    params: [pair("param-1", "base", "USD")],
  },
  {
    name: "Convertir EUR",
    url: "{{BASE_URL}}/v1/latest?base=EUR&symbols=USD,GBP",
    params: [pair("param-1", "base", "EUR"), pair("param-2", "symbols", "USD,GBP")],
  },
  {
    name: "Monedas disponibles",
    url: "{{BASE_URL}}/v1/currencies",
    params: [pair("param-1", "", "")],
  },
];

/** Crea un workspace de ejemplo con una API pública para que la primera ejecución muestre una respuesta real. */
export async function seedSampleWorkspace(userId: string): Promise<Workspace> {
  markSeeded(userId);
  const workspace = await workspaceApi.create(userId, "Primeros pasos");
  const environment = await workspaceApi.createEnvironment(userId, workspace.id, "Demo");
  await workspaceApi.saveVariable(userId, environment.id, "BASE_URL", "https://api.frankfurter.dev");
  const folder = await requestFolderApi.create(userId, workspace.id, "Frankfurter", null);

  for (const sample of SAMPLES) {
    const created = await savedRequestApi.create(userId, workspace.id, sample.name, folder.id);
    const updated: SavedRequest = await savedRequestApi.update(userId, {
      id: created.id,
      name: sample.name,
      method: "GET",
      url: sample.url,
      paramsJson: JSON.stringify(sample.params),
      headersJson: JSON.stringify([pair("header-1", "Accept", "application/json")]),
      authType: "none",
      authJson: JSON.stringify({ token: "", username: "", password: "", apiKeyName: "X-API-Key", apiKeyValue: "" }),
      bodyType: "none",
      body: "",
    });
    void updated;
  }
  return workspace;
}
