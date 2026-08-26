import type { CSSProperties } from "react"
import { Outlet } from "react-router"
import { Loader2Icon, UnplugIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar.tsx"
import { ConnectionDialogProvider } from "@/components/connection-dialog.tsx"
import { SiteHeader } from "@/components/site-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Toaster } from "@/components/ui/sonner.tsx"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { WelcomePage } from "@/pages/welcome-page.tsx"

type DisconnectedOverlayProps = {
  serverUrl: string
  error: string | null
  connecting: boolean
  retrying: boolean
  nextRetryIn: number | null
  onReconnect: () => void
}

/**
 * Semi-transparent overlay shown over the current page when the connection
 * drops mid-session. Keeps the user's context visible while explaining what
 * happened and offering a manual reconnect action.
 */
function DisconnectedOverlay({
  serverUrl,
  error,
  connecting,
  retrying,
  nextRetryIn,
  onReconnect,
}: DisconnectedOverlayProps) {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      style={{ left: "var(--sidebar-width)" }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border bg-card p-8 text-card-foreground shadow-lg">
        <UnplugIcon
          className="size-10 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="grid gap-1 text-center">
          <h2 className="text-lg font-semibold">Connection lost</h2>
          <p className="text-sm text-muted-foreground">
            Lost connection to{" "}
            <span className="font-mono text-foreground">{serverUrl}</span>
          </p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <Button
          type="button"
          onClick={onReconnect}
          disabled={connecting}
          className="w-full"
        >
          {connecting
            ? <Loader2Icon className="animate-spin" aria-hidden="true" />
            : null}
          {connecting ? "Reconnecting..." : "Reconnect"}
        </Button>
        {retrying && !connecting && (
          <p className="text-xs text-muted-foreground">
            {nextRetryIn !== null
              ? `Retrying in ${nextRetryIn}s...`
              : "Retrying..."}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Shared chrome: inset sidebar with saved connections, breadcrumbs, and
 * either the welcome screen or the current Studio page.
 * When a connection drops mid-session, the current page stays mounted
 * behind a "Connection lost" overlay with auto-retry.
 */
export function AppShell() {
  const {
    status,
    wasConnected,
    settings,
    error,
    connecting,
    retrying,
    nextRetryIn,
    reconnect,
  } = useConnection()

  const droppedMidSession = wasConnected && !status

  return (
    <ConnectionDialogProvider>
      <SidebarProvider
        style={{
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties}
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="relative min-w-0 overflow-x-hidden">
          <SiteHeader />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="@container/main flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {status || droppedMidSession ? <Outlet /> : <WelcomePage />}
              </div>
            </div>
          </div>
          {droppedMidSession && (
            <DisconnectedOverlay
              serverUrl={settings.baseUrl}
              error={error}
              connecting={connecting}
              retrying={retrying}
              nextRetryIn={nextRetryIn}
              onReconnect={reconnect}
            />
          )}
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </ConnectionDialogProvider>
  )
}
