import { type FormEvent, useEffect, useState } from "react"
import { PencilIcon, Trash2Icon } from "lucide-react"
import { useParams } from "react-router"
import { toast } from "sonner"
import { createDataTableColumnHelper } from "@/components/data-table-features.ts"
import { DataTable, DataTableRowActions } from "@/components/data-table.tsx"
import {
  DocsField,
  DocsHelpIcon,
  DocsTextLink,
  PageDocsButton,
} from "@/components/docs-help.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import { RequestInspector } from "@/components/request-inspector.tsx"
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
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { type RecordedRequest } from "@/lib/aspected/client.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import {
  type DocEntry,
  type IndexDetail,
  type UploadDocsRequest,
  uploadDocsRequestSchema,
} from "@/lib/aspected/types.ts"
import { DOCS_HASH } from "@/lib/docs.ts"

const columnHelper = createDataTableColumnHelper<DocEntry>()

const DEFAULT_BULK = JSON.stringify(
  {
    data: [
      {
        id: "prod-001",
        doc: {
          category: "electronics",
        },
      },
    ],
  },
  null,
  2,
)

/**
 * Lists, upserts, and deletes documents for an index.
 */
export function IndexDocsPage() {
  const { name } = useParams()
  const { client } = useConnection()
  const [index, setIndex] = useState<IndexDetail | null>(null)
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<DocEntry | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [docId, setDocId] = useState("")
  const [docJson, setDocJson] = useState("{}")
  const [accessList, setAccessList] = useState("")
  const [bulkJson, setBulkJson] = useState(DEFAULT_BULK)
  const [duplicatePolicy, setDuplicatePolicy] = useState("Replace")
  const [missingPolicy, setMissingPolicy] = useState("Ignore")
  const [lastRequest, setLastRequest] = useState<RecordedRequest | null>(null)
  const limit = 10

  async function load(nextPage = page) {
    if (!name) {
      return
    }
    try {
      const [indexResponse, docsResponse] = await Promise.all([
        client.getIndex(name),
        client.listDocs(name, { page: nextPage, limit }),
      ])
      setIndex(indexResponse.data)
      setDocs(docsResponse.data)
      setTotal(docsResponse.total)
      setPage(docsResponse.page)
    } catch (caught) {
      toastCaughtError(caught, "Could not load documents")
    }
  }

  useEffect(() => {
    void load(1)
  }, [client, name])

  function openCreate() {
    setDocId("")
    setDocJson(
      JSON.stringify(
        Object.fromEntries(
          (index?.schema ?? []).map((aspect) => {
            const field = aspect.path.replace(/^\$\./, "")
            return [field, ""]
          }),
        ),
        null,
        2,
      ),
    )
    setAccessList("")
    setEditorOpen(true)
  }

  function openEdit(doc: DocEntry) {
    setSelected(doc)
    setDocId(doc.id)
    setDocJson(JSON.stringify(doc.doc, null, 2))
    setAccessList((doc.accessList ?? []).join(", "))
    setEditorOpen(true)
  }

  async function submitDoc(event: FormEvent) {
    event.preventDefault()
    if (!name) {
      return
    }
    try {
      const doc = JSON.parse(docJson) as Record<string, unknown>
      const keys = accessList.split(",").map((part) => part.trim()).filter(
        Boolean,
      )
      const body: UploadDocsRequest = {
        data: [{
          id: docId.trim(),
          doc,
          accessList: keys.length > 0 ? keys : undefined,
        }],
        policy: {
          duplicate: duplicatePolicy as "Replace" | "Ignore" | "Fail",
          missing: missingPolicy as "Ignore" | "Fail",
        },
      }
      const result = await client.uploadDocs(name, body)
      setLastRequest(client.lastRequest)
      toast.success(
        `Created ${result.data.created.length}, updated ${result.data.updated.length}`,
      )
      setEditorOpen(false)
      await load()
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Could not save document")
    }
  }

  async function submitBulk(event: FormEvent) {
    event.preventDefault()
    if (!name) {
      return
    }
    try {
      const body = uploadDocsRequestSchema.parse(JSON.parse(bulkJson))
      const result = await client.uploadDocs(name, body)
      setLastRequest(client.lastRequest)
      toast.success(
        `Created ${result.data.created.length}, updated ${result.data.updated.length}, deleted ${result.data.deleted.length}`,
      )
      setBulkOpen(false)
      await load()
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Could not upload documents")
    }
  }

  async function confirmDelete() {
    if (!name || !pendingDelete) {
      return
    }
    try {
      await client.uploadDocs(name, {
        data: [{ id: pendingDelete }],
        policy: { missing: missingPolicy as "Ignore" | "Fail" },
      })
      setLastRequest(client.lastRequest)
      toast.success(`Deleted ${pendingDelete}`)
      if (selected?.id === pendingDelete) {
        setSelected(null)
      }
      setPendingDelete(null)
      await load()
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Could not delete document")
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / limit))

  const columns = columnHelper.columns([
    columnHelper.accessor("id", {
      header: "ID",
      meta: { className: "font-mono text-xs" },
    }),
    columnHelper.accessor("doc", {
      header: "Document",
      meta: { className: "font-mono text-xs" },
      cell: ({ getValue }) => (
        <span className="inline-block w-40 truncate sm:w-64">
          {JSON.stringify(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("accessList", {
      header: () => (
        <span className="inline-flex items-center gap-1">
          Access
          <DocsHelpIcon
            page="accessControl"
            hash={DOCS_HASH.accessAssigning}
            label="Access list"
          />
        </span>
      ),
      meta: { className: "text-xs" },
      cell: ({ getValue }) => (getValue() ?? []).join(", ") || "-",
    }),
    columnHelper.display({
      id: "actions",
      meta: { className: "w-10" },
      cell: ({ row }) => (
        <DataTableRowActions>
          <DropdownMenuItem
            onClick={() => openEdit(row.original)}
          >
            <PencilIcon />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setPendingDelete(row.original.id)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DataTableRowActions>
      ),
    }),
  ])

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">{total} documents</p>
          {total === 0
            ? (
              <p className="text-sm text-muted-foreground">
                Train the index by upserting documents. The{" "}
                <DocsTextLink
                  page="tutorial"
                  hash={DOCS_HASH.tutorialTrain}
                >
                  tutorial
                </DocsTextLink>{" "}
                walks through a sample products catalogue.
              </p>
            )
            : null}
        </div>
        <div className="flex items-center gap-2">
          <PageDocsButton
            page="tutorial"
            hash={DOCS_HASH.tutorialTrain}
            label="Docs"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkOpen(true)}
          >
            Bulk JSON
          </Button>
          <Button type="button" onClick={openCreate}>
            Add document
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <DocsField
          label="Duplicate policy"
          page="tutorial"
          hash={DOCS_HASH.tutorialSummary}
          blurb="Replace (default), Ignore, or Fail when an id already exists."
        >
          <Select
            value={duplicatePolicy}
            onValueChange={(value) => value && setDuplicatePolicy(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Replace">Replace</SelectItem>
              <SelectItem value="Ignore">Ignore</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </DocsField>
        <DocsField
          label="Missing policy"
          page="tutorial"
          hash={DOCS_HASH.tutorialSummary}
          blurb="Ignore (default) or Fail when an id is missing. Delete by sending ids only."
        >
          <Select
            value={missingPolicy}
            onValueChange={(value) => value && setMissingPolicy(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Ignore">Ignore</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </DocsField>
      </div>

      <DataTable
        columns={columns}
        data={docs}
        getRowId={(row) => row.id}
        selectedRowId={selected?.id}
        onRowClick={openEdit}
        pagination={{
          pageIndex: page - 1,
          pageSize: limit,
          rowCount: total,
          onPageIndexChange: (pageIndex) => void load(pageIndex + 1),
          label: `Page ${page} of ${pageCount}`,
        }}
      />

      {selected
        ? (
          <JsonEditor
            value={JSON.stringify(selected, null, 2)}
            readOnly
          />
        )
        : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={submitDoc} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {docId ? "Edit document" : "Add document"}
              </DialogTitle>
            </DialogHeader>
            <DocsField label="ID" htmlFor="doc-id">
              <Input
                id="doc-id"
                value={docId}
                onChange={(event) => setDocId(event.target.value)}
                required
              />
            </DocsField>
            <DocsField
              label="Access list"
              htmlFor="access-list"
              page="accessControl"
              hash={DOCS_HASH.accessAssigning}
              blurb={null}
            >
              <Input
                id="access-list"
                value={accessList}
                onChange={(event) => setAccessList(event.target.value)}
                placeholder="team-a, team-b"
              />
            </DocsField>
            <JsonEditor value={docJson} onChange={setDocJson} />
            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submitBulk} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Bulk upload</DialogTitle>
            </DialogHeader>
            <JsonEditor
              value={bulkJson}
              onChange={setBulkJson}
            />
            <DialogFooter>
              <Button type="submit">Upload</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {pendingDelete} from {name}. This cannot be undone.
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

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Request</h2>
        <RequestInspector request={lastRequest} />
      </section>
    </div>
  )
}
