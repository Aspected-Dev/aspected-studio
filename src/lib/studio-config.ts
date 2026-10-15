import { DEFAULT_BASE_URL } from "@/lib/aspected/connection.ts"

/**
 * True when this bundle was built for same-origin serving under a non-root
 * base path (Aspected mounts Studio at `/studio/`).
 *
 * Injected at build time via `vite.config.ts`. Dev and desktop builds are
 * false.
 */
export function isStudioBundled(): boolean {
  const env = (import.meta as ImportMeta & {
    env?: { VITE_STUDIO_BUNDLED?: boolean | string }
  }).env
  return env?.VITE_STUDIO_BUNDLED === true ||
    env?.VITE_STUDIO_BUNDLED === "true"
}

/**
 * Default Server URL for the connection dialog.
 *
 * Bundled Studio (same origin as the API) uses `window.location.origin`.
 * Standalone and desktop keep the Docker default on port 8080.
 */
export function defaultBaseUrlForStudio(
  bundled: boolean,
  pageOrigin = typeof globalThis.location !== "undefined"
    ? globalThis.location.origin
    : "",
): string {
  if (bundled && pageOrigin) {
    try {
      return new URL(pageOrigin).origin
    } catch {
      // Fall through to the Docker default.
    }
  }
  return DEFAULT_BASE_URL
}

/**
 * Welcome-screen copy when Studio is served from the Aspected process.
 */
export function bundledWelcomeCopy(): string {
  return "This UI is served by the Aspected server on this host. The API shares the same origin, so connect here to browse indexes."
}
