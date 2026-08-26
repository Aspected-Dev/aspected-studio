import { useState } from "react"
import { toast } from "sonner"
import {
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react"
import { useConnectionDialog } from "@/components/connection-dialog.tsx"
import { useLiveUptime } from "@/hooks/use-live-uptime.ts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import {
  displayHost,
  type SavedConnection,
  serverUrlForCopy,
} from "@/lib/aspected/connection.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import { cn } from "@/lib/utils.ts"

/**
 * Sidebar group listing saved connections. The active session shows version
 * and uptime badges below the name. Disconnect and Remove are separate
 * dropdown menu actions.
 */
export function ConnectionFooter() {
  const {
    connections,
    status,
    statusReceivedAt,
    activeId,
    connecting,
    settings,
    connect,
    disconnect,
    deleteConnection,
  } = useConnection()
  const { openNew, openEdit } = useConnectionDialog()
  const [pendingDelete, setPendingDelete] = useState<SavedConnection | null>(
    null,
  )

  const liveUptimeLabel = useLiveUptime(status?.uptime, statusReceivedAt)

  async function connectSaved(connection: SavedConnection) {
    try {
      const result = await connect(connection)
      toast.success(
        `Connected to ${displayHost(connection.baseUrl)} (v${result.version})`,
      )
    } catch (caught) {
      toastCaughtError(caught, "Cannot reach Aspected")
    }
  }

  async function copyServerUrl(connection: SavedConnection) {
    const url = serverUrlForCopy(connection.baseUrl)
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Copied server URL")
    } catch {
      toastCaughtError(new Error("Clipboard unavailable"), "Could not copy")
    }
  }

  function confirmDelete() {
    if (!pendingDelete) {
      return
    }
    deleteConnection(pendingDelete.id)
    setPendingDelete(null)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        Connections ({connections.length})
      </SidebarGroupLabel>
      <SidebarGroupAction
        title="Add connection"
        onClick={openNew}
      >
        <PlusIcon />
        <span className="sr-only">Add connection</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {connections.map((connection) => {
            const host = displayHost(connection.baseUrl)
            const name = connection.name || host
            const isActive = activeId === connection.id && status !== null
            const connectingThis = connecting &&
              settings.baseUrl === connection.baseUrl &&
              settings.apiToken === connection.apiToken
            return (
              <SidebarMenuItem key={connection.id}>
                <div
                  className={cn(
                    // pr-1 matches SidebarGroupAction's right-3 rail: group
                    // p-2 (8px) + row pr-1 (4px) = right-3 (12px).
                    "group/connection flex min-w-0 flex-col gap-1.5 rounded-md p-2 pr-1",
                    isActive &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {isActive
                          ? (
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full bg-emerald-500"
                            />
                          )
                          : null}
                        <span className="truncate text-sm font-medium">
                          {name}
                        </span>
                      </div>
                      {host !== name
                        ? (
                          <p className="truncate text-xs text-sidebar-foreground/50">
                            {host}
                          </p>
                        )
                        : null}
                    </div>
                    {!isActive
                      ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className={cn(
                            "shrink-0",
                            connectingThis
                              ? "opacity-100"
                              : "opacity-0 group-hover/connection:opacity-100 group-focus-within/connection:opacity-100",
                          )}
                          disabled={connecting}
                          onClick={() => void connectSaved(connection)}
                        >
                          {connectingThis ? "Connecting…" : "Connect"}
                        </Button>
                      )
                      : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            className="size-5 shrink-0 rounded-md p-0 text-sidebar-foreground hover:bg-sidebar hover:text-sidebar-accent-foreground [&_svg]:size-4"
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                        <span className="sr-only">Connection actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="top"
                        className="w-max min-w-40 whitespace-nowrap"
                      >
                        {isActive
                          ? (
                            <>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={disconnect}
                              >
                                <UnlinkIcon />
                                Disconnect
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )
                          : null}
                        <DropdownMenuItem
                          onClick={() => openEdit(connection)}
                        >
                          <PencilIcon />
                          Edit connection
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void copyServerUrl(connection)}
                        >
                          <CopyIcon />
                          Copy server URL
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDelete(connection)}
                        >
                          <Trash2Icon />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {isActive && status
                    ? (
                      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 border-transparent bg-sidebar px-1.5 text-[10px] text-sidebar-foreground"
                        >
                          v{status.version}
                        </Badge>
                        {liveUptimeLabel
                          ? (
                            <Badge
                              variant="outline"
                              className="h-4 min-w-0 max-w-full truncate border-sidebar-border bg-sidebar px-1.5 text-[10px] font-normal text-sidebar-foreground"
                            >
                              {liveUptimeLabel}
                            </Badge>
                          )
                          : null}
                      </div>
                    )
                    : null}
                </div>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connection</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {pendingDelete?.name}{" "}
              from this studio. It does not change the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  )
}
