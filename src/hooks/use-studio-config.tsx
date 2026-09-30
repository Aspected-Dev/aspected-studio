import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  defaultBaseUrlForStudio,
  loadStudioConfig,
  type StudioConfig,
} from "@/lib/studio-config.ts"

type StudioConfigContextValue = {
  /** Null while the optional `/config.json` fetch is in flight. */
  config: StudioConfig | null | undefined
  /** Ready-to-use default Server URL for new connections. */
  defaultBaseUrl: string
  /** True when Studio is served from the Aspected Docker image. */
  bundled: boolean
}

const StudioConfigContext = createContext<StudioConfigContextValue | undefined>(
  undefined,
)

/**
 * Loads optional bundled Studio config once at startup.
 */
export function StudioConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<StudioConfig | null | undefined>(
    undefined,
  )

  useEffect(() => {
    let cancelled = false
    void loadStudioConfig().then((next) => {
      if (!cancelled) {
        setConfig(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<StudioConfigContextValue>(() => {
    const resolved = config === undefined ? null : config
    return {
      config,
      defaultBaseUrl: defaultBaseUrlForStudio(resolved),
      bundled: resolved?.bundled === true,
    }
  }, [config])

  return (
    <StudioConfigContext.Provider value={value}>
      {children}
    </StudioConfigContext.Provider>
  )
}

/**
 * Access optional bundled Studio config (Docker image).
 */
export function useStudioConfig(): StudioConfigContextValue {
  const context = useContext(StudioConfigContext)
  if (!context) {
    throw new Error("useStudioConfig must be used within StudioConfigProvider")
  }
  return context
}
