import { afterEach, describe, expect, it } from "vitest"
import {
  caseFromPlaygroundValues,
  caseK,
  duplicateGoldenSet,
  emptyGoldenCase,
  emptyGoldenSet,
  GOLDEN_SET_VERSION,
  GOLDEN_SETS_STORAGE_KEY,
  goldenSetDisplayName,
  goldenSetFilename,
  goldenSetsForIndex,
  judgementMap,
  loadGoldenSets,
  parseGoldenSet,
  removeGoldenSet,
  serializeGoldenSet,
  UNTITLED_GOLDEN_SET,
  upsertGoldenSet,
} from "./golden.ts"
import type { GoldenSet } from "./golden.ts"
import type { StoredAspect } from "./types.ts"
import type { PlaygroundFormValues } from "./playground.ts"

afterEach(() => {
  localStorage.clear()
})

const schema: StoredAspect[] = [
  { name: "title", type: "text" },
  { name: "price", type: "number" },
] as StoredAspect[]

function set(overrides: Partial<GoldenSet> = {}): GoldenSet {
  return {
    ...emptyGoldenSet("catalog", schema),
    ...overrides,
  }
}

function form(
  overrides: Partial<PlaygroundFormValues> = {},
): PlaygroundFormValues {
  return {
    k: "20",
    autoRun: true,
    aspects: [
      { name: "title", type: "text", enabled: true, value: "rake", weight: 4 },
      { name: "price", type: "number", enabled: true, value: "", weight: 1 },
    ],
    ...overrides,
  }
}

describe("emptyGoldenSet", () => {
  it("leaves the name blank so the field reads as unfinished", () => {
    expect(emptyGoldenSet("catalog", schema).name).toBe("")
  })

  it("seeds one blank case with a row per index aspect", () => {
    const created = emptyGoldenSet("catalog", schema)

    expect(created.version).toBe(GOLDEN_SET_VERSION)
    expect(created.indexName).toBe("catalog")
    expect(created.cases).toHaveLength(1)
    expect(created.cases[0].aspects.map((aspect) => aspect.name)).toEqual([
      "title",
      "price",
    ])
    expect(created.cases[0].aspects.every((aspect) => !aspect.enabled)).toBe(
      true,
    )
  })
})

describe("caseK", () => {
  it("falls back to the set default", () => {
    const created = set({ k: 15 })
    const item = emptyGoldenCase(schema, "Case")

    expect(caseK(created, item)).toBe(15)
    expect(caseK(created, { ...item, k: 3 })).toBe(3)
  })
})

describe("judgementMap", () => {
  it("keeps one gain per id, last write wins", () => {
    const item = {
      ...emptyGoldenCase(schema, "Case"),
      expected: [{ id: "a", gain: 1 }, { id: "a", gain: 3 }],
    }

    expect(judgementMap(item).get("a")).toBe(3)
    expect(judgementMap(item).size).toBe(1)
  })
})

describe("caseFromPlaygroundValues", () => {
  it("drops the weights and disables blank rows", () => {
    const item = caseFromPlaygroundValues(form(), "From playground", ["doc-1"])

    expect(item.aspects).toEqual([
      { name: "title", type: "text", enabled: true, value: "rake" },
      { name: "price", type: "number", enabled: false, value: "" },
    ])
    expect(item.expected).toEqual([{ id: "doc-1", gain: 1 }])
  })
})

describe("storage", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(loadGoldenSets()).toEqual([])
  })

  it("falls back to an empty list on malformed storage", () => {
    localStorage.setItem(GOLDEN_SETS_STORAGE_KEY, "{ not json")
    expect(loadGoldenSets()).toEqual([])

    localStorage.setItem(GOLDEN_SETS_STORAGE_KEY, JSON.stringify([{ id: 1 }]))
    expect(loadGoldenSets()).toEqual([])
  })

  it("inserts, replaces, and stamps updatedAt", () => {
    const created = upsertGoldenSet(set({ name: "First" }))
    expect(created.updatedAt).toBeGreaterThan(0)
    expect(loadGoldenSets()).toHaveLength(1)

    upsertGoldenSet({ ...created, name: "Renamed" })
    const stored = loadGoldenSets()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe("Renamed")
  })

  it("removes by id", () => {
    const first = upsertGoldenSet(set({ name: "First" }))
    upsertGoldenSet(set({ name: "Second" }))

    expect(removeGoldenSet(first.id)).toHaveLength(1)
    expect(loadGoldenSets()[0].name).toBe("Second")
  })

  it("filters by index name", () => {
    upsertGoldenSet(set({ indexName: "catalog" }))
    upsertGoldenSet(set({ indexName: "people" }))

    expect(goldenSetsForIndex("catalog")).toHaveLength(1)
    expect(goldenSetsForIndex("catalog")[0].indexName).toBe("catalog")
    expect(goldenSetsForIndex("missing")).toEqual([])
  })
})

