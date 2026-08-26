import { z } from "zod"
import {
  type Aspect,
  type AspectType,
  aspectTypeSchema,
  type CreateIndexRequest,
  createIndexRequestSchema,
  type DistanceType,
  distanceTypeSchema,
} from "./types.ts"

const DATETIME_GRANULARITIES = [
  "hour",
  "day",
  "weekday",
  "month",
  "year",
  "timestamp",
] as const

/** Local draft used by the create-index form. */
export type AspectDraft = {
  key: string
  name: string
  type: AspectType
  path: string
  multiplier: string
  enumValues: string
  maxValuesPerRadial: string
  model: string
  min: string
  max: string
  granularities: string[]
  format: string
  minYear: string
  maxYear: string
  numDims: string
  dictJson: string
}

/** Create-index form state, including the index name used in the path. */
export type CreateIndexDraft = {
  name: string
  idSize: string
  distanceType: DistanceType
  aspects: AspectDraft[]
  hnsw: {
    M: string
    Mmax: string
    Mmax0: string
    mL: string
    efConstruction: string
    efSearch: string
    extendCandidates: string
    keepPrunedConnections: string
    maxStoreSize: string
  }
}

/**
 * Empty aspect row with a unique local key.
 */
export function emptyAspectDraft(key = crypto.randomUUID()): AspectDraft {
  return {
    key,
    name: "",
    type: "enum",
    path: "",
    multiplier: "",
    enumValues: "",
    maxValuesPerRadial: "",
    model: "nomic-embed-text-v1.5.f16.gguf",
    min: "0",
    max: "",
    granularities: ["day"],
    format: "",
    minYear: "",
    maxYear: "",
    numDims: "128",
    dictJson: '{\n  "key": 1\n}',
  }
}

/**
 * Default create-index form.
 */
export function emptyCreateIndexDraft(): CreateIndexDraft {
  const aspect = emptyAspectDraft()
  aspect.name = "category"
  aspect.path = "$.category"
  aspect.enumValues = "electronics, clothing"
  return {
    name: "products",
    idSize: "36",
    distanceType: "Cosine",
    aspects: [aspect],
    hnsw: {
      M: "",
      Mmax: "",
      Mmax0: "",
      mL: "",
      efConstruction: "",
      efSearch: "",
      extendCandidates: "",
      keepPrunedConnections: "",
      maxStoreSize: "",
    },
  }
}

/**
 * Converts a form draft into a `PUT /indexes/{name}` body.
 */
export function draftToCreateRequest(
  draft: CreateIndexDraft,
): CreateIndexRequest {
  const schema = draft.aspects.map(draftToAspect)
  const hnswEntries: Array<[string, number | boolean]> = []
  for (const [key, raw] of Object.entries(draft.hnsw)) {
    if (raw.trim() === "") {
      continue
    }
    if (key === "extendCandidates" || key === "keepPrunedConnections") {
      hnswEntries.push([key, raw === "true"])
      continue
    }
    hnswEntries.push([key, Number(raw)])
  }
  const hnsw = Object.fromEntries(hnswEntries)

  const request: CreateIndexRequest = {
    idSize: Number(draft.idSize),
    schema,
  }

  if (draft.distanceType !== "Cosine") {
    request.distanceType = draft.distanceType
  }

  if (Object.keys(hnsw).length > 0) {
    request.hnsw = hnsw
  }

  return createIndexRequestSchema.parse(request)
}

/**
 * Rebuilds form state from a JSON create body and index name.
 */
export function createRequestToDraft(
  name: string,
  request: CreateIndexRequest,
): CreateIndexDraft {
  const draft = emptyCreateIndexDraft()
  draft.name = name
  draft.idSize = String(request.idSize)
  draft.distanceType = request.distanceType ?? "Cosine"
  draft.aspects = request.schema.map((aspect) => aspectToDraft(aspect))
  if (request.hnsw) {
    for (
      const key of Object.keys(draft.hnsw) as Array<
        keyof CreateIndexDraft["hnsw"]
      >
    ) {
      const value = request.hnsw[key as keyof typeof request.hnsw]
      if (value !== undefined) {
        draft.hnsw[key] = String(value)
      }
    }
  }
  return draft
}

