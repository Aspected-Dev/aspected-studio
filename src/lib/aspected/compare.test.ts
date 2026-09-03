import { describe, expect, it } from "vitest"
import {
  bumpSeries,
  compareDepth,
  compareRankings,
  diffConfigs,
  idByRank,
  overlapAtDepth,
  rankedIds,
  rbo,
  RBO_P,
  summariseComparison,
} from "./compare.ts"
import type { PlaygroundFormValues } from "./playground.ts"

function rows(
  entries: Array<[string, number]>,
): Array<{ id: string; distance: number }> {
  return entries.map(([id, distance]) => ({ id, distance }))
}

function form(
  overrides: Partial<PlaygroundFormValues> = {},
): PlaygroundFormValues {
  return {
    k: "20",
    autoRun: true,
    aspects: [
      {
        name: "title",
        type: "text",
        enabled: true,
        value: "rake",
        weight: 1,
      },
      {
        name: "price",
        type: "number",
        enabled: true,
        value: "30",
        weight: 1,
      },
    ],
    ...overrides,
  }
}

describe("rankedIds", () => {
  it("orders by ascending distance and keeps arrival order on ties", () => {
    expect(rankedIds(rows([["b", 2], ["a", 1], ["c", 2]]))).toEqual([
      "a",
      "b",
      "c",
    ])
  })
})

describe("compareDepth", () => {
  it("returns the shorter prefix length", () => {
    expect(compareDepth(["a", "b", "c"], ["x", "y"])).toBe(2)
    expect(compareDepth([], ["a"])).toBe(0)
  })
})

describe("overlapAtDepth", () => {
  it("counts the shared documents in the top depth", () => {
    expect(overlapAtDepth(["a", "b", "c"], ["c", "b", "x"], 2)).toEqual({
      shared: 1,
      depth: 2,
      fraction: 0.5,
    })
  })

  it("returns zeros when either list is empty", () => {
    expect(overlapAtDepth([], ["a"], 5)).toEqual({
      shared: 0,
      depth: 0,
      fraction: 0,
    })
  })
})

describe("rbo", () => {
  it("returns exactly 1 for identical lists", () => {
    expect(rbo(["a", "b", "c"], ["a", "b", "c"])).toBeCloseTo(1, 12)
  })

  it("returns 0 for disjoint lists", () => {
    expect(rbo(["a", "b", "c"], ["x", "y", "z"])).toBe(0)
  })

  it("returns 0 for empty input", () => {
    expect(rbo([], [])).toBe(0)
    expect(rbo(["a"], [])).toBe(0)
  })

  it("scores a reversed triple below a matching triple", () => {
    const matching = rbo(["a", "b", "c"], ["a", "b", "c"])
    const reversed = rbo(["a", "b", "c"], ["c", "b", "a"])
    expect(reversed).toBeLessThan(matching)
    expect(reversed).toBeGreaterThan(0)
  })

  it("penalises a swap nearer the top more than one lower down", () => {
    const topSwap = rbo(["a", "b", "c", "d"], ["b", "a", "c", "d"])
    const bottomSwap = rbo(["a", "b", "c", "d"], ["a", "b", "d", "c"])
    expect(topSwap).toBeLessThan(bottomSwap)
  })

  it("defaults p to RBO_P", () => {
    expect(RBO_P).toBe(0.9)
    expect(rbo(["a", "b"], ["a", "b"])).toBe(
      rbo(["a", "b"], ["a", "b"], RBO_P),
    )
  })
})

