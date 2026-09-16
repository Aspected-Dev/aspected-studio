import { z } from "zod"

/** Supported HNSW distance metrics on the Aspected server. */
export const distanceTypeSchema = z.enum([
  "Manhattan",
  "Euclidean",
  "DotProduct",
  "Cosine",
])

/** Resolver type used by an index aspect. */
export const aspectTypeSchema = z.enum([
  "enum",
  "text",
  "number",
  "datetime",
  "raw",
  "dict",
])

const enumSettingsSchema = z.object({
  values: z.array(z.string()).min(1),
  maxValuesPerRadial: z.number().int().positive().optional(),
})

const textSettingsSchema = z.object({
  model: z.string().min(1),
})

const numberSettingsSchema = z.object({
  min: z.number().optional(),
  max: z.number(),
})

/** Granularity modes the datetime resolver accepts. */
export const datetimeGranularitySchema = z.enum([
  "hour",
  "day",
  "weekday",
  "month",
  "year",
  "timestamp",
])

/** Granularity modes the datetime resolver accepts. */
export type DatetimeGranularity = z.infer<typeof datetimeGranularitySchema>
const datetimeSettingsSchema = z.object({
  granularity: z.union([
    datetimeGranularitySchema,
    z.array(datetimeGranularitySchema).min(1),
  ]),
  format: z.string().optional(),
  minYear: z.number().int().optional(),
  maxYear: z.number().int().optional(),
})

const rawSettingsSchema = z.object({
  numDims: z.number().int().positive(),
})

const dictSettingsSchema = z.object({
  values: z.record(z.string(), z.number()),
})

const aspectBaseSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  multiplier: z.number().optional(),
})

/** Aspect definition sent when creating an index. */
export const aspectSchema = z.discriminatedUnion("type", [
  aspectBaseSchema.extend({
    type: z.literal("enum"),
    settings: enumSettingsSchema,
  }),
  aspectBaseSchema.extend({
    type: z.literal("text"),
    settings: textSettingsSchema,
  }),
  aspectBaseSchema.extend({
    type: z.literal("number"),
    settings: numberSettingsSchema,
  }),
  aspectBaseSchema.extend({
    type: z.literal("datetime"),
    settings: datetimeSettingsSchema,
  }),
  aspectBaseSchema.extend({
    type: z.literal("raw"),
    settings: rawSettingsSchema,
  }),
  aspectBaseSchema.extend({
    type: z.literal("dict"),
    settings: dictSettingsSchema,
  }),
])

/** Optional HNSW knobs. Unset keys are omitted so the server keeps defaults. */
export const hnswConfigSchema = z.object({
  M: z.number().int().positive().optional(),
  Mmax: z.number().int().positive().optional(),
  Mmax0: z.number().int().positive().optional(),
  mL: z.number().positive().optional(),
  efConstruction: z.number().int().positive().optional(),
  efSearch: z.number().int().positive().optional(),
  extendCandidates: z.boolean().optional(),
  keepPrunedConnections: z.boolean().optional(),
  maxStoreSize: z.number().int().positive().optional(),
})

/** Body for `PUT /indexes/{name}`. Field is `schema`, not `aspects`. */
export const createIndexRequestSchema = z.object({
  idSize: z.number().int().positive(),
  distanceType: distanceTypeSchema.optional(),
  schema: z.array(aspectSchema).min(1),
  hnsw: hnswConfigSchema.optional(),
})

const jsonObjectSchema = z.record(z.string(), z.unknown())

const queryRawSchema = z.object({
  $raw: z.array(z.number()),
})

const queryValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  queryRawSchema,
  z.array(z.unknown()),
  jsonObjectSchema,
])

/** Body for `POST /indexes/{name}/search`. */
export const searchIndexRequestSchema = z.object({
  k: z.number().int().positive(),
  query: z.record(z.string(), queryValueSchema).optional(),
  doc: jsonObjectSchema.optional(),
  weights: z.record(z.string(), z.number()).optional(),
  accessFilter: z.array(z.string().nullable()).optional(),
  withDocs: z.boolean().optional(),
  withVectors: z.boolean().optional(),
  withExplanation: z.boolean().optional(),
}).refine(
  (value) => value.query !== undefined || value.doc !== undefined,
  { message: "Search requires query or doc" },
)

const duplicatePolicySchema = z.enum(["Replace", "Ignore", "Fail"])
const missingPolicySchema = z.enum(["Ignore", "Fail"])

const rowPolicySchema = z.object({
  duplicate: duplicatePolicySchema.optional(),
  missing: missingPolicySchema.optional(),
})

const uploadDocRowSchema = z.object({
  id: z.string().min(1),
  doc: jsonObjectSchema.optional(),
  vectors: z.record(z.string(), z.array(z.number())).optional(),
  accessList: z.array(z.string()).optional(),
  policy: rowPolicySchema.optional(),
})

