import type { ThemeName } from "./types";

export interface ThemeOption {
  id: ThemeName;
  label: string;
  color: string;
}

export const THEMES: readonly ThemeOption[] = [
  { id: "obsidian", label: "曜石黑", color: "#000000" },
  { id: "blue", label: "蓝白", color: "#0d5fd7" },
  { id: "white", label: "白色", color: "#f4f5f7" }
];

/**
 * Maps persisted theme values onto the current three themes so existing
 * settings files keep working after the palette was reduced.
 */
export function normalizeTheme(value: unknown): ThemeName {
  if (value === "obsidian" || value === "blue" || value === "white") {
    return value;
  }
  if (value === "graphite") {
    return "white";
  }
  return "blue";
}