function draftToAspect(draft: AspectDraft): Aspect {
  const name = draft.name.trim()
  const path = draft.path.trim() || `$.${name}`
  const multiplier = draft.multiplier.trim() === ""
    ? undefined
    : Number(draft.multiplier)

  switch (draft.type) {
    case "enum":
      return {
        name,
        type: "enum",
        path,
        multiplier,
        settings: {
          values: splitList(draft.enumValues),
          maxValuesPerRadial: optionalNumber(draft.maxValuesPerRadial),
        },
      }
    case "text":
      return {
        name,
        type: "text",
        path,
        multiplier,
        settings: { model: draft.model.trim() },
      }
    case "number":
      return {
        name,
        type: "number",
        path,
        multiplier,
        settings: {
          min: optionalNumber(draft.min) ?? 0,
          max: Number(draft.max),
        },
      }
    case "datetime": {
      const granularity = DATETIME_GRANULARITIES.filter((item) =>
        draft.granularities.includes(item)
      )
      return {
        name,
        type: "datetime",
        path,
        multiplier,
        settings: {
          granularity: granularity.length === 1
            ? granularity[0]
            : [...granularity],
          format: draft.format.trim() || undefined,
          minYear: optionalNumber(draft.minYear),
          maxYear: optionalNumber(draft.maxYear),
        },
      }
    }
    case "raw":
      return {
        name,
        type: "raw",
        path,
        multiplier,
        settings: { numDims: Number(draft.numDims) },
      }
    case "dict":
      return {
        name,
        type: "dict",
        path,
        multiplier,
        settings: {
          values: JSON.parse(draft.dictJson) as Record<string, number>,
        },
      }
  }
}

function aspectToDraft(aspect: Aspect): AspectDraft {
  const draft = emptyAspectDraft()
  draft.name = aspect.name
  draft.type = aspect.type
  draft.path = aspect.path
  draft.multiplier = aspect.multiplier === undefined
    ? ""
    : String(aspect.multiplier)

  switch (aspect.type) {
    case "enum":
      draft.enumValues = aspect.settings.values.join(", ")
      draft.maxValuesPerRadial =
        aspect.settings.maxValuesPerRadial === undefined
          ? ""
          : String(aspect.settings.maxValuesPerRadial)
      break
    case "text":
      draft.model = aspect.settings.model
      break
    case "number":
      draft.min = aspect.settings.min === undefined
        ? ""
        : String(aspect.settings.min)
      draft.max = String(aspect.settings.max)
      break
    case "datetime": {
      const granularity = aspect.settings.granularity
      draft.granularities = Array.isArray(granularity)
        ? granularity
        : [granularity]
      draft.format = aspect.settings.format ?? ""
      draft.minYear = aspect.settings.minYear === undefined
        ? ""
        : String(aspect.settings.minYear)
      draft.maxYear = aspect.settings.maxYear === undefined
        ? ""
        : String(aspect.settings.maxYear)
      break
    }
    case "raw":
      draft.numDims = String(aspect.settings.numDims)
      break
    case "dict":
      draft.dictJson = JSON.stringify(aspect.settings.values, null, 2)
      break
  }

  return draft
}

function splitList(value: string): string[] {
  return value.split(/[\n,]/).map((part) => part.trim()).filter(Boolean)
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined
  }
  return Number(value)
}

/** Resolver types offered in the create-index form. */
export const ASPECT_TYPES = aspectTypeSchema.options
/** Distance metrics offered in the create-index form. */
export const DISTANCE_TYPES = [
  "Cosine",
  "Euclidean",
  "Manhattan",
  "DotProduct",
] as const satisfies readonly DistanceType[]
export { DATETIME_GRANULARITIES }