describe("goldenSetDisplayName", () => {
  it("falls back to Untitled set for a blank name", () => {
    expect(goldenSetDisplayName(set({ name: "" }))).toBe(UNTITLED_GOLDEN_SET)
    expect(goldenSetDisplayName(set({ name: "   " }))).toBe(
      UNTITLED_GOLDEN_SET,
    )
  })

  it("trims a real name", () => {
    expect(goldenSetDisplayName(set({ name: "  Baseline  " }))).toBe("Baseline")
  })
})

describe("duplicateGoldenSet", () => {
  it("gives the copy and its cases fresh ids", () => {
    const original = set({ name: "Baseline" })
    const copy = duplicateGoldenSet(original)

    expect(copy.id).not.toBe(original.id)
    expect(copy.name).toBe("Baseline copy")
    expect(copy.cases[0].id).not.toBe(original.cases[0].id)
    expect(copy.cases[0].name).toBe(original.cases[0].name)
  })

  it("keeps an unnamed original unnamed instead of naming it copy", () => {
    expect(duplicateGoldenSet(set({ name: "" })).name).toBe("")
  })
})

describe("serializeGoldenSet and parseGoldenSet", () => {
  it("round trips a set without carrying local ids", () => {
    const original = set({ name: "Baseline", k: 10 })
    original.cases[0] = {
      ...original.cases[0],
      name: "rakes",
      aspects: [{
        name: "title",
        type: "text",
        enabled: true,
        value: "rake",
      }],
      expected: [{ id: "doc-1", gain: 2 }],
      forbidden: ["doc-9"],
      tags: ["policy"],
    }

    const json = serializeGoldenSet(original)
    expect(json).not.toContain(original.id)

    const parsed = parseGoldenSet(json)
    if (!parsed.ok) {
      throw new Error(parsed.error)
    }

    expect(parsed.set.id).not.toBe(original.id)
    expect(parsed.set.name).toBe("Baseline")
    expect(parsed.set.k).toBe(10)
    expect(parsed.set.cases[0].name).toBe("rakes")
    expect(parsed.set.cases[0].expected).toEqual([{ id: "doc-1", gain: 2 }])
    expect(parsed.set.cases[0].forbidden).toEqual(["doc-9"])
    expect(parsed.set.cases[0].id).not.toBe(original.cases[0].id)
  })

  it("can retarget an imported set at another index", () => {
    const json = serializeGoldenSet(set({ indexName: "catalog" }))
    const parsed = parseGoldenSet(json, "people")

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.set.indexName).toBe("people")
    }
  })

  it("rejects malformed JSON with a readable message", () => {
    expect(parseGoldenSet("{ nope")).toEqual({
      ok: false,
      error: "Not valid JSON",
    })
  })

  it("rejects JSON that is not a golden set", () => {
    const parsed = parseGoldenSet(JSON.stringify({ hello: "world" }))

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error.length).toBeGreaterThan(0)
    }
  })

  it("rejects a set from a future version", () => {
    const raw = JSON.parse(serializeGoldenSet(set()))
    raw.version = 99

    expect(parseGoldenSet(JSON.stringify(raw)).ok).toBe(false)
  })

  it("fills optional case fields on import", () => {
    const parsed = parseGoldenSet(JSON.stringify({
      version: GOLDEN_SET_VERSION,
      name: "Minimal",
      indexName: "catalog",
      k: 5,
      thresholds: { metric: "ndcg", green: 0.8, amber: 0.5 },
      cases: [{
        name: "one",
        aspects: [],
        expected: [{ id: "doc-1", gain: 1 }],
      }],
    }))

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.set.cases[0]).toMatchObject({
        forbidden: [],
        tags: [],
        notes: "",
        enabled: true,
        k: null,
      })
    }
  })
})

describe("goldenSetFilename", () => {
  it("slugifies the set name", () => {
    expect(goldenSetFilename(set({ name: "Catalog Golden Set" }))).toBe(
      "catalog-golden-set.json",
    )
    expect(goldenSetFilename(set({ name: "!!!" }))).toBe("golden-set.json")
  })

  it("slugifies the display name for an unnamed set", () => {
    expect(goldenSetFilename(set({ name: "" }))).toBe("untitled-set.json")
  })
})
