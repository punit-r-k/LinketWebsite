export type ThemeName =
  | "light"
  | "dark"
  | "midnight"
  | "dream"
  | "forest"
  | "gilded"
  | "rose"
  | "autumn"
  | "honey"
  | "burnt-orange"
  | "maroon";

export const DEFAULT_DASHBOARD_THEME: ThemeName = "autumn";

const THEME_SET: Set<ThemeName> = new Set([
  "light",
  "dark",
  "midnight",
  "dream",
  "forest",
  "gilded",
  "rose",
  "autumn",
  "honey",
  "burnt-orange",
  "maroon",
]);

const THEME_ALIASES: Record<string, ThemeName> = {
  "burnt orange": "burnt-orange",
  "burnt_orange": "burnt-orange",
  burntorange: "burnt-orange",
  "hook em": "burnt-orange",
  "hook-em": "burnt-orange",
  "hook'em": "burnt-orange",
  hookem: "burnt-orange",
  aggie: "maroon",
  aggies: "maroon",
  "texas a&m": "maroon",
  "texas am": "maroon",
  "texas-am": "maroon",
  texasam: "maroon",
};

const DARK_SET: Set<ThemeName> = new Set([
  "dark",
  "midnight",
  "forest",
  "gilded",
]);

function resolveThemeName(
  value: string | ThemeName | null | undefined
): ThemeName | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (THEME_SET.has(trimmed as ThemeName)) return trimmed as ThemeName;

  const aliasKey = trimmed
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return THEME_ALIASES[aliasKey] ?? null;
}

export function normalizeThemeName(
  value: string | ThemeName | null | undefined,
  fallback: ThemeName = DEFAULT_DASHBOARD_THEME
): ThemeName {
  return resolveThemeName(value) ?? fallback;
}

export function coerceThemeName(
  value: string | ThemeName | null | undefined
): ThemeName | null {
  return resolveThemeName(value);
}

export function isDarkTheme(name: ThemeName) {
  return DARK_SET.has(name);
}
