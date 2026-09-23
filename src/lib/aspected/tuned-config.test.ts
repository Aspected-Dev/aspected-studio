import { beforeEach, describe, expect, it } from "vitest"
import {
  loadTunedConfigs,
  newTunedConfigId,
  removeTunedConfig,
  serializeTunedConfig,
  TUNED_CONFIG_VERSION,
  TUNED_CONFIGS_STORAGE_KEY,
  type TunedConfig,
  tunedConfigFilename,
  tunedConfigsForIndex,
  upsertTunedConfig,
} from "./tuned-config.ts"

function sample(overrides: Partial<TunedConfig> = {}): TunedConfig {
  return {
    version: TUNED_CONFIG_VERSION,
    id: newTunedConfigId(),
    name: "Catalog champion",
    indexName: "catalog",
    goldenSetId: "set-1",
    goldenSetName: "Catalog baseline",
    weights: { title: 1.5, price: 6.3, rating: 0 },
    fetchK: 20,
    primaryMetric: "ndcg",
    trainPrimary: 0.97,
    holdoutPrimary: 0.95,
    objectiveValue: 0.97,
    noiseFloor: 0.002,
    rationale: ["price: 1 → 6.3."],
    createdAt: 1000,
    holdoutSeed: null,
    ...overrides,
  }
}

describe("tuned-config storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("round-trips through localStorage", () => {
    const saved = upsertTunedConfig(sample({ id: "a" }))
    expect(loadTunedConfigs()).toEqual([saved])
    expect(localStorage.getItem(TUNED_CONFIGS_STORAGE_KEY)).toContain("a")
  })

  it("scopes by index and sorts newest first", () => {
    upsertTunedConfig(sample({ id: "old", createdAt: 1, indexName: "catalog" }))
    upsertTunedConfig(
      sample({ id: "new", createdAt: 2, indexName: "catalog" }),
    )
    upsertTunedConfig(
      sample({ id: "other", createdAt: 3, indexName: "other" }),
    )
    expect(tunedConfigsForIndex("catalog").map((item) => item.id)).toEqual([
      "new",
      "old",
    ])
  })

  it("removes by id", () => {
    upsertTunedConfig(sample({ id: "keep" }))
    upsertTunedConfig(sample({ id: "drop" }))
    expect(removeTunedConfig("drop").map((item) => item.id)).toEqual(["keep"])
  })

  it("exports JSON without the local id", () => {
    const json = serializeTunedConfig(sample({ id: "local-only" }))
    expect(json).not.toContain("local-only")
    expect(json).toContain("Catalog champion")
    expect(tunedConfigFilename(sample({ name: "My Best!" }))).toBe(
      "my-best.json",
    )
  })

  it("keeps holdoutSeed when present", () => {
    const saved = upsertTunedConfig(sample({ id: "seeded", holdoutSeed: 99 }))
    expect(loadTunedConfigs()[0]?.holdoutSeed).toBe(99)
    expect(saved.holdoutSeed).toBe(99)
  })
})
