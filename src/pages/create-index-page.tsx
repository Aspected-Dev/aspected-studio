import { useState } from "react"
import { Trash2Icon } from "lucide-react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import {
  DocsField,
  DocsHelpIcon,
  DocsTextLink,
  PageDocsButton,
} from "@/components/docs-help.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { type RecordedRequest } from "@/lib/aspected/client.ts"
import {
  ASPECT_TYPES,
  type CreateIndexDraft,
  createIndexFormSchema,
  type CreateIndexFormValues,
  createRequestToDraft,
  DATETIME_GRANULARITIES,
  DISTANCE_TYPES,
  draftToCreateRequest,
  emptyAspectDraft,
  emptyCreateIndexDraft,
} from "@/lib/aspected/create-index-form.ts"
import {
  type AspectType,
  createIndexRequestSchema,
  type DistanceType,
} from "@/lib/aspected/types.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import {
  DOCS_HASH,
  docsPageForAspectType,
  HNSW_FIELD_DOCS,
  INDEX_FIELD_DOCS,
} from "@/lib/docs.ts"

/**
 * Guided create-index form with a JSON source toggle.
 */
export function CreateIndexPage() {
  const { client } = useConnection()
  const navigate = useNavigate()
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonText, setJsonText] = useState("")
  const [lastRequest, setLastRequest] = useState<RecordedRequest | null>(null)

  const form = useForm<CreateIndexFormValues>({
    resolver: zodResolver(createIndexFormSchema),
    defaultValues: emptyCreateIndexDraft(),
  })

  const { fields: aspectFields, append, remove } = useFieldArray({
    control: form.control,
    name: "aspects",
  })

  function switchToJson() {
    try {
      const values = form.getValues()
      setJsonText(
        JSON.stringify(
          draftToCreateRequest(values as CreateIndexDraft),
          null,
          2,
        ),
      )
      setJsonMode(true)
    } catch (caught) {
      toastCaughtError(caught, "Could not switch to JSON")
    }
  }

  function switchToForm() {
    try {
      const parsed = createIndexRequestSchema.parse(JSON.parse(jsonText))
      const name = form.getValues("name")
      form.reset(createRequestToDraft(name, parsed) as CreateIndexFormValues)
      setJsonMode(false)
    } catch (caught) {
      toastCaughtError(caught, "Could not switch to the form")
    }
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const body = jsonMode
        ? createIndexRequestSchema.parse(JSON.parse(jsonText))
        : draftToCreateRequest(values as CreateIndexDraft)
      await client.createIndex(values.name.trim(), body)
      setLastRequest(client.lastRequest)
      toast.success(`Created ${values.name.trim()}`)
      navigate(`/indexes/${encodeURIComponent(values.name.trim())}`)
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Could not create index")
    }
  })

  const errors = form.formState.errors

  return (
    <form onSubmit={handleSubmit} className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-lg font-medium">Create index</h1>
          <p className="text-sm text-muted-foreground">
            An index is a list of aspects. Search can omit aspects, and those
            dimensions stay sparse. See the{" "}
            <DocsTextLink page="resolvers">resolver docs</DocsTextLink>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PageDocsButton page="resolvers" />
          <Button
            type="button"
            variant="outline"
            onClick={() => jsonMode ? switchToForm() : switchToJson()}
          >
            {jsonMode ? "Use form" : "Use JSON"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <DocsField
          label="Name"
          htmlFor="index-name"
          page="tutorial"
          hash={DOCS_HASH.tutorialCreate}
          blurb="Path segment for PUT /indexes/{name}."
          error={errors.name?.message}
        >
          <Input
            id="index-name"
            {...form.register("name")}
          />
        </DocsField>
        <DocsField
          label="idSize"
          htmlFor="id-size"
          page={INDEX_FIELD_DOCS.idSize.page}
          hash={INDEX_FIELD_DOCS.idSize.hash}
          blurb={INDEX_FIELD_DOCS.idSize.blurb}
          error={errors.idSize?.message}
          mono
        >
          <Input
            id="id-size"
            type="number"
            min={1}
            {...form.register("idSize")}
          />
        </DocsField>
        <DocsField
          label="Distance"
          page={INDEX_FIELD_DOCS.distanceType.page}
          blurb={INDEX_FIELD_DOCS.distanceType.blurb}
        >
          <Controller
            control={form.control}
            name="distanceType"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (value) {
                    field.onChange(value as DistanceType)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISTANCE_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </DocsField>
      </div>

      {jsonMode
        ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Same JSON body as{" "}
              <DocsTextLink
                page="tutorial"
                hash={DOCS_HASH.tutorialCreate}
              >
                creating an index in the tutorial
              </DocsTextLink>
              .
            </p>
            <JsonEditor
              value={jsonText}
              onChange={setJsonText}
            />
          </div>
        )
        : (
          <div className="grid gap-4">
            {errors.aspects?.root?.message && (
              <p className="text-sm text-destructive">
                {errors.aspects.root.message}
              </p>
            )}
            {aspectFields.map((field, index) => (
              <AspectCard
                key={field.id}
                index={index}
                form={form}
                onRemove={() => remove(index)}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                append(
                  emptyAspectDraft() as CreateIndexFormValues["aspects"][0],
                )}
            >
              Add aspect
            </Button>
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
                Advanced HNSW
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-3 pt-3 sm:grid-cols-3">
                {(Object.keys(emptyCreateIndexDraft().hnsw) as Array<
                  keyof CreateIndexFormValues["hnsw"]
                >).map((key) => {
                  const help = HNSW_FIELD_DOCS[key]
                  return (
                    <DocsField
                      key={key}
                      label={key}
                      htmlFor={`hnsw-${key}`}
                      page="hnsw"
                      hash={help?.hash}
                      blurb={help?.blurb}
                      error={errors.hnsw?.[key]?.message}
                      mono
                    >
                      <Input
                        id={`hnsw-${key}`}
                        {...form.register(`hnsw.${key}`)}
                      />
                    </DocsField>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

      <div className="flex gap-2">
        <Button type="submit">Create</Button>
      </div>

      <RequestInspector request={lastRequest} />
    </form>
  )
}

function AspectCard({
  index,
  form,
  onRemove,
}: {
  index: number
  form: ReturnType<typeof useForm<CreateIndexFormValues>>
  onRemove: () => void
}) {
  const errors = form.formState.errors
  const aspectErrors = errors.aspects?.[index]
  const type = form.watch(`aspects.${index}.type`) as AspectType

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium">Aspect {index + 1}</p>
          <DocsHelpIcon
            page={docsPageForAspectType(type)}
            label={`${type} resolver`}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2Icon />
          Remove
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DocsField
          label="Name"
          htmlFor={`aspect-${index}-name`}
          page="resolvers"
          blurb="Unique name for this aspect within the index."
          error={aspectErrors?.name?.message}
        >
          <Input
            id={`aspect-${index}-name`}
            {...form.register(`aspects.${index}.name`)}
          />
        </DocsField>
        <DocsField
          label="Type"
          page={docsPageForAspectType(type)}
          blurb="Resolver that turns this field into a vector."
        >
          <Controller
            control={form.control}
            name={`aspects.${index}.type`}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  if (value) {
                    field.onChange(value as AspectType)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </DocsField>
        <DocsField
          label="JSONPath"
          htmlFor={`aspect-${index}-path`}
          page="resolvers"
          hash={DOCS_HASH.jsonPath}
          description="Must start with $., for example $.category or $.details.description."
          error={aspectErrors?.path?.message}
        >
          <Input
            id={`aspect-${index}-path`}
            {...form.register(`aspects.${index}.path`)}
          />
        </DocsField>
        <DocsField
          label="Multiplier"
          htmlFor={`aspect-${index}-multiplier`}
          page="resolvers"
          blurb="Scales this aspect's vector. Defaults to 1. Requires Aspected 0.2.0 or later."
          error={aspectErrors?.multiplier?.message}
        >
          <Input
            id={`aspect-${index}-multiplier`}
            {...form.register(`aspects.${index}.multiplier`)}
            placeholder="1"
          />
        </DocsField>
      </div>
      <AspectSettings index={index} form={form} />
    </div>
  )
}

function AspectSettings({
  index,
  form,
}: {
  index: number
  form: ReturnType<typeof useForm<CreateIndexFormValues>>
}) {
  const type = form.watch(`aspects.${index}.type`) as AspectType
  const errors = form.formState.errors
  const aspectErrors = errors.aspects?.[index]

  switch (type) {
    case "enum":
      return (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <DocsField
            label="Values"
            htmlFor={`aspect-${index}-values`}
            page="resolverEnum"
            blurb="Unique categorical values. Extra radials are added when the count exceeds the cap."
            error={aspectErrors?.enumValues?.message}
          >
            <Textarea
              id={`aspect-${index}-values`}
              {...form.register(`aspects.${index}.enumValues`)}
              placeholder="red, green, blue"
            />
          </DocsField>
          <DocsField
            label="maxValuesPerRadial"
            htmlFor={`aspect-${index}-max-radial`}
            page="resolverEnum"
            blurb="Maximum values encoded per radial group. Default 5."
            error={aspectErrors?.maxValuesPerRadial?.message}
            mono
          >
            <Input
              id={`aspect-${index}-max-radial`}
              {...form.register(`aspects.${index}.maxValuesPerRadial`)}
              placeholder="5"
            />
          </DocsField>
        </div>
      )
    case "text":
      return (
        <div className="grid gap-2">
          <DocsField
            label="GGUF model"
            htmlFor={`aspect-${index}-model`}
            page="resolverText"
            hash={DOCS_HASH.downloadingModels}
            description="Filename in the server models directory. Models are not bundled. The first load can be slow."
            error={aspectErrors?.model?.message}
          >
            <Input
              id={`aspect-${index}-model`}
              {...form.register(`aspects.${index}.model`)}
            />
          </DocsField>
          <p className="text-xs text-muted-foreground">
            Mount models when using Docker. See{" "}
            <DocsTextLink page="gettingStarted" hash={DOCS_HASH.textModels}>
              Getting started
            </DocsTextLink>
            .
          </p>
        </div>
      )
    case "number":
      return (
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <DocsField
            label="min"
            htmlFor={`aspect-${index}-min`}
            page="resolverNumber"
            blurb="Lower bound of the value range. Default 0."
            error={aspectErrors?.min?.message}
          >
            <Input
              id={`aspect-${index}-min`}
              {...form.register(`aspects.${index}.min`)}
            />
          </DocsField>
          <DocsField
            label="max"
            htmlFor={`aspect-${index}-max`}
            page="resolverNumber"
            blurb="Upper bound. Must be greater than min. Values must stay in range."
            error={aspectErrors?.max?.message}
          >
            <Input
              id={`aspect-${index}-max`}
              {...form.register(`aspects.${index}.max`)}
            />
          </DocsField>
        </div>
      )
    case "datetime":
      return (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <p className="text-sm text-muted-foreground">Granularities</p>
            <DocsHelpIcon
              page="resolverDatetime"
              label="DateTime granularities"
              blurb="timestamp and weekday need Aspected 0.3.0 or later. format is only used in the legacy single-granularity mode."
            />
          </div>
          {aspectErrors?.granularities?.message && (
            <p className="text-sm text-destructive">
              {aspectErrors.granularities.message}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {DATETIME_GRANULARITIES.map((item) => (
              <Controller
                key={item}
                control={form.control}
                name={`aspects.${index}.granularities`}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={field.value.includes(item)}
                      onCheckedChange={(checked) => {
                        const selected = new Set(field.value)
                        if (checked) {
                          selected.add(item)
                        } else {
                          selected.delete(item)
                        }
                        field.onChange([...selected])
                      }}
                    />
                    <FieldLabel className="font-mono">{item}</FieldLabel>
                  </Field>
                )}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <DocsField
              label="format (legacy)"
              htmlFor={`aspect-${index}-format`}
              page="resolverDatetime"
              blurb="strftime format used only for the single-granularity legacy mode."
              mono
            >
              <Input
                id={`aspect-${index}-format`}
                {...form.register(`aspects.${index}.format`)}
              />
            </DocsField>
            <DocsField
              label="minYear"
              htmlFor={`aspect-${index}-min-year`}
              page="resolverDatetime"
              blurb="Inclusive minimum year when granularity includes year or timestamp. Default 1970."
              error={aspectErrors?.minYear?.message}
              mono
            >
              <Input
                id={`aspect-${index}-min-year`}
                {...form.register(`aspects.${index}.minYear`)}
              />
            </DocsField>
            <DocsField
              label="maxYear"
              htmlFor={`aspect-${index}-max-year`}
              page="resolverDatetime"
              blurb="Inclusive maximum year when granularity includes year or timestamp. Default 2030."
              error={aspectErrors?.maxYear?.message}
              mono
            >
              <Input
                id={`aspect-${index}-max-year`}
                {...form.register(`aspects.${index}.maxYear`)}
              />
            </DocsField>
          </div>
        </div>
      )
    case "raw":
      return (
        <DocsField
          label="numDims"
          htmlFor={`aspect-${index}-dims`}
          page="resolverRaw"
          blurb="Expected length of the pre-computed float array."
          error={aspectErrors?.numDims?.message}
          mono
        >
          <Input
            id={`aspect-${index}-dims`}
            {...form.register(`aspects.${index}.numDims`)}
          />
        </DocsField>
      )
    case "dict":
      return (
        <div className="grid gap-2">
          <DocsField
            label="values JSON"
            page="resolverDict"
            description="Licensed in Aspected 0.3.0 or later. Keys map to numbers, then a radial embedding like the number resolver."
            error={aspectErrors?.dictJson?.message}
          >
            <Controller
              control={form.control}
              name={`aspects.${index}.dictJson`}
              render={({ field }) => (
                <JsonEditor
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </DocsField>
        </div>
      )
    default:
      return null
  }
}
