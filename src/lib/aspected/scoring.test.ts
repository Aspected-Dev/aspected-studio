import { describe, expect, it } from "vitest"
import {
  hasCompleteGrades,
  isAdditive,
  multipliersFromSchema,
  previewDeviation,
  recoverGrades,
  rerank,
} from "./scoring.ts"
import type { SearchResultRow, StoredAspect } from "./types.ts"

/** Builds a result row with one explanation entry per `[name, distance]` pair. */
function row(
  id: string,
  distance: number,
  explanation: Array<[string, number | undefined]>,
): SearchResultRow {
  return {
    id,
    distance,
    explanation: explanation.map(([name, entryDistance]) => ({
      name,
      value: `${name}-value`,
      distance: entryDistance,
    })),
  }
}

describe("isAdditive", () => {
  it("is true for every metric except Cosine", () => {
    expect(isAdditive("Euclidean")).toBe(true)
    expect(isAdditive("Manhattan")).toBe(true)
    expect(isAdditive("DotProduct")).toBe(true)
    expect(isAdditive("Cosine")).toBe(false)
  })
})

describe("recoverGrades", () => {
  it("divides out the squared weight for Euclidean", () => {
    const grades = recoverGrades(
      row("a", 0.85, [["title", 0.8], ["year", 0.05]]),
      "Euclidean",
      { title: 2, year: 0.5 },
    )

    expect(grades).toEqual([
      { name: "title", raw: 0.2, value: "title-value" },
      { name: "year", raw: 0.2, value: "year-value" },
    ])
  })

  it("divides out the linear weight for Manhattan", () => {
    const grades = recoverGrades(
      row("a", 0.85, [["title", 0.8], ["year", 0.05]]),
      "Manhattan",
      { title: 2, year: 0.5 },
    )

    expect(grades[0].raw).toBeCloseTo(0.4, 10)
    expect(grades[1].raw).toBeCloseTo(0.1, 10)
  })

  it("leaves Cosine distances untouched because the weight cancels", () => {
    const grades = recoverGrades(
      row("a", 0.4, [["title", 0.2]]),
      "Cosine",
      { title: 7 },
    )

    expect(grades[0].raw).toBe(0.2)
  })

  it("defaults a missing weight to 1", () => {
    const grades = recoverGrades(
      row("a", 0.3, [["title", 0.3]]),
      "Euclidean",
      {},
    )

    expect(grades[0].raw).toBe(0.3)
  })

  it("reports no grade when the server withheld a distance", () => {
    const grades = recoverGrades(
      row("a", 0.3, [["title", 0.3], ["year", undefined]]),
      "Euclidean",
      { title: 1 },
    )

    expect(grades[1]).toEqual({ name: "year", raw: null, value: "year-value" })
  })

  it("reports no grade when the aspect was sent at weight zero", () => {
    const grades = recoverGrades(
      row("a", 0.3, [["year", 0.3]]),
      "Euclidean",
      { year: 0 },
    )

    expect(grades[0].raw).toBeNull()
  })

  it("accepts the aspectName alias", () => {
    const grades = recoverGrades(
      {
        id: "a",
        distance: 0.5,
        explanation: [{ aspectName: "title", distance: 0.5, value: 1 }],
      },
      "Euclidean",
      { title: 1 },
    )

    expect(grades).toEqual([{ name: "title", raw: 0.5, value: 1 }])
  })
})

describe("rerank exactness on additive metrics", () => {
  const cases = [
    {
      metric: "Euclidean" as const,
      explanation: [["title", 0.8], ["year", 0.05]] as Array<
        [string, number | undefined]
      >,
      total: 0.85,
    },
    {
      metric: "Manhattan" as const,
      explanation: [["title", 0.8], ["year", 0.05]] as Array<
        [string, number | undefined]
      >,
      total: 0.85,
    },
    {
      metric: "DotProduct" as const,
      explanation: [["title", -1.2], ["year", -0.3]] as Array<
        [string, number | undefined]
      >,
      total: -1.5,
    },
  ]

  for (const { metric, explanation, total } of cases) {
    it(`reproduces the server distance for ${metric}`, () => {
      const weights = { title: 2, year: 0.5 }
      const [scored] = rerank(
        [row("a", total, explanation)],
        metric,
        weights,
        weights,
        {},
      )

      expect(scored.distance).toBeCloseTo(total, 10)
    })

    it(`stacks contributions to the total for ${metric}`, () => {
      const weights = { title: 2, year: 0.5 }
      const [scored] = rerank(
        [row("a", total, explanation)],
        metric,
        weights,
        weights,
        {},
      )
      const stacked = scored.contributions.reduce(
        (sum, item) => sum + item.amount,
        0,
      )

      expect(stacked).toBeCloseTo(total, 10)
    })
  }
})

