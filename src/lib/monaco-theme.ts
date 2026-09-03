import type * as Monaco from "monaco-editor"

/** Studio Monaco theme ids keyed by resolved appearance. */
export const ASPECTED_MONACO_THEMES = {
  light: "aspected-light",
  dark: "aspected-dark",
} as const

/** CSS custom properties read from the document for Monaco chrome. */
export type ThemeColorVars = {
  background: string
  card: string
  foreground: string
  muted: string
  mutedForeground: string
  border: string
  primary: string
  accent: string
}

/**
 * Fixed syntax colors that pair with Studio's purple-leaning light and dark
 * surfaces. Dark `--primary` is a low-lightness fill for buttons, so it must
 * not be reused for token text on a dark card.
 */
const SYNTAX = {
  light: {
    foreground: "18181b",
    string: "5b4fcf",
    number: "52525b",
    keyword: "4c1d95",
    comment: "71717a",
  },
  dark: {
    foreground: "fafafa",
    // Violet-200 / indigo-200 range: readable on --card (~L 0.21).
    string: "ddd6fe",
    number: "c4b5fd",
    keyword: "a5b4fc",
    comment: "a1a1aa",
  },
} as const

/**
 * Parses a CSS color from `getComputedStyle` into a `#rrggbb` hex string.
 *
 * Browsers return `rgb(...)` / `rgba(...)` for custom properties even when the
 * stylesheet authors them as `oklch(...)`. Returns `null` when the value cannot
 * be parsed.
 */
export function cssColorToHex(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.startsWith("#")) {
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase()
    }
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const [, r, g, b] = trimmed
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }
    return null
  }

  const match = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  )
  if (!match) {
    const space = trimmed.match(
      /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)$/i,
    )
    if (!space) {
      return null
    }
    return channelHex(Number(space[1]), Number(space[2]), Number(space[3]))
  }

  return channelHex(Number(match[1]), Number(match[2]), Number(match[3]))
}

function channelHex(r: number, g: number, b: number): string | null {
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null
  }
  const toByte = (channel: number) =>
    Math.min(255, Math.max(0, Math.round(channel)))
      .toString(16)
      .padStart(2, "0")
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

/**
 * Reads Studio theme tokens from the document root as Monaco-ready hex colors.
 *
 * Falls back to neutral light or dark placeholders when a token is missing so
 * theme registration never throws during SSR-less first paint.
 */
export function readThemeColors(
  style: CSSStyleDeclaration = getComputedStyle(document.documentElement),
  fallback: "light" | "dark" = "light",
): ThemeColorVars {
  const defaults = fallback === "dark"
    ? {
      background: "#241f2a",
      card: "#2c2733",
      foreground: "#fafafa",
      muted: "#3a3542",
      mutedForeground: "#a1a1aa",
      border: "#3f3a47",
      primary: "#8b7cf7",
      accent: "#3a3542",
    }
    : {
      background: "#ffffff",
      card: "#ffffff",
      foreground: "#18181b",
      muted: "#f4f4f5",
      mutedForeground: "#71717a",
      border: "#e4e4e7",
      primary: "#5b4fcf",
      accent: "#f4f4f5",
    }

  const read = (name: string, fallbackHex: string) =>
    cssColorToHex(style.getPropertyValue(name)) ?? fallbackHex

  return {
    background: read("--background", defaults.background),
    card: read("--card", defaults.card),
    foreground: read("--foreground", defaults.foreground),
    muted: read("--muted", defaults.muted),
    mutedForeground: read("--muted-foreground", defaults.mutedForeground),
    border: read("--border", defaults.border),
    primary: read("--primary", defaults.primary),
    accent: read("--accent", defaults.accent),
  }
}

/** Monaco theme id for a resolved light or dark appearance. */
export function aspectedMonacoTheme(
  resolved: "light" | "dark",
): string {
  return ASPECTED_MONACO_THEMES[resolved]
}

/** Token rules for one appearance. Exported for contrast-focused unit checks. */
export function syntaxRules(
  mode: "light" | "dark",
): Monaco.editor.ITokenThemeRule[] {
  const tokens = SYNTAX[mode]
  return [
    { token: "", foreground: tokens.foreground },
    { token: "string", foreground: tokens.string },
    { token: "string.escape", foreground: tokens.string },
    { token: "number", foreground: tokens.number },
    { token: "keyword", foreground: tokens.keyword },
    { token: "comment", foreground: tokens.comment },
    // Shell / curl
    { token: "variable", foreground: tokens.number },
    { token: "variable.predefined", foreground: tokens.keyword },
    { token: "type", foreground: tokens.keyword },
    { token: "delimiter", foreground: tokens.foreground },
  ]
}

function editorChrome(
  mode: "light" | "dark",
  colors: ThemeColorVars,
): Monaco.editor.IColors {
  const selection = mode === "dark" ? "#3f3a47" : colors.muted
  const guide = mode === "dark" ? "#52525b" : colors.border
  return {
    "editor.background": colors.card,
    "editor.foreground": colors.foreground,
    "editorLineNumber.foreground": colors.mutedForeground,
    "editorLineNumber.activeForeground": colors.foreground,
    "editor.selectionBackground": selection,
    "editor.inactiveSelectionBackground": colors.accent,
    "editorIndentGuide.background1": guide,
    "editorIndentGuide.activeBackground1": colors.mutedForeground,
    "editorCursor.foreground": mode === "dark"
      ? `#${SYNTAX.dark.keyword}`
      : colors.primary,
    "editorWidget.background": colors.card,
    "editorWidget.border": colors.border,
    "editorOverviewRuler.border": colors.border,
    "scrollbarSlider.background": colors.muted,
    "scrollbarSlider.hoverBackground": guide,
  }
}

/**
 * Registers `aspected-light` and `aspected-dark`.
 *
 * Chrome (background, borders) comes from the live CSS tokens for the active
 * appearance. Syntax colors are fixed per mode so dark mode never paints
 * low-contrast button-purple onto a dark card.
 */
export function defineAspectedThemes(
  monacoApi: typeof Monaco,
): void {
  const root = document.documentElement
  const isDark = root.classList.contains("dark")
  const colors = readThemeColors(
    getComputedStyle(root),
    isDark ? "dark" : "light",
  )

  // When the document is dark, light chrome tokens are not on :root, so the
  // inactive light theme keeps sensible Studio light fallbacks. Same in reverse.
  const lightColors = isDark
    ? {
      background: "#ffffff",
      card: "#ffffff",
      foreground: "#18181b",
      muted: "#f4f4f5",
      mutedForeground: "#71717a",
      border: "#e4e4e7",
      primary: "#5b4fcf",
      accent: "#f4f4f5",
    }
    : colors
  const darkColors = isDark ? colors : {
    background: "#241f2a",
    card: "#2c2733",
    foreground: "#fafafa",
    muted: "#3a3542",
    mutedForeground: "#a1a1aa",
    border: "#3f3a47",
    primary: "#8b7cf7",
    accent: "#3a3542",
  }

  monacoApi.editor.defineTheme(ASPECTED_MONACO_THEMES.light, {
    base: "vs",
    inherit: true,
    rules: syntaxRules("light"),
    colors: editorChrome("light", lightColors),
  })
  monacoApi.editor.defineTheme(ASPECTED_MONACO_THEMES.dark, {
    base: "vs-dark",
    inherit: true,
    rules: syntaxRules("dark"),
    colors: editorChrome("dark", darkColors),
  })
}
