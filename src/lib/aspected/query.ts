import { z } from "zod"
import { aspectValueSchema } from "./aspect-value.ts"
import { coerceAspectValue, MAX_WEIGHT } from "./playground.ts"
import {
  type AspectType,
  aspectTypeSchema,
  type SearchIndexRequest,
  type StoredAspect,
} from "./types.ts"

/**
 * Optional search weight string. Blank means omit (server default 1).
 * Otherwise a finite number in `0`…{@link MAX_WEIGHT}.
 */
export const searchWeightSchema = z.string().superRefine((value, ctx) => {
  const trimmed = value.trim()
  if (trimmed === "") {
    return
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: "custom", message: "Weight must be a number" })
    return
  }
  if (parsed < 0 || parsed > MAX_WEIGHT) {
    ctx.addIssue({
      code: "custom",
      message: `Weight must be between 0 and ${MAX_WEIGHT}`,
    })
  }
})

/** A single aspect field on the sparse search form. */
export type SparseAspectInput = {
  name: string
  type: AspectType
  value: string
  weight: string
}

/**
 * Builds a search body from the sparse form. Blank aspect values are omitted
 * so those dimensions stay undefined on the server.
 */
export function buildSparseSearchRequest(input: {
  k: number
  aspects: SparseAspectInput[]
  accessFilter: string
  includeNullAccess: boolean
  withDocs: boolean
  withVectors: boolean
  withExplanation: boolean
}): SearchIndexRequest {
  const query: Record<string, string | number | { $raw: number[] }> = {}
  const weights: Record<string, number> = {}

  for (const aspect of input.aspects) {
    const trimmed = aspect.value.trim()
    if (!trimmed) {
      continue
    }

    query[aspect.name] = coerceAspectValue(aspect.type, aspect.value)

    const weight = Number(aspect.weight)
    if (aspect.weight.trim() !== "" && !Number.isNaN(weight)) {
      weights[aspect.name] = weight
    }
  }

  const request: SearchIndexRequest = {
    k: input.k,
    query,
    withDocs: input.withDocs,
    withVectors: input.withVectors,
    withExplanation: input.withExplanation,
  }

  if (Object.keys(weights).length > 0) {
    request.weights = weights
  }

  const filter = parseAccessFilter(input.accessFilter, input.includeNullAccess)
  if (filter !== undefined) {
    request.accessFilter = filter
  }

  return request
}

const searchAspectRowSchema = z.object({
  name: z.string(),
  type: aspectTypeSchema,
  value: z.string(),
  weight: searchWeightSchema,
})

/**
 * React Hook Form schema for the index search page.
 *
 * Pass the loaded index schema so aspect values are validated against resolver
 * settings. An empty schema keeps shape-only checks for unit tests.
 */
export function searchFormSchema(schema: StoredAspect[] = []) {
  const byName = new Map(schema.map((aspect) => [aspect.name, aspect]))
  return z.object({
    k: z.string().refine(
      (v) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= 1,
      "k must be a positive integer",
    ),
    aspects: z.array(
      searchAspectRowSchema.superRefine((row, ctx) => {
        const aspect = byName.get(row.name)
        if (!aspect) {
          return
        }
        const result = aspectValueSchema(aspect).safeParse(row.value)
        if (!result.success) {
          for (const issue of result.error.issues) {
            ctx.addIssue({
              code: "custom",
              message: issue.message,
              path: ["value"],
            })
          }
        }
      }),
    ),
    accessFilter: z.string(),
    includeNullAccess: z.boolean(),
    withDocs: z.boolean(),
    withExplanation: z.boolean(),
    withVectors: z.boolean(),
  })
}

export type SearchFormValues = z.infer<ReturnType<typeof searchFormSchema>>

/**
 * Parses a comma-separated access filter. Empty input means no filter.
 */
export function parseAccessFilter(
  raw: string,
  includeNull: boolean,
): Array<string | null> | undefined {
  const keys = raw.split(",").map((part) => part.trim()).filter(Boolean)
  if (keys.length === 0 && !includeNull) {
    return undefined
  }

  const filter: Array<string | null> = [...keys]
  if (includeNull) {
    filter.push(null)
  }
  return filter
}