describe("rerank on Cosine", () => {
  const cosineRow = row("a", 0.4, [["title", 0.2], ["year", 0.6]])

  it("averages per-aspect distance weighted by the squared scale", () => {
    const [scored] = rerank(
      [cosineRow],
      "Cosine",
      { title: 1, year: 1 },
      { title: 1, year: 1 },
      {},
    )

    // Equal scales: mean of distances 0.2 and 0.6.
    expect(scored.distance).toBeCloseTo(0.4, 10)
  })

  it("folds the index multiplier into the scale", () => {
    const [scored] = rerank(
      [cosineRow],
      "Cosine",
      { title: 1, year: 1 },
      { title: 1, year: 1 },
      { title: 1, year: 3 },
    )

    // Scales 1 and 9: 0.1 * 0.2 + 0.9 * 0.6 = 0.56.
    expect(scored.distance).toBeCloseTo(0.56, 10)
  })

  it("drops aspects weighted to zero", () => {
    const [scored] = rerank(
      [cosineRow],
      "Cosine",
      { title: 1, year: 1 },
      { title: 1, year: 0 },
      {},
    )

    expect(scored.distance).toBeCloseTo(0.2, 10)
    expect(scored.contributions).toHaveLength(1)
  })

  it("stacks contributions to the total distance", () => {
    const [scored] = rerank(
      [cosineRow],
      "Cosine",
      { title: 1, year: 1 },
      { title: 2, year: 1 },
      {},
    )
    const stacked = scored.contributions.reduce(
      (sum, item) => sum + item.amount,
      0,
    )

    expect(stacked).toBeCloseTo(scored.distance, 10)
  })

  it("keeps every contribution non-negative, even past orthogonal", () => {
    // Radial resolvers reach distance 2, which is a negative similarity.
    const [scored] = rerank(
      [row("a", 1, [["title", 0], ["year", 2]])],
      "Cosine",
      { title: 1, year: 1 },
      { title: 1, year: 1 },
      {},
    )

    expect(scored.distance).toBeCloseTo(1, 10)
    expect(scored.contributions.every((entry) => entry.amount >= 0)).toBe(true)
  })
})

describe("rerank ordering", () => {
  const rows = [
    row("title-strong", 0.5, [["title", 0.1], ["year", 0.9]]),
    row("year-strong", 0.5, [["title", 0.9], ["year", 0.1]]),
  ]

  it("sorts ascending by recomputed distance", () => {
    const scored = rerank(rows, "Euclidean", { title: 1, year: 1 }, {
      title: 4,
      year: 1,
    }, {})

    expect(scored.map((item) => item.row.id)).toEqual([
      "title-strong",
      "year-strong",
    ])
  })

  it("flips the order when the weights flip", () => {
    const scored = rerank(rows, "Euclidean", { title: 1, year: 1 }, {
      title: 1,
      year: 4,
    }, {})

    expect(scored.map((item) => item.row.id)).toEqual([
      "year-strong",
      "title-strong",
    ])
  })

  it("ranks rows with no usable grades last", () => {
    const scored = rerank(
      [row("blank", 0.1, [["title", undefined]]), rows[0]],
      "Euclidean",
      { title: 1, year: 1 },
      { title: 1, year: 1 },
      {},
    )

    expect(scored[1].row.id).toBe("blank")
    expect(scored[1].distance).toBe(Number.POSITIVE_INFINITY)
    expect(scored[1].contributions).toEqual([])
  })
})

describe("previewDeviation", () => {
  it("is zero for additive metrics", () => {
    const weights = { title: 2, year: 0.5 }
    const deviation = previewDeviation(
      [row("a", 0.85, [["title", 0.8], ["year", 0.05]])],
      "Euclidean",
      weights,
      {},
    )

    expect(deviation).toBeCloseTo(0, 10)
  })

  it("measures the Cosine approximation error", () => {
    const deviation = previewDeviation(
      [row("a", 0.42, [["title", 0.2], ["year", 0.6]])],
      "Cosine",
      { title: 1, year: 1 },
      {},
    )

    expect(deviation).toBeCloseTo(0.02, 10)
  })

  it("ignores rows that cannot be scored", () => {
    const deviation = previewDeviation(
      [row("a", 0.5, [["title", undefined]])],
      "Euclidean",
      {},
      {},
    )

    expect(deviation).toBe(0)
  })
})

describe("hasCompleteGrades", () => {
  const grades = [
    { name: "title", raw: 0.2, value: null },
    { name: "year", raw: null, value: null },
  ]

  it("is true when every active aspect has a grade", () => {
    expect(hasCompleteGrades(grades, ["title"])).toBe(true)
  })

  it("is false when an active aspect has no grade", () => {
    expect(hasCompleteGrades(grades, ["title", "year"])).toBe(false)
  })

  it("is true when nothing is active", () => {
    expect(hasCompleteGrades(grades, [])).toBe(true)
  })
})

describe("multipliersFromSchema", () => {
  it("defaults an omitted multiplier to 1", () => {
    const schema: StoredAspect[] = [
      { name: "title", type: "text", path: "$.title", settings: {} },
      {
        name: "year",
        type: "number",
        path: "$.year",
        settings: {},
        multiplier: 5,
      },
    ]

    expect(multipliersFromSchema(schema)).toEqual({ title: 1, year: 5 })
  })
})
