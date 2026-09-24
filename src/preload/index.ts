import { contextBridge } from "electron";
import { APP_NAME, APP_VERSION } from "../shared/constants";
import { createDesktopApi } from "./api";

contextBridge.exposeInMainWorld("stm32", createDesktopApi());

export const preloadMetadata = {
  name: APP_NAME,
  version: APP_VERSION
};
