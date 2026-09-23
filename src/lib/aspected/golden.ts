import { z } from "zod"
import { aspectTypeSchema } from "./types.ts"
import type { StoredAspect } from "./types.ts"
import type { PlaygroundFormValues } from "./playground.ts"

/** localStorage key for every golden set saved in this browser. */
export const GOLDEN_SETS_STORAGE_KEY = "aspected-studio.golden-sets"

/** Current on-disk shape. Bumped only when a migration is needed. */
export const GOLDEN_SET_VERSION = 1

/** Metric a set grades its chips on. */
export const goldenMetricSchema = z.enum([
  "precision",
  "recall",
  "mrr",
  "ndcg",
])

/** Key of the metric a set grades its chips on. */
export type GoldenMetricKey = z.infer<typeof goldenMetricSchema>

/**
 * One expected document, with a graded gain.
 *
 * A `gain` of `1` is plain relevant. Higher gains mark documents that should
 * rank above the merely relevant ones, which is the only part of nDCG that
 * binary judgements cannot express.
 */
export const goldenJudgementSchema = z.object({
  id: z.string().min(1),
  gain: z.number().positive(),
})

/** One expected document with a graded gain. */
export type GoldenJudgement = z.infer<typeof goldenJudgementSchema>

/** Query aspect for a case. A playground row without the weight. */
export const goldenCaseAspectSchema = z.object({
  name: z.string(),
  type: aspectTypeSchema,
  enabled: z.boolean(),
  value: z.string(),
})

/** Query aspect for a case. */
export type GoldenCaseAspect = z.infer<typeof goldenCaseAspectSchema>

/** One test case: a sparse query plus the documents it should return. */
export const goldenCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  aspects: z.array(goldenCaseAspectSchema),
  expected: z.array(goldenJudgementSchema),
  /** Ids that must not appear in the top `k`. Any hit forces a red chip. */
  forbidden: z.array(z.string()).default([]),
  /** Per-case override. `null` inherits the set default. */
  k: z.number().int().positive().nullable().default(null),
  notes: z.string().default(""),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})

/** One test case in a golden set. */
export type GoldenCase = z.infer<typeof goldenCaseSchema>

/** Chip thresholds on the set's primary metric. */
export const goldenThresholdsSchema = z.object({
  metric: goldenMetricSchema,
  green: z.number().min(0).max(1),
  amber: z.number().min(0).max(1),
})

/** Chip thresholds on the set's primary metric. */
export type GoldenThresholds = z.infer<typeof goldenThresholdsSchema>

/** A named collection of cases scoped to one index. */
export const goldenSetSchema = z.object({
  version: z.literal(GOLDEN_SET_VERSION),
  id: z.string().min(1),
  name: z.string(),
  indexName: z.string(),
  k: z.number().int().positive(),
  thresholds: goldenThresholdsSchema,
  cases: z.array(goldenCaseSchema),
  updatedAt: z.number().default(0),
})

/** A named collection of cases scoped to one index. */
export type GoldenSet = z.infer<typeof goldenSetSchema>

const goldenSetsSchema = z.array(goldenSetSchema)

/** Default chip thresholds for a fresh set. */
export const DEFAULT_THRESHOLDS: GoldenThresholds = {
  metric: "ndcg",
  green: 0.8,
  amber: 0.5,
}

/** Default `k` for a fresh set, matching the playground default. */
export const DEFAULT_GOLDEN_K = 20

/**
 * Creates a unique id for a set or a case.
 */
export function newGoldenId(): string {
  return crypto.randomUUID()
}

/**
 * Effective `k` for one case, falling back to the set default.
 */
export function caseK(set: GoldenSet, item: GoldenCase): number {
  return item.k ?? set.k
}

/**
 * Judgement lookup for one case, keyed by document id.
 *
 * Later entries win, so a set edited by hand with a duplicated id still
 * grades against a single gain instead of double counting the hit.
 */
export function judgementMap(item: GoldenCase): Map<string, number> {
  return new Map(item.expected.map((entry) => [entry.id, entry.gain]))
}

