import { z } from "zod"

/** localStorage key for saved tuned configs in this browser. */
export const TUNED_CONFIGS_STORAGE_KEY = "aspected-studio.tuned-configs"

/** Current on-disk shape. */
export const TUNED_CONFIG_VERSION = 1

/** One saved Auto-tune result. */
export const tunedConfigSchema = z.object({
  version: z.literal(TUNED_CONFIG_VERSION),
  id: z.string().min(1),
  name: z.string(),
  indexName: z.string(),
  goldenSetId: z.string(),
  goldenSetName: z.string(),
  weights: z.record(z.string(), z.number()),
  fetchK: z.number().int().positive(),
  primaryMetric: z.string(),
  trainPrimary: z.number(),
  holdoutPrimary: z.number().nullable(),
  objectiveValue: z.number(),
  noiseFloor: z.number(),
  rationale: z.array(z.string()),
  createdAt: z.number(),
  /** Split seed when holdout was used; omitted on older saves. */
  holdoutSeed: z.number().nullable().optional(),
})

/** One saved Auto-tune result. */
export type TunedConfig = z.infer<typeof tunedConfigSchema>

const tunedConfigsSchema = z.array(tunedConfigSchema)

/**
 * Creates a unique id for a tuned config.
 */
export function newTunedConfigId(): string {
  return crypto.randomUUID()
}

/**
 * Reads every saved tuned config. Invalid JSON falls back to [].
 */
export function loadTunedConfigs(): TunedConfig[] {
  const raw = localStorage.getItem(TUNED_CONFIGS_STORAGE_KEY)
  if (raw === null) {
    return []
  }
  try {
    const parsed = tunedConfigsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/**
 * Persists the full tuned-config list.
 */
export function saveTunedConfigs(configs: TunedConfig[]): void {
  localStorage.setItem(TUNED_CONFIGS_STORAGE_KEY, JSON.stringify(configs))
}

/**
 * Inserts or replaces one config and writes the list.
 */
export function upsertTunedConfig(config: TunedConfig): TunedConfig {
  const current = loadTunedConfigs()
  const index = current.findIndex((item) => item.id === config.id)
  const next = index === -1
    ? [...current, config]
    : current.map((item, itemIndex) => itemIndex === index ? config : item)
  saveTunedConfigs(next)
  return config
}

/**
 * Removes one config and returns the remaining list.
 */
export function removeTunedConfig(id: string): TunedConfig[] {
  const next = loadTunedConfigs().filter((item) => item.id !== id)
  saveTunedConfigs(next)
  return next
}

/**
 * Saved configs scoped to one index, newest first.
 */
export function tunedConfigsForIndex(indexName: string): TunedConfig[] {
  return loadTunedConfigs()
    .filter((item) => item.indexName === indexName)
    .sort((left, right) => right.createdAt - left.createdAt)
}

/**
 * Repo-friendly JSON export without the local id.
 */
export function serializeTunedConfig(config: TunedConfig): string {
  const payload = {
    version: config.version,
    name: config.name,
    indexName: config.indexName,
    goldenSetId: config.goldenSetId,
    goldenSetName: config.goldenSetName,
    weights: config.weights,
    fetchK: config.fetchK,
    primaryMetric: config.primaryMetric,
    trainPrimary: config.trainPrimary,
    holdoutPrimary: config.holdoutPrimary,
    objectiveValue: config.objectiveValue,
    noiseFloor: config.noiseFloor,
    rationale: config.rationale,
    holdoutSeed: config.holdoutSeed ?? null,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * Filename for a downloaded tuned config.
 */
export function tunedConfigFilename(config: TunedConfig): string {
  const slug = config.name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "tuned-config"
  return `${slug}.json`
}
