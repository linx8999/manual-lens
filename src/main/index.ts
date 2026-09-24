import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  safeStorage,
  shell
} from "electron";
import { dirname, join } from "node:path";
import { APP_ID, APP_NAME, DATA_FOLDER_NAME } from "../shared/constants";
import type {
  DataLocationChangeResult,
  DataLocationChoice,
  ThemeName
} from "../shared/types";
import {
  dataRootFromSelection,
  migrateDataRoot,
  readDataRootPointerSync
} from "./config/data-location";
import { AppServices } from "./services/app-services";
import { registerIpcHandlers } from "./ipc/register-handlers";

const dataLocationPointerPath = join(
  process.env.APPDATA || app.getPath("appData"),
  APP_ID,
  "data-location.json"
);
// Per-user default (documents/STM32RAG知识库); never a machine-specific path.
const defaultDataRoot =
  process.env.STM32_RAG_DEFAULT_DATA_ROOT ||
  join(app.getPath("documents"), DATA_FOLDER_NAME);
const dataRoot =
  process.env.STM32_RAG_DATA_ROOT ||
  readDataRootPointerSync(dataLocationPointerPath, defaultDataRoot);
let services: AppServices | null = null;
let windowTheme: ThemeName = "blue";

const WINDOW_BACKGROUND: Record<ThemeName, string> = {
  obsidian: "#000000",
  blue: "#f1f5fa",
  white: "#f6f7f9"
};

app.setPath("userData", join(dataRoot, "app-state"));

/**
 * Windows paints the native title bar from the app theme, so switching to the
 * obsidian palette also darkens the window chrome.
 */
function applyWindowTheme(theme: ThemeName): void {
  windowTheme = theme;
  nativeTheme.themeSource = theme === "obsidian" ? "dark" : "light";
  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(WINDOW_BACKGROUND[theme]);
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    title: APP_NAME,
    backgroundColor: WINDOW_BACKGROUND[windowTheme],
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.setAppUserModelId(APP_ID);

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    services = await AppServices.create({
      dataRoot,
      secretCipher: {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (value) => safeStorage.encryptString(value),
        decryptString: (value) => safeStorage.decryptString(value)
      }
    });
    applyWindowTheme((await services.settings.get()).theme);
    registerIpcHandlers({
      ipcMain,
      services,
      getWindow: () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null,
      showOpenDialog: (options) => dialog.showOpenDialog(options),
      chooseDataLocation: () => chooseDataLocation(dataRoot),
      changeDataLocation: (parentDirectory) =>
        changeDataLocation(parentDirectory, dataRoot, dataLocationPointerPath),
      applyTheme: (theme) => applyWindowTheme(theme)
    });
    const window = createWindow();
    window.webContents.once("did-finish-load", () => {
      const manifestPath = app.isPackaged
        ? join(process.resourcesPath, "library-manifest.json")
        : join(process.cwd(), "resources", "library-manifest.json");
      void services?.seedIfNeeded(manifestPath).catch((error) => {
        console.error("Seed library failed:", error);
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      `${APP_NAME} 无法启动`,
      `无法初始化知识库。\n\n${message}\n\n请检查存放目录权限或设置 STM32_RAG_DATA_ROOT。`
    );
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  services?.close();
  services = null;
});

async function chooseDataLocation(
  currentDataRoot: string
): Promise<DataLocationChoice | null> {
  const result = await dialog.showOpenDialog({
    title: "选择资料库存放文件夹",
    defaultPath: dirname(currentDataRoot),
    properties: ["openDirectory", "createDirectory"]
  });
  const parentDirectory = result.filePaths[0];
  if (result.canceled || !parentDirectory) {
    return null;
  }
  return {
    currentDataRoot,
    parentDirectory,
    targetDataRoot: dataRootFromSelection(parentDirectory)
  };
}

async function changeDataLocation(
  parentDirectory: string,
  currentDataRoot: string,
  pointerPath: string
): Promise<DataLocationChangeResult> {
  if (!services) {
    throw new Error("知识库服务尚未启动。");
  }

  services.database.save();
  const result = await migrateDataRoot({
    currentDataRoot,
    parentDirectory,
    pointerPath
  });
  services.close();
  services = null;

  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 350);

  return {
    dataRoot: result.dataRoot,
    restarting: true
  };
}
