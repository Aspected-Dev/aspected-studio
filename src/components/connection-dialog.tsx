import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { DocsField } from "@/components/docs-help.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { useStudioConfig } from "@/hooks/use-studio-config.tsx"
import { AspectedApiError } from "@/lib/aspected/client.ts"
import {
  connectionFormSchema,
  type ConnectionFormValues,
  displayHost,
  type SavedConnection,
} from "@/lib/aspected/connection.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import { DOCS_HASH } from "@/lib/docs.ts"

type ConnectionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: SavedConnection | null
  /** When true, focus the API token field (e.g. after a 401). */
  requireToken?: boolean
}

type ConnectionDialogApi = {
  openNew: () => void
  openEdit: (
    connection: SavedConnection,
    options?: { requireToken?: boolean },
  ) => void
}

const ConnectionDialogContext = createContext<
  ConnectionDialogApi | undefined
>(undefined)

/**
 * Holds New/Edit connection dialog state for the sidebar and welcome screen.
 */
export function ConnectionDialogProvider({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SavedConnection | null>(null)
  const [requireToken, setRequireToken] = useState(false)
  const api = useMemo<ConnectionDialogApi>(
    () => ({
      openNew: () => {
        setEditing(null)
        setRequireToken(false)
        setOpen(true)
      },
      openEdit: (connection, options) => {
        setEditing(connection)
        setRequireToken(options?.requireToken === true)
        setOpen(true)
      },
    }),
    [],
  )

  return (
    <ConnectionDialogContext.Provider value={api}>
      {children}
      <ConnectionDialog
        open={open}
        connection={editing}
        requireToken={requireToken}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            setEditing(null)
            setRequireToken(false)
          }
        }}
      />
    </ConnectionDialogContext.Provider>
  )
}

/**
 * Opens the New/Edit connection dialog from chrome that is not the dialog.
 */
export function useConnectionDialog(): ConnectionDialogApi {
  const context = useContext(ConnectionDialogContext)
  if (!context) {
    throw new Error(
      "useConnectionDialog must be used within ConnectionDialogProvider",
    )
  }
  return context
}

type SubmitAction = "save" | "connect" | "saveAndConnect"

const TOKEN_REQUIRED_MESSAGE =
  "This server requires an API token. Paste ASPECTED_SERVER_STATIC_API_TOKEN as a Bearer token."

/**
 * Modal to save and/or connect to an Aspected server.
 */
export function ConnectionDialog({
  open,
  onOpenChange,
  connection,
  requireToken = false,
}: ConnectionDialogProps) {
  const { connecting, upsertConnection, connect } = useConnection()
  const { defaultBaseUrl, bundled } = useStudioConfig()
  const editing = connection ?? null
  const tokenInputRef = useRef<HTMLInputElement | null>(null)

  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionFormSchema),
    defaultValues: {
      name: "",
      baseUrl: defaultBaseUrl,
      apiToken: "",
    },
  })

  // Track which button triggered the submit so handleSubmit can branch.
  const actionRef = useRef<SubmitAction>("saveAndConnect")

  useEffect(() => {
    if (!open) {
      return
    }
    if (editing) {
      form.reset({
        name: editing.name,
        baseUrl: editing.baseUrl,
        apiToken: editing.apiToken,
      })
      if (requireToken) {
        form.setError("apiToken", { message: TOKEN_REQUIRED_MESSAGE })
      }
      return
    }
    form.reset({ name: "", baseUrl: defaultBaseUrl, apiToken: "" })
  }, [open, editing, form, defaultBaseUrl, requireToken])

  useEffect(() => {
    if (!open || !requireToken) {
      return
    }
    const frame = requestAnimationFrame(() => {
      tokenInputRef.current?.focus()
      tokenInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, requireToken])

  const baseUrlValue = form.watch("baseUrl")
  const { ref: tokenRegisterRef, ...tokenRegisterRest } = form.register(
    "apiToken",
  )

  function persist(values: ConnectionFormValues) {
    return upsertConnection({
      id: editing?.id,
      name: values.name,
      baseUrl: values.baseUrl.trim(),
      apiToken: values.apiToken.trim(),
    })
  }

  function handleAuthFailure(caught: unknown) {
    if (caught instanceof AspectedApiError && caught.status === 401) {
      form.setError("apiToken", { message: TOKEN_REQUIRED_MESSAGE })
      // Focus after the submit button releases focus from the click.
      queueMicrotask(() => {
        tokenInputRef.current?.focus()
        tokenInputRef.current?.select()
      })
    }
    toastCaughtError(caught, "Cannot reach Aspected")
  }

  async function runConnect(target: Parameters<typeof connect>[0]) {
    const result = await connect(target)
    toast.success(
      `Connected to ${displayHost(target.baseUrl)} (v${result.version})`,
    )
    onOpenChange(false)
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    const action = actionRef.current

    if (action === "save") {
      persist(values)
      onOpenChange(false)
      return
    }

    if (action === "connect") {
      try {
        await runConnect({
          baseUrl: values.baseUrl.trim(),
          apiToken: values.apiToken.trim(),
        })
      } catch (caught) {
        handleAuthFailure(caught)
      }
      return
    }

    // saveAndConnect
    const saved = persist(values)
    try {
      await runConnect(saved)
    } catch (caught) {
      handleAuthFailure(caught)
    }
  })

  const isSubmitting = form.formState.isSubmitting || connecting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit connection" : "New connection"}
          </DialogTitle>
          <DialogDescription>
            {bundled
              ? "This Studio UI is served by the Aspected server on this host. Connect here, or save another server."
              : "Save a server for later, or connect now. Studio does not connect until you choose one."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <DocsField label="Name" htmlFor="connection-name">
            <Input
              id="connection-name"
              {...form.register("name")}
              placeholder={displayHost(
                baseUrlValue.trim() || defaultBaseUrl,
              )}
              autoComplete="off"
            />
          </DocsField>
          <DocsField
            label="Server URL"
            htmlFor="connection-url"
            page="gettingStarted"
            description={bundled
              ? "Defaults to this page origin. Studio and the API share the same host and port."
              : "Docker publishes Aspected on port 8080 by default."}
            error={form.formState.errors.baseUrl?.message}
          >
            <Input
              id="connection-url"
              {...form.register("baseUrl")}
              placeholder={defaultBaseUrl}
              autoComplete="off"
            />
          </DocsField>
          <DocsField
            label="API token"
            htmlFor="connection-token"
            page="security"
            hash={DOCS_HASH.apiToken}
            description="Leave empty when the server has no staticApiToken. Otherwise paste ASPECTED_SERVER_STATIC_API_TOKEN as a Bearer token."
            error={form.formState.errors.apiToken?.message}
          >
            <Input
              id="connection-token"
              type="password"
              {...tokenRegisterRest}
              ref={(element) => {
                tokenRegisterRef(element)
                tokenInputRef.current = element
              }}
              placeholder="Optional Bearer token"
              autoComplete="off"
            />
          </DocsField>
          <DialogFooter className="sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                actionRef.current = "save"
              }}
            >
              Save
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => {
                actionRef.current = "connect"
              }}
            >
              Connect
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              onClick={() => {
                actionRef.current = "saveAndConnect"
              }}
            >
              {isSubmitting ? "Connecting…" : "Save and Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
