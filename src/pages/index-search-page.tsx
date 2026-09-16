import { useEffect, useState } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useParams } from "react-router"
import { createDataTableColumnHelper } from "@/components/data-table-features.ts"
import { DataTable } from "@/components/data-table.tsx"
import {
  DocsField,
  DocsHelpIcon,
  DocsTextLink,
  PageDocsButton,
} from "@/components/docs-help.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import { JsonInspectSheet } from "@/components/json-inspect-sheet.tsx"
import { JsonPreviewCell } from "@/components/json-preview-cell.tsx"
import { CopyableReadonlyField } from "@/components/copyable-readonly-field.tsx"
import { RequestInspector } from "@/components/request-inspector.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx"
import { Field, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { type RecordedRequest } from "@/lib/aspected/client.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import {
  buildSparseSearchRequest,
  searchFormSchema,
  type SearchFormValues,
} from "@/lib/aspected/query.ts"
import {
  type SearchIndexRequest,
  searchIndexRequestSchema,
  type SearchResultRow,
} from "@/lib/aspected/types.ts"
import { usedExplanation } from "@/lib/aspected/explanation.ts"
import { DOCS_HASH } from "@/lib/docs.ts"
import { prettyJson } from "@/lib/pretty-json.ts"

const columnHelper = createDataTableColumnHelper<SearchResultRow>()

const columns = columnHelper.columns([
  columnHelper.accessor("id", {
    header: "ID",
    meta: { className: "font-mono text-xs" },
  }),
  columnHelper.accessor("distance", {
    header: () => (
      <span className="inline-flex items-center">
        Distance
        <DocsHelpIcon
          page="resolvers"
          hash={DOCS_HASH.inspectingResolvers}
          label="Distance"
          blurb="Lower is closer. Omitted aspects do not contribute."
        />
      </span>
    ),
  }),
  columnHelper.accessor("explanation", {
    header: () => (
      <span className="inline-flex items-center">
        Explanation
        <DocsHelpIcon
          page="resolvers"
          hash={DOCS_HASH.inspectingResolvers}
          label="Search explanation"
        />
      </span>
    ),
    meta: { className: "font-mono text-xs" },
    cell: ({ getValue }) => (
      <JsonPreviewCell value={usedExplanation(getValue())} />
    ),
  }),
  columnHelper.accessor("doc", {
    header: "Document",
    meta: { className: "font-mono text-xs" },
    cell: ({ getValue }) => <JsonPreviewCell value={getValue()} />,
  }),
])

/**
 * Sparse search form generated from the index schema.
 */
