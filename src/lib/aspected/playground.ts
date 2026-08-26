import { z } from "zod"
import { aspectTypeSchema } from "./types.ts"
import type { AspectType, SearchIndexRequest, StoredAspect } from "./types.ts"

/**
 * Smallest weight the server keeps. Anything lower is clamped to `0`, which
 * removes the aspect from scoring entirely.
 */
export const MIN_WEIGHT = 0.0001

/** Largest weight the server accepts before rejecting the request. */
export const MAX_WEIGHT = 10000

/** Lowest weight the slider can reach. */
const SLIDER_MIN_WEIGHT = 0.01

/** Slider travel, in discrete steps. */
export const SLIDER_STEPS = 100

/** Decades of weight covered by the full slider travel. */
const SLIDER_DECADES = 4

/**
 * Converts a weight to a slider position on a log scale.
 *
 * The scale spans `0.01` to `100` across `0` to `100`, so the midpoint is a
 * weight of `1`. A log scale matters because weights are multiplicative: the
 * step from `1` to `2` changes ranking as much as the step from `10` to `20`.
 */
export function weightToSlider(weight: number): number {
  if (!Number.isFinite(weight) || weight <= SLIDER_MIN_WEIGHT) {
    return 0
  }
  const position = (Math.log10(weight) / SLIDER_DECADES + 0.5) * SLIDER_STEPS
  return Math.round(Math.min(Math.max(position, 0), SLIDER_STEPS))
}

/**
 * Converts a slider position back to a weight, rounded for display.
 */
export function sliderToWeight(position: number): number {
  const clamped = Math.min(Math.max(position, 0), SLIDER_STEPS)
  const exponent = (clamped / SLIDER_STEPS - 0.5) * SLIDER_DECADES
  const weight = 10 ** exponent
  return Number(weight.toPrecision(3))
}

/**
 * Clamps a weight into the range the server accepts.
 *
 * Values under {@link MIN_WEIGHT} become `0` because that is what the server
 * does with them, so the UI stays honest about the request it is describing.
 */
export function clampWeight(weight: number): number {
  if (!Number.isFinite(weight) || weight <= 0) {
    return 0
  }
  if (weight < MIN_WEIGHT) {
    return 0
  }
  return Math.min(weight, MAX_WEIGHT)
}

/** One aspect row on the playground form. */
export const playgroundAspectSchema = z.object({
  name: z.string(),
  type: aspectTypeSchema,
  enabled: z.boolean(),
  value: z.string(),
  weight: z.number(),
})

/** React Hook Form schema for the playground. */
export const playgroundFormSchema = z.object({
  k: z.string().refine(
    (value) =>
      value.trim() !== "" && Number.isInteger(Number(value)) &&
      Number(value) >= 1,
    "k must be a positive integer",
  ),
  autoRun: z.boolean(),
  aspects: z.array(playgroundAspectSchema),
})

export type PlaygroundAspectValues = z.infer<typeof playgroundAspectSchema>
export type PlaygroundFormValues = z.infer<typeof playgroundFormSchema>

/**
 * Seeds one form row per index aspect, all enabled at weight `1`.
 */
export function aspectRowsFromSchema(
  schema: StoredAspect[],
): PlaygroundAspectValues[] {
  return schema.map((aspect) => ({
    name: aspect.name,
    type: aspect.type,
    enabled: true,
    value: "",
    weight: 1,
  }))
}

/**
 * Coerces a form string into the JSON shape the resolver for `type` expects.
 *
 * @throws SyntaxError when a `raw` aspect does not hold a JSON number array.
 */
export function coerceAspectValue(
  type: AspectType,
  value: string,
): string | number | { $raw: number[] } {
  const trimmed = value.trim()

  if (type === "number") {
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed)) {
      throw new SyntaxError(`Aspect value "${value}" is not a number`)
    }
    return parsed
  }

  if (type === "raw") {
    const parsed = JSON.parse(trimmed)
    if (
      !Array.isArray(parsed) ||
      parsed.some((entry) => typeof entry !== "number")
    ) {
      throw new SyntaxError("Raw aspect values must be an array of numbers")
    }
    return { $raw: parsed }
  }

  return trimmed
}

/** Aspect rows that will take part in the next search. */
export function activeAspects(
  values: PlaygroundFormValues,
): PlaygroundAspectValues[] {
  return values.aspects.filter((aspect) =>
    aspect.enabled && aspect.value.trim() !== "" &&
    clampWeight(aspect.weight) > 0
  )
}

/** Weights map for the aspects taking part in the next search. */
export function activeWeights(
  values: PlaygroundFormValues,
): Record<string, number> {
  return Object.fromEntries(
    activeAspects(values).map((aspect) => [
      aspect.name,
      clampWeight(aspect.weight),
    ]),
  )
}

/**
 * Weights for every aspect in the index, not just the ones being queried.
 *
 * An aspect left out of `query` is sparse and contributes nothing, whereas an
 * aspect present without a weight defaults to `1`. Local scoring has to tell
 * those apart, so absent aspects are pinned to `0` rather than omitted.
 */
export function scoringWeights(
  values: PlaygroundFormValues,
): Record<string, number> {
  const active = new Set(
    activeAspects(values).map((aspect) => aspect.name),
  )
  return Object.fromEntries(
    values.aspects.map((aspect) => [
      aspect.name,
      active.has(aspect.name) ? clampWeight(aspect.weight) : 0,
    ]),
  )
}

/**
 * Builds the search body for the current playground state.
 *
 * Disabled aspects, blank values, and weights that clamp to `0` are all left
 * out of `query` so the server treats those dimensions as sparse rather than
 * scoring them against an empty value.
 *
 * @throws SyntaxError when an aspect value cannot be coerced for its resolver.
 */
export function buildPlaygroundRequest(
  values: PlaygroundFormValues,
): SearchIndexRequest {
  const active = activeAspects(values)
  const query: Record<string, string | number | { $raw: number[] }> = {}

  for (const aspect of active) {
    query[aspect.name] = coerceAspectValue(aspect.type, aspect.value)
  }

  const request: SearchIndexRequest = {
    k: Number(values.k),
    query,
    withDocs: true,
    withExplanation: true,
  }

  const weights = activeWeights(values)
  if (Object.keys(weights).length > 0) {
    request.weights = weights
  }

  return request
}
