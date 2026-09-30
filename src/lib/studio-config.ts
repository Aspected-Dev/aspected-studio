import { z } from "zod"
import { DEFAULT_BASE_URL } from "@/lib/aspected/connection.ts"

/** Path served by the Aspected Studio static listener. */
export const STUDIO_CONFIG_URL = "/config.json"

const studioConfigSchema = z.object({
  /** True when Studio is served from the Aspected process. */
  bundled: z.boolean(),
  /** API listen port (`server.port`). Used to build the default Server URL. */
  apiPort: z.number().int().positive().optional(),
})

/** Runtime config injected when Studio ships with the Aspected server. */
export type StudioConfig = z.infer<typeof studioConfigSchema>

/**
 * Loads `/config.json` when present. Missing or invalid config returns null
 * (normal for Vite dev and standalone Studio deploys).
 */
export async function loadStudioConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<StudioConfig | null> {
  try {
    const response = await fetchImpl(STUDIO_CONFIG_URL, { cache: "no-store" })
    if (!response.ok) {
      return null
    }
    const parsed = studioConfigSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Default Server URL for the connection dialog. Bundled Studio points at the
 * API port on the same hostname (cross-origin to `server.port`).
 */
export function defaultBaseUrlForStudio(
  config: StudioConfig | null,
  pageOrigin = typeof globalThis.location !== "undefined"
    ? globalThis.location.origin
    : "",
): string {
  if (config?.bundled && config.apiPort != null && pageOrigin) {
    try {
      const page = new URL(pageOrigin)
      page.port = String(config.apiPort)
      return page.origin
    } catch {
      // Fall through to the Docker default.
    }
  }
  return DEFAULT_BASE_URL
}

/**
 * Welcome-screen copy when Studio is served from the Aspected container.
 * Mentions the Studio page port and the API port from `/config.json`.
 *
 * @param apiPort API listen port from `/config.json` (optional).
 * @param location Override for tests. Omit to use `globalThis.location`.
 */
export function bundledWelcomeCopy(
  apiPort?: number,
  location?: Pick<Location, "port" | "protocol"> | null,
): string {
  const resolvedLocation = location === undefined
    ? (typeof globalThis.location !== "undefined" ? globalThis.location : null)
    : location
  const studioPort = locationPort(resolvedLocation)
  if (studioPort && apiPort != null) {
    return `This UI is served by the Aspected container on port ${studioPort}. The API listens on port ${apiPort}.`
  }
  if (studioPort) {
    return `This UI is served by the Aspected container on port ${studioPort}. Connect to the API port on this host to browse indexes.`
  }
  return "This UI is served by the Aspected container. Connect to the API on this host to browse indexes."
}

function locationPort(
  location: Pick<Location, "port" | "protocol"> | null,
): string {
  if (!location) {
    return ""
  }
  if (location.port) {
    return location.port
  }
  if (location.protocol === "https:") {
    return "443"
  }
  if (location.protocol === "http:") {
    return "80"
  }
  return ""
}
