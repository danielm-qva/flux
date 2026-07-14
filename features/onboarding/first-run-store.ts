import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "flux-state.json";
const COMPLETED_KEY = "onboarding.completed";
const WEB_FALLBACK_KEY = "flux:onboarding.completed";

async function getDesktopStore() {
  return Store.load(STORE_FILE, { autoSave: true, defaults: {} });
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const store = await getDesktopStore();
    return (await store.get<boolean>(COMPLETED_KEY)) === true;
  } catch {
    return window.localStorage.getItem(WEB_FALLBACK_KEY) === "true";
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    const store = await getDesktopStore();
    await store.set(COMPLETED_KEY, true);
    await store.save();
  } catch {
    window.localStorage.setItem(WEB_FALLBACK_KEY, "true");
  }
}