/** Shown wherever a set has no name of its own yet. */
export const UNTITLED_GOLDEN_SET = "Untitled set"

/**
 * Name to show for a set.
 *
 * A set is created without a name so the field reads as something to fill in
 * rather than something already done. Every surface that lists sets goes
 * through this, so an unnamed set is still selectable instead of blank.
 */
export function goldenSetDisplayName(set: GoldenSet): string {
  return set.name.trim() || UNTITLED_GOLDEN_SET
}

/** Name to show for a case that has not been named yet. */
export function goldenCaseDisplayName(item: GoldenCase): string {
  return item.name.trim() || "Untitled"
}

/**
 * An empty set seeded with one blank case per index aspect layout.
 *
 * The name is left blank on purpose: the page focuses the name field after
 * creating, and {@link goldenSetDisplayName} covers every read of it.
 */
export function emptyGoldenSet(
  indexName: string,
  schema: StoredAspect[],
): GoldenSet {
  return {
    version: GOLDEN_SET_VERSION,
    id: newGoldenId(),
    name: "",
    indexName,
    k: DEFAULT_GOLDEN_K,
    thresholds: { ...DEFAULT_THRESHOLDS },
    cases: [emptyGoldenCase(schema, "Case 1")],
    updatedAt: Date.now(),
  }
}

/**
 * A blank case with one row per index aspect, all rows off until filled in.
 */
export function emptyGoldenCase(
  schema: StoredAspect[],
  name: string,
): GoldenCase {
  return {
    id: newGoldenId(),
    name,
    aspects: schema.map((aspect) => ({
      name: aspect.name,
      type: aspect.type,
      enabled: false,
      value: "",
    })),
    expected: [],
    forbidden: [],
    k: null,
    notes: "",
    tags: [],
    enabled: true,
  }
}

/**
 * Turns the current playground query into a case, dropping the weights.
 *
 * Weights describe the config under test, not the case, so a case captures
 * only the query. That is what lets one set grade every weight candidate.
 */
export function caseFromPlaygroundValues(
  values: PlaygroundFormValues,
  name: string,
  expectedIds: string[] = [],
): GoldenCase {
  return {
    id: newGoldenId(),
    name,
    aspects: values.aspects.map((aspect) => ({
      name: aspect.name,
      type: aspect.type,
      enabled: aspect.value.trim() !== "",
      value: aspect.value,
    })),
    expected: expectedIds.map((id) => ({ id, gain: 1 })),
    forbidden: [],
    k: null,
    notes: "",
    tags: [],
    enabled: true,
  }
}

/**
 * Reads every saved set. Invalid JSON or schema falls back to an empty list,
 * so one hand-edited entry cannot lock the user out of the feature.
 */
