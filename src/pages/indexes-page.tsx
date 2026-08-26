import { useEffect, useMemo, useState } from "react"
import {
  BracesIcon,
  CopyIcon,
  FileTextIcon,
  GlobeIcon,
  LinkIcon,
  SearchIcon,
  SquareTerminalIcon,
  Trash2Icon,
} from "lucide-react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"
import { createDataTableColumnHelper } from "@/components/data-table-features.ts"
import { DataTable, DataTableRowActions } from "@/components/data-table.tsx"
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
import { Button } from "@/components/ui/button.tsx"
import { DocsTextLink, PageDocsButton } from "@/components/docs-help.tsx"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { indexPath, indexStudioUrl } from "@/lib/app-nav.ts"
import { indexUrlForCopy } from "@/lib/aspected/connection.ts"
import { buildCurlCommand } from "@/lib/aspected/curl.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import { copyToClipboard } from "@/lib/utils.ts"

type IndexRow = {
  name: string
}

const columnHelper = createDataTableColumnHelper<IndexRow>()

/**
 * Lists indexes on the connected Aspected server.
 */
export function IndexesPage() {
  const { client, settings } = useConnection()
  const navigate = useNavigate()
  const [names, setNames] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  async function load() {
    try {
      const response = await client.listIndexes()
      setNames(response.data.map((row) => row.name))
    } catch (caught) {
      toastCaughtError(caught, "Could not load indexes")
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [client])

  async function copyText(value: string, success: string) {
    try {
      await copyToClipboard(value)
      toast.success(success)
    } catch {
      toastCaughtError(new Error("Clipboard unavailable"), "Could not copy")
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return
    }

    try {
      await client.deleteIndex(pendingDelete)
      toast.success(`Deleted ${pendingDelete}`)
      setPendingDelete(null)
      await load()
    } catch (caught) {
      toastCaughtError(caught, "Could not delete index")
    }
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Name",
          cell: ({ row }) => (
            <Link
              to={indexPath(row.original.name)}
              className="font-medium"
              tabIndex={-1}
            >
              {row.original.name}
            </Link>
          ),
        }),
        columnHelper.display({
          id: "actions",
          meta: { className: "w-10" },
          cell: ({ row }) => {
            const name = row.original.name
            const apiUrl = indexUrlForCopy(settings.baseUrl, name)
            return (
              <DataTableRowActions>
                <DropdownMenuItem onClick={() => navigate(indexPath(name))}>
                  <BracesIcon />
                  Schema
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(indexPath(name, "docs"))}
                >
                  <FileTextIcon />
                  Documents
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate(indexPath(name, "search"))}
                >
                  <SearchIcon />
                  Search
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void copyText(name, "Copied index name")}
                >
                  <CopyIcon />
                  Copy name
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void copyText(
                      indexStudioUrl(window.location.origin, name),
                      "Copied Studio URL",
                    )}
                >
                  <LinkIcon />
                  Copy Studio URL
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void copyText(apiUrl, "Copied API URL")}
                >
                  <GlobeIcon />
                  Copy API URL
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void copyText(
                      buildCurlCommand({ method: "GET", url: apiUrl }),
                      "Copied curl",
                    )}
                >
                  <SquareTerminalIcon />
                  Copy GET curl
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setPendingDelete(name)}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DataTableRowActions>
            )
          },
        }),
      ]),
    [navigate, settings.baseUrl],
  )

  const data = useMemo(
    () => names.map((name) => ({ name })),
    [names],
  )

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium">Indexes</h1>
        <div className="flex items-center gap-2">
          <PageDocsButton page="tutorial" />
          <Button nativeButton={false} render={<Link to="/indexes/new" />}>
            Create index
          </Button>
        </div>
      </div>
      {loaded && names.length === 0
        ? (
          <div className="grid gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
            <p>No indexes on this server yet.</p>
            <p>
              <Link
                to="/indexes/new"
                className="text-primary underline-offset-4 hover:underline"
              >
                Create an index
              </Link>{" "}
              or follow the{" "}
              <DocsTextLink page="tutorial">tutorial</DocsTextLink> and{" "}
              <DocsTextLink page="gettingStarted">Getting started</DocsTextLink>
              .
            </p>
          </div>
        )
        : (
          <DataTable
            columns={columns}
            data={data}
            getRowId={(row) => row.name}
            getRowHref={(row) => indexPath(row.name)}
          />
        )}
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
            <AlertDialogTitle>Delete index</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {pendingDelete}{" "}
              and its persisted data from the server. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