/** Body for `POST /indexes/{name}/docs`. Omit `doc` to delete a row. */
export const uploadDocsRequestSchema = z.object({
  data: z.array(uploadDocRowSchema).min(1),
  policy: rowPolicySchema.optional(),
})

const envelopeFields = {
  time: z.number().optional(),
  status: z.string().optional(),
}

/** `GET /status` payload flattened with the HTTP envelope. */
export const statusResponseSchema = z.object({
  version: z.string(),
  uptime: z.string(),
  config: z.object({
    corsEnabled: z.boolean(),
    httpsEnabled: z.boolean(),
    tokenAuthEnabled: z.boolean(),
  }),
  ...envelopeFields,
})

/** `GET /indexes` paginated list. */
export const listIndexesResponseSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  data: z.array(z.object({ name: z.string() })),
  ...envelopeFields,
})

const indexHnswSchema = z.object({
  M: z.number(),
  Mmax: z.number(),
  Mmax0: z.number(),
  mL: z.number(),
  efConstruction: z.number(),
  efSearch: z.number(),
  extendCandidates: z.boolean(),
  keepPrunedConnections: z.boolean(),
  maxStoreSize: z.number(),
})

/** Stored aspect as returned by `GET /indexes/{name}`. */
export const storedAspectSchema = z.object({
  name: z.string(),
  type: aspectTypeSchema,
  path: z.string(),
  settings: z.record(z.string(), z.unknown()),
  multiplier: z.number().optional(),
})

/** `GET /indexes/{name}` payload. */
export const getIndexResponseSchema = z.object({
  data: z.object({
    name: z.string(),
    idSize: z.number(),
    numDims: z.number(),
    distanceType: distanceTypeSchema,
    schema: z.array(storedAspectSchema),
    hnsw: indexHnswSchema,
  }),
  ...envelopeFields,
})

export const createIndexResponseSchema = z.object({
  data: z.object({ created: z.boolean() }),
  ...envelopeFields,
})

export const deleteIndexResponseSchema = z.object({
  data: z.object({ deleted: z.boolean() }),
  ...envelopeFields,
})

const searchExplanationSchema = z.object({
  name: z.string().optional(),
  aspectName: z.string().optional(),
  value: z.unknown().optional(),
  distance: z.number().optional(),
})

const searchResultRowSchema = z.object({
  id: z.string(),
  distance: z.number(),
  vector: z.array(z.number()).optional(),
  doc: jsonObjectSchema.optional(),
  explanation: z.array(searchExplanationSchema).optional(),
})

export const searchIndexResponseSchema = z.object({
  data: z.array(searchResultRowSchema),
  ...envelopeFields,
})

const docEntrySchema = z.object({
  id: z.string(),
  doc: jsonObjectSchema,
  vector: z.array(z.number()).optional(),
  accessList: z.array(z.string()).optional(),
})

export const listDocsResponseSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  data: z.array(docEntrySchema),
  ...envelopeFields,
})

export const getDocResponseSchema = z.object({
  data: docEntrySchema,
  ...envelopeFields,
})

export const uploadDocsResponseSchema = z.object({
  data: z.object({
    created: z.array(z.string()),
    updated: z.array(z.string()),
    deleted: z.array(z.string()),
  }),
  ...envelopeFields,
})

export const errorResponseSchema = z.object({
  error: z.string().optional(),
  ...envelopeFields,
})

export type DistanceType = z.infer<typeof distanceTypeSchema>
export type AspectType = z.infer<typeof aspectTypeSchema>
export type Aspect = z.infer<typeof aspectSchema>
export type StoredAspect = z.infer<typeof storedAspectSchema>
export type HnswConfig = z.infer<typeof hnswConfigSchema>
export type CreateIndexRequest = z.infer<typeof createIndexRequestSchema>
export type SearchIndexRequest = z.infer<typeof searchIndexRequestSchema>
export type UploadDocsRequest = z.infer<typeof uploadDocsRequestSchema>
export type StatusResponse = z.infer<typeof statusResponseSchema>
export type ListIndexesResponse = z.infer<typeof listIndexesResponseSchema>
export type GetIndexResponse = z.infer<typeof getIndexResponseSchema>
export type IndexDetail = GetIndexResponse["data"]
export type SearchIndexResponse = z.infer<typeof searchIndexResponseSchema>
export type SearchResultRow = z.infer<typeof searchResultRowSchema>
export type ListDocsResponse = z.infer<typeof listDocsResponseSchema>
export type DocEntry = z.infer<typeof docEntrySchema>
export type GetDocResponse = z.infer<typeof getDocResponseSchema>
export type UploadDocsResponse = z.infer<typeof uploadDocsResponseSchema>
