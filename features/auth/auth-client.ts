import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthMode = "login" | "register";

const SESSION_KEY = "auth.user";
const STORE_FILE = "flux-state.json";

async function getStore() {
  return Store.load(STORE_FILE, { autoSave: true, defaults: {} });
}

export async function authenticate(
  mode: AuthMode,
  values: { name?: string; email: string; password: string },
): Promise<AuthUser> {
  try {
    const user = await invoke<AuthUser>(mode === "login" ? "login_user" : "register_user", {
      input: values,
    });
    const store = await getStore();
    await store.set(SESSION_KEY, user);
    await store.save();
    return user;
  } catch (error) {
    if (typeof error === "string") throw new Error(error);
    throw new Error("La autenticación local solo está disponible dentro de la app de escritorio.");
  }
}

export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const store = await getStore();
    return (await store.get<AuthUser>(SESSION_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const store = await getStore();
    await store.delete(SESSION_KEY);
    await store.save();
  } catch {
    // A missing desktop store already represents a signed-out session.
  }
}