export function IndexSearchPage() {
  const { name } = useParams()
  const { client } = useConnection()
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [results, setResults] = useState<SearchResultRow[]>([])
  const [selected, setSelected] = useState<SearchResultRow | null>(null)
  const [lastRequest, setLastRequest] = useState<RecordedRequest | null>(null)

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      k: "5",
      aspects: [],
      accessFilter: "",
      includeNullAccess: false,
      withDocs: true,
      withExplanation: true,
      withVectors: false,
    },
  })

  const { fields: aspectFields } = useFieldArray({
    control: form.control,
    name: "aspects",
  })

  useEffect(() => {
    if (!name) {
      return
    }
    client.getIndex(name).then((response) => {
      form.setValue(
        "aspects",
        response.data.schema.map((aspect) => ({
          name: aspect.name,
          value: "",
          weight: "",
        })),
      )
    }).catch((caught) => {
      toastCaughtError(caught, "Could not load index")
    })
  }, [client, name, form])

  function currentRequest(): SearchIndexRequest {
    if (jsonMode) {
      return searchIndexRequestSchema.parse(JSON.parse(jsonText))
    }
    const values = form.getValues()
    return buildSparseSearchRequest({
      k: Number(values.k),
      aspects: values.aspects,
      accessFilter: values.accessFilter,
      includeNullAccess: values.includeNullAccess,
      withDocs: values.withDocs,
      withVectors: values.withVectors,
      withExplanation: values.withExplanation,
    })
  }

  function switchToJson() {
    try {
      setJsonText(JSON.stringify(currentRequest(), null, 2))
      setJsonMode(true)
    } catch (caught) {
      toastCaughtError(caught, "Could not switch to JSON")
    }
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!name) {
      return
    }
    try {
      const body = jsonMode ? currentRequest() : buildSparseSearchRequest({
        k: Number(values.k),
        aspects: values.aspects,
        accessFilter: values.accessFilter,
        includeNullAccess: values.includeNullAccess,
        withDocs: values.withDocs,
        withVectors: values.withVectors,
        withExplanation: values.withExplanation,
      })
      const response = await client.searchIndex(name, body)
      setLastRequest(client.lastRequest)
      setResults(response.data)
      setSelected(null)
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Search failed")
    }
  })

  const errors = form.formState.errors
  const selectedExplanation = usedExplanation(selected?.explanation)

  return (
    <form onSubmit={handleSubmit} className="grid min-w-0 gap-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Leave an aspect blank to keep it sparse. Combine aspects as in the
          {" "}
          <DocsTextLink
            page="resolvers"
            hash={DOCS_HASH.combiningResolvers}
          >
            resolver docs
          </DocsTextLink>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <PageDocsButton
            page="resolvers"
            hash={DOCS_HASH.combiningResolvers}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => jsonMode ? setJsonMode(false) : switchToJson()}
          >
            {jsonMode ? "Use form" : "Use JSON"}
          </Button>
        </div>
      </div>

      {jsonMode
        ? <JsonEditor value={jsonText} onChange={setJsonText} />
        : (
          <div className="grid gap-4">
            <div className="max-w-32">
              <DocsField
                label="k"
                htmlFor="k"
                page="tutorial"
                hash={DOCS_HASH.tutorialSearch}
                blurb="Number of nearest neighbours to return."
                error={errors.k?.message}
                mono
              >
                <Input
                  id="k"
                  type="number"
                  min={1}
                  {...form.register("k")}
                />
              </DocsField>
            </div>
            {aspectFields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-3 sm:grid-cols-[1fr_8rem]"
              >
                <DocsField
                  label={field.name}
                  htmlFor={`q-${field.name}`}
                  page="resolvers"
                  hash={DOCS_HASH.combiningResolvers}
                  blurb="Leave blank to omit this aspect from the query."
                >
                  <Input
                    id={`q-${field.name}`}
                    {...form.register(`aspects.${index}.value`)}
                    placeholder="omit for sparse"
                  />
                </DocsField>
                <DocsField
                  label="Weight"
                  htmlFor={`w-${field.name}`}
                  page="resolvers"
                  hash={DOCS_HASH.inspectingResolvers}
                  blurb="Scales this aspect in the query. Use explanation to tune weights."
                  error={errors.aspects?.[index]?.weight?.message}
                >
                  <Input
                    id={`w-${field.name}`}
                    {...form.register(`aspects.${index}.weight`)}
                  />
                </DocsField>
              </div>
            ))}
            <div className="flex flex-wrap gap-4">
              <Controller
                control={form.control}
                name="withDocs"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(Boolean(checked))}
                    />
                    <FieldLabel className="font-mono">withDocs</FieldLabel>
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="withExplanation"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) =>
                        field.onChange(Boolean(checked))}
                    />
                    <FieldLabel className="font-mono">
                      withExplanation
                      <span className="-ml-1.5">
                        <DocsHelpIcon
                          page="resolvers"
                          hash={DOCS_HASH.inspectingResolvers}
                          label="withExplanation"
                        />
                      </span>
                    </FieldLabel>
                  </Field>
                )}
              />
            </div>
            <Collapsible>
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="bg-muted hover:bg-muted/70 dark:hover:bg-muted/50"
                  />
                }
              >
                Advanced
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-3 pt-3">
                <Controller
                  control={form.control}
                  name="withVectors"
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(Boolean(checked))}
                      />
                      <FieldLabel className="font-mono">withVectors</FieldLabel>
                    </Field>
                  )}
                />
                <DocsField
                  label="accessFilter"
                  htmlFor="access-filter"
                  page="accessControl"
                  hash={DOCS_HASH.accessFiltering}
                  description="Comma-separated keys. Documents need at least one match. [null] is not the same as omitting the filter."
                  mono
                >
                  <Input
                    id="access-filter"
                    {...form.register("accessFilter")}
                    placeholder="team-a, team-b"
                  />
                </DocsField>
                <Controller
                  control={form.control}
                  name="includeNullAccess"
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(Boolean(checked))}
                      />
                      <FieldLabel>
                        Include documents with no access keys
                        <span className="-ml-1.5">
                          <DocsHelpIcon
                            page="accessControl"
                            hash={DOCS_HASH.accessNull}
                            label="Documents with no access keys"
                          />
                        </span>
                      </FieldLabel>
                    </Field>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

      <Button type="submit">Search</Button>

      <DataTable
        columns={columns}
        data={results}
        getRowId={(row) => row.id}
        selectedRowId={selected?.id}
        onRowClick={setSelected}
      />

      <JsonInspectSheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        title={selected?.id ?? ""}
        description="Search result detail."
      >
        {selected
          ? (
            <div className="grid gap-4">
              <CopyableReadonlyField
                id="result-distance"
                label="Distance"
                value={String(selected.distance)}
              />
              {selectedExplanation.length > 0
                ? (
                  <Field>
                    <FieldLabel>Explanation</FieldLabel>
                    <JsonEditor
                      value={prettyJson(selectedExplanation)}
                      readOnly
                    />
                  </Field>
                )
                : null}
              {selected.doc
                ? (
                  <Field>
                    <FieldLabel>Document</FieldLabel>
                    <JsonEditor
                      value={prettyJson(selected.doc)}
                      readOnly
                    />
                  </Field>
                )
                : null}
            </div>
          )
          : null}
      </JsonInspectSheet>

      <RequestInspector request={lastRequest} />
    </form>
  )
}