describe("compareRankings", () => {
  it("classifies movement and sorts B first, then left rows by A", () => {
    const compared = compareRankings(
      rows([["a", 1], ["b", 2], ["c", 3]]),
      rows([["b", 1], ["d", 2], ["a", 3]]),
    )

    expect(compared.map((row) => row.id)).toEqual(["b", "d", "a", "c"])
    expect(compared.find((row) => row.id === "b")).toMatchObject({
      rankA: 2,
      rankB: 1,
      delta: 1,
      movement: "up",
    })
    expect(compared.find((row) => row.id === "d")).toMatchObject({
      rankA: null,
      rankB: 2,
      delta: null,
      movement: "entered",
    })
    expect(compared.find((row) => row.id === "a")).toMatchObject({
      rankA: 1,
      rankB: 3,
      delta: -2,
      movement: "down",
    })
    expect(compared.find((row) => row.id === "c")).toMatchObject({
      rankA: 3,
      rankB: null,
      delta: null,
      movement: "left",
    })
  })

  it("marks unchanged ranks as same", () => {
    const compared = compareRankings(
      rows([["a", 1], ["b", 2]]),
      rows([["a", 1], ["b", 2]]),
    )
    expect(compared.every((row) => row.movement === "same")).toBe(true)
  })
})

describe("summariseComparison", () => {
  it("aggregates overlap, RBO, and shift statistics", () => {
    const summary = summariseComparison(
      rows([["a", 1], ["b", 2], ["c", 3]]),
      rows([["b", 1], ["a", 2], ["d", 3]]),
    )

    expect(summary.depth).toBe(3)
    expect(summary.shared).toBe(2)
    expect(summary.fraction).toBeCloseTo(2 / 3, 10)
    expect(summary.entered).toBe(1)
    expect(summary.left).toBe(1)
    expect(summary.maxShift).toBe(1)
    expect(summary.meanAbsShift).toBe(1)
    expect(summary.rbo).toBeGreaterThan(0)
    expect(summary.rbo).toBeLessThan(1)
  })
})

describe("diffConfigs", () => {
  it("returns empty when the configs match", () => {
    expect(diffConfigs(form(), form())).toEqual([])
  })

  it("reports k, weight, enabled, and value changes", () => {
    const a = form()
    const b = form({
      k: "50",
      aspects: [
        {
          name: "title",
          type: "text",
          enabled: true,
          value: "hose",
          weight: 4,
        },
        {
          name: "price",
          type: "number",
          enabled: false,
          value: "30",
          weight: 1,
        },
      ],
    })

    expect(diffConfigs(a, b)).toEqual([
      { kind: "k", from: "20", to: "50" },
      { kind: "value", name: "title", from: "rake", to: "hose" },
      { kind: "weight", name: "title", from: 1, to: 4 },
      { kind: "enabled", name: "price", from: true, to: false },
    ])
  })
})

describe("idByRank", () => {
  it("maps 1-based ranks to ids", () => {
    const map = idByRank(rows([["b", 2], ["a", 1]]))
    expect([...map.entries()]).toEqual([
      [1, "a"],
      [2, "b"],
    ])
  })
})

describe("bumpSeries", () => {
  it("caps to documents inside the top limit of either side", () => {
    const compared = compareRankings(
      rows([["a", 1], ["b", 2], ["c", 3], ["d", 4]]),
      rows([["d", 1], ["c", 2], ["b", 3], ["a", 4]]),
    )
    const series = bumpSeries(compared, 2)

    // All four are in the top 2 of A or B; order follows compareRankings (B first).
    expect(series.ids).toEqual(["d", "c", "b", "a"])
    expect(series.data).toEqual([
      { stage: "A", d: 4, c: 3, b: 2, a: 1 },
      { stage: "B", d: 1, c: 2, b: 3, a: 4 },
    ])
  })

  it("keeps null ranks for entered and left documents", () => {
    const compared = compareRankings(
      rows([["a", 1]]),
      rows([["b", 1]]),
    )
    const series = bumpSeries(compared, 5)

    expect(series.data[0]).toEqual({ stage: "A", b: null, a: 1 })
    expect(series.data[1]).toEqual({ stage: "B", b: 1, a: null })
  })

  it("drops documents outside the limit on both sides", () => {
    const compared = compareRankings(
      rows([["a", 1], ["b", 2], ["c", 3]]),
      rows([["a", 1], ["b", 2], ["c", 3]]),
    )
    const series = bumpSeries(compared, 2)

    expect(series.ids).toEqual(["a", "b"])
    expect(series.data[0]).toEqual({ stage: "A", a: 1, b: 2 })
  })
})
