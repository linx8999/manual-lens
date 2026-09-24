import { useStore } from "zustand";
import { createAppStore, type AppState } from "./state/app-store";

export const appStore = createAppStore(window.stm32);

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