export function loadGoldenSets(): GoldenSet[] {
  const raw = localStorage.getItem(GOLDEN_SETS_STORAGE_KEY)
  if (raw === null) {
    return []
  }

  try {
    const parsed = goldenSetsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/**
 * Persists the full set list.
 */
export function saveGoldenSets(sets: GoldenSet[]): void {
  localStorage.setItem(GOLDEN_SETS_STORAGE_KEY, JSON.stringify(sets))
}

/**
 * Inserts or replaces one set and writes the list. Stamps `updatedAt`.
 */
export function upsertGoldenSet(set: GoldenSet): GoldenSet {
  const stamped: GoldenSet = { ...set, updatedAt: Date.now() }
  const current = loadGoldenSets()
  const index = current.findIndex((item) => item.id === stamped.id)
  const next = index === -1
    ? [...current, stamped]
    : current.map((item, itemIndex) => itemIndex === index ? stamped : item)
  saveGoldenSets(next)
  return stamped
}

/**
 * Removes one set and returns the remaining list.
 */
export function removeGoldenSet(id: string): GoldenSet[] {
  const next = loadGoldenSets().filter((item) => item.id !== id)
  saveGoldenSets(next)
  return next
}

/**
 * Saved sets scoped to one index, in insertion order.
 */
export function goldenSetsForIndex(indexName: string): GoldenSet[] {
  return loadGoldenSets().filter((set) => set.indexName === indexName)
}

/**
 * A copy of a set under a new id, ready to diverge from the original.
 *
 * An unnamed original stays unnamed rather than becoming " copy", so both
 * sets read as Untitled until the user names them.
 */
export function duplicateGoldenSet(set: GoldenSet): GoldenSet {
  const trimmed = set.name.trim()
  return {
    ...structuredClone(set),
    id: newGoldenId(),
    name: trimmed === "" ? "" : `${trimmed} copy`,
    cases: set.cases.map((item) => ({
      ...structuredClone(item),
      id: newGoldenId(),
    })),
    updatedAt: Date.now(),
  }
}

/**
 * Set as repo-friendly JSON: stable key order, no local id or timestamp.
 *
 * Ids are regenerated on import so two people can commit the same file and
 * still keep separate local copies without colliding.
 */
export function serializeGoldenSet(set: GoldenSet): string {
  return JSON.stringify(
    {
      version: set.version,
      name: set.name,
      indexName: set.indexName,
      k: set.k,
      thresholds: set.thresholds,
      cases: set.cases.map((item) => ({
        name: item.name,
        enabled: item.enabled,
        k: item.k,
        aspects: item.aspects.map((aspect) => ({
          name: aspect.name,
          type: aspect.type,
          enabled: aspect.enabled,
          value: aspect.value,
        })),
        expected: item.expected,
        forbidden: item.forbidden,
        tags: item.tags,
        notes: item.notes,
      })),
    },
    null,
    2,
  )
}

/**
 * Pretty-printed import template with every export field present.
 *
 * Used to fill the import editor when no file has been chosen yet, so the
 * shape is visible without leaving the sheet. Aspect rows follow `schema`
 * when provided; otherwise one sample text aspect is included.
 */
export function goldenSetImportStub(
  indexName: string,
  schema: StoredAspect[] = [],
): string {
  const aspects = schema.length > 0
    ? schema.map((aspect) => ({
      name: aspect.name,
      type: aspect.type,
      enabled: false,
      value: "",
    }))
    : [{
      name: "title",
      type: "text" as const,
      enabled: true,
      value: "",
    }]

  return JSON.stringify(
    {
      version: GOLDEN_SET_VERSION,
      name: "",
      indexName,
      k: DEFAULT_GOLDEN_K,
      thresholds: { ...DEFAULT_THRESHOLDS },
      cases: [
        {
          name: "",
          enabled: true,
          k: null,
          aspects,
          expected: [{ id: "document-id", gain: 1 }],
          forbidden: ["must-not-rank"],
          tags: [],
          notes: "",
        },
      ],
    },
    null,
    2,
  )
}

/** Outcome of parsing a pasted or uploaded set. */
export type GoldenImportResult =
  | { ok: true; set: GoldenSet }
  | { ok: false; error: string }

const importedSetSchema = goldenSetSchema
  .omit({ id: true, updatedAt: true })
  .extend({
    cases: z.array(goldenCaseSchema.omit({ id: true })),
  })

/**
 * Parses an exported set, assigning fresh local ids.
 *
 * @param json - File or clipboard contents.
 * @param indexName - Index to attach the set to. Defaults to the file's own.
 */
export function parseGoldenSet(
  json: string,
  indexName?: string,
): GoldenImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: "Not valid JSON" }
  }

  const parsed = importedSetSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join(".")
    return {
      ok: false,
      error: path ? `${path}: ${issue.message}` : "Not a golden set",
    }
  }

  return {
    ok: true,
    set: {
      ...parsed.data,
      id: newGoldenId(),
      indexName: indexName ?? parsed.data.indexName,
      cases: parsed.data.cases.map((item) => ({
        ...item,
        id: newGoldenId(),
      })),
      updatedAt: Date.now(),
    },
  }
}

/**
 * Suggested filename for an exported set.
 *
 * Slugged from the displayed name, so an unnamed set still exports as
 * `untitled-set.json` rather than a bare fallback.
 */
export function goldenSetFilename(set: GoldenSet): string {
  const slug = goldenSetDisplayName(set)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${slug || "golden-set"}.json`
}
