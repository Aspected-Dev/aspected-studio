import { useEffect, useState } from "react"
import { useParams } from "react-router"
import { createDataTableColumnHelper } from "@/components/data-table-features.ts"
import { DataTable } from "@/components/data-table.tsx"
import { DocsHelpIcon, PageDocsButton } from "@/components/docs-help.tsx"
import { CopyableReadonlyField } from "@/components/copyable-readonly-field.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import { JsonInspectSheet } from "@/components/json-inspect-sheet.tsx"
import { JsonPreviewCell } from "@/components/json-preview-cell.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import type { IndexDetail, StoredAspect } from "@/lib/aspected/types.ts"
import { docsPageForAspectType, INDEX_FIELD_DOCS } from "@/lib/docs.ts"

const columnHelper = createDataTableColumnHelper<StoredAspect>()

const columns = columnHelper.columns([
  columnHelper.accessor("name", {
    header: "Name",
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  }),
  columnHelper.accessor("type", {
    header: "Type",
    cell: ({ getValue }) => {
      const type = getValue()
      return (
        <span className="inline-flex items-center">
          {type}
          <DocsHelpIcon
            page={docsPageForAspectType(type)}
            label={`${type} resolver`}
          />
        </span>
      )
    },
  }),
  columnHelper.accessor("path", {
    header: "Path",
    meta: { className: "font-mono text-xs" },
  }),
  columnHelper.accessor("multiplier", {
    header: "Multiplier",
    cell: ({ getValue }) => getValue() ?? 1,
  }),
  columnHelper.accessor("settings", {
    header: "Settings",
    meta: { className: "font-mono text-xs" },
    cell: ({ getValue }) => <JsonPreviewCell value={getValue()} />,
  }),
])

/**
 * Read-only index schema, dimensions, and HNSW settings.
 */
export function IndexSchemaPage() {
  const { name } = useParams()
  const { client } = useConnection()
  const [index, setIndex] = useState<IndexDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedAspect, setSelectedAspect] = useState<StoredAspect | null>(
    null,
  )

  useEffect(() => {
    if (!name) {
      return
    }
    let cancelled = false
    client.getIndex(name).then((response) => {
      if (!cancelled) {
        setIndex(response.data)
        setLoadFailed(false)
      }
    }).catch((caught) => {
      if (!cancelled) {
        setLoadFailed(true)
        toastCaughtError(caught, "Could not load schema")
      }
    })
    return () => {
      cancelled = true
    }
  }, [client, name])

  if (loadFailed) {
    return (
      <p className="text-sm text-muted-foreground">Could not load schema.</p>
    )
  }

  if (!index) {
    return <p className="text-sm text-muted-foreground">Loading schema…</p>
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {index.numDims} dimensions
              <DocsHelpIcon
                page={INDEX_FIELD_DOCS.numDims.page}
                label={INDEX_FIELD_DOCS.numDims.label}
                blurb={INDEX_FIELD_DOCS.numDims.blurb}
              />
            </Badge>
            <Badge variant="outline">
              ID size {index.idSize}
              <DocsHelpIcon
                page={INDEX_FIELD_DOCS.idSize.page}
                hash={INDEX_FIELD_DOCS.idSize.hash}
                label={INDEX_FIELD_DOCS.idSize.label}
                blurb={INDEX_FIELD_DOCS.idSize.blurb}
              />
            </Badge>
            <Badge variant="outline">
              {index.distanceType}
              <DocsHelpIcon
                page={INDEX_FIELD_DOCS.distanceType.page}
                label={INDEX_FIELD_DOCS.distanceType.label}
                blurb={INDEX_FIELD_DOCS.distanceType.blurb}
              />
            </Badge>
          </div>
        </div>
        <PageDocsButton page="resolvers" />
      </div>
      <DataTable
        columns={columns}
        data={index.schema}
        getRowId={(row) => row.name}
        selectedRowId={selectedAspect?.name}
        onRowClick={setSelectedAspect}
      />
      <JsonInspectSheet
        open={selectedAspect !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAspect(null)
          }
        }}
        title={selectedAspect?.name ?? ""}
        description="Aspect definition from the stored schema."
        value={selectedAspect?.settings}
        jsonLabel="Settings"
      >
        {selectedAspect
          ? (
            <div className="grid gap-4">
              <CopyableReadonlyField
                id="aspect-name"
                label="Name"
                value={selectedAspect.name}
              />
              <CopyableReadonlyField
                id="aspect-type"
                label="Type"
                value={selectedAspect.type}
              />
              <CopyableReadonlyField
                id="aspect-path"
                label="Path"
                value={selectedAspect.path}
              />
              <CopyableReadonlyField
                id="aspect-multiplier"
                label="Multiplier"
                value={String(selectedAspect.multiplier ?? 1)}
              />
            </div>
          )
          : null}
      </JsonInspectSheet>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">HNSW</h2>
          <PageDocsButton page="hnsw" label="HNSW docs" />
        </div>
        <JsonEditor
          value={JSON.stringify(index.hnsw, null, 2)}
          readOnly
        />
      </div>
    </div>
  )
}
