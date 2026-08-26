import { useEffect, useState } from "react"
import { liveUptime } from "@/lib/aspected/uptime.ts"

/**
 * Renders a `/status` uptime snapshot as a locally ticking clock.
 */
export function useLiveUptime(
  snapshot: string | undefined,
  receivedAt: number | null,
): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!snapshot || receivedAt === null) {
      return
    }

    setNow(Date.now())
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [snapshot, receivedAt])

  if (!snapshot || receivedAt === null) {
    return snapshot ?? null
  }

  return liveUptime(snapshot, receivedAt, now)
}
