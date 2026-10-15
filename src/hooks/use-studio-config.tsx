import { createContext, type ReactNode, useContext, useMemo } from "react"
import {
  defaultBaseUrlForStudio,
  isStudioBundled,
} from "@/lib/studio-config.ts"

type StudioConfigContextValue = {
  /** Ready-to-use default Server URL for new connections. */
  defaultBaseUrl: string
  /** True when Studio is served same-origin from the Aspected process. */
  bundled: boolean
}

const StudioConfigContext = createContext<StudioConfigContextValue | undefined>(
  undefined,
)

/**
 * Provides build-time bundled flag and the default Server URL.
 *
 * Bundled builds (`/studio/` base) default to `window.location.origin`.
 * Standalone and desktop default to `http://localhost:8080`.
 */
export function StudioConfigProvider({ children }: { children: ReactNode }) {
  const value = useMemo<StudioConfigContextValue>(() => {
    const bundled = isStudioBundled()
    return {
      defaultBaseUrl: defaultBaseUrlForStudio(bundled),
      bundled,
    }
  }, [])

  return (
    <StudioConfigContext.Provider value={value}>
      {children}
    </StudioConfigContext.Provider>
  )
}

/**
 * Access bundled Studio defaults (same-origin Aspected serve).
 */
export function useStudioConfig(): StudioConfigContextValue {
  const context = useContext(StudioConfigContext)
  if (!context) {
    throw new Error("useStudioConfig must be used within StudioConfigProvider")
  }
  return context
}