// ---------------------------------------------------------------------------
// React Hook Form schemas (string-valued draft fields validated before submit)
// ---------------------------------------------------------------------------

const positiveIntString = (message: string) =>
  z.string().refine(
    (v) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) > 0,
    message,
  )

const optionalPositiveIntString = z
  .string()
  .refine(
    (v) => v.trim() === "" || (Number.isInteger(Number(v)) && Number(v) > 0),
    "Must be a positive integer",
  )

const optionalNumberString = z
  .string()
  .refine(
    (v) => v.trim() === "" || !Number.isNaN(Number(v)),
    "Must be a number",
  )

const aspectDraftBaseSchema = z.object({
  key: z.string(),
  name: z
    .string()
    .min(1, "Aspect name is required"),
  path: z
    .string()
    .min(1, "JSONPath is required")
    .startsWith("$.", "JSONPath must start with $."),
  multiplier: optionalNumberString,
  // Unused fields for other types; validated by the discriminated branches.
  enumValues: z.string(),
  maxValuesPerRadial: z.string(),
  model: z.string(),
  min: z.string(),
  max: z.string(),
  granularities: z.array(z.string()),
  format: z.string(),
  minYear: z.string(),
  maxYear: z.string(),
  numDims: z.string(),
  dictJson: z.string(),
})

/** Per-type validation rules layered on top of the shared draft schema. */
const aspectDraftSchema = z.discriminatedUnion("type", [
  aspectDraftBaseSchema.extend({
    type: z.literal("enum"),
    enumValues: z.string().min(1, "At least one value is required"),
    maxValuesPerRadial: optionalPositiveIntString,
  }),
  aspectDraftBaseSchema.extend({
    type: z.literal("text"),
    model: z.string().min(1, "GGUF model filename is required"),
  }),
  aspectDraftBaseSchema.extend({
    type: z.literal("number"),
    min: optionalNumberString,
    max: z.string().min(1, "Max is required"),
  }).superRefine((val, ctx) => {
    const min = val.min.trim() === "" ? 0 : Number(val.min)
    const max = Number(val.max)
    if (!Number.isNaN(min) && !Number.isNaN(max) && max <= min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Max must be greater than min",
        path: ["max"],
      })
    }
  }),
  aspectDraftBaseSchema.extend({
    type: z.literal("datetime"),
    granularities: z.array(z.string()).min(
      1,
      "Select at least one granularity",
    ),
    minYear: optionalPositiveIntString,
    maxYear: optionalPositiveIntString,
  }),
  aspectDraftBaseSchema.extend({
    type: z.literal("raw"),
    numDims: positiveIntString("Number of dimensions is required"),
  }),
  aspectDraftBaseSchema.extend({
    type: z.literal("dict"),
    dictJson: z.string().min(1, "Values JSON is required"),
  }),
])

const hnswDraftSchema = z.object({
  M: optionalPositiveIntString,
  Mmax: optionalPositiveIntString,
  Mmax0: optionalPositiveIntString,
  mL: optionalNumberString,
  efConstruction: optionalPositiveIntString,
  efSearch: optionalPositiveIntString,
  extendCandidates: z.string(),
  keepPrunedConnections: z.string(),
  maxStoreSize: optionalPositiveIntString,
})

/** React Hook Form validation schema for the create-index form. */
export const createIndexFormSchema = z.object({
  name: z
    .string()
    .min(1, "Index name is required")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Only letters, digits, underscores, and hyphens are allowed",
    ),
  idSize: positiveIntString("ID size must be a positive integer"),
  distanceType: distanceTypeSchema,
  aspects: z.array(aspectDraftSchema).min(1, "Add at least one aspect"),
  hnsw: hnswDraftSchema,
})

export type CreateIndexFormValues = z.infer<typeof createIndexFormSchema>
