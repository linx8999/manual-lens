import type { DesktopApi } from "../../preload/api";

declare global {
  interface Window {
    stm32: DesktopApi;
  }
}

export {};
