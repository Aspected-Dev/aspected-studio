import { describe, expect, it } from "vitest"
import {
  aspectGranularities,
  aspectRawDims,
  aspectValueDescription,
  aspectValueSchema,
  datetimeControl,
  formatDatetimeValue,
  parseDatetimeValue,
} from "./aspect-value.ts"
import type { StoredAspect } from "./types.ts"

function aspect(
  type: StoredAspect["type"],
  settings: StoredAspect["settings"],
): StoredAspect {
  return {
    name: type,
    type,
    path: `$.${type}`,
    settings,
  }
}

describe("aspectGranularities", () => {
  it("reads a single granularity string", () => {
    expect(aspectGranularities(aspect("datetime", { granularity: "day" })))
      .toEqual(["day"])
  })

  it("reads an array of granularities", () => {
    expect(
      aspectGranularities(
        aspect("datetime", { granularity: ["year", "hour"] }),
      ),
    ).toEqual(["year", "hour"])
  })
})

describe("datetimeControl", () => {
  it("prefers timestamp, then year with optional time", () => {
    expect(
      datetimeControl(aspect("datetime", { granularity: "timestamp" })),
    ).toBe("timestamp")
    expect(
      datetimeControl(aspect("datetime", { granularity: ["year", "hour"] })),
    ).toBe("date-time")
    expect(datetimeControl(aspect("datetime", { granularity: "year" })))
      .toBe("date")
    expect(datetimeControl(aspect("datetime", { granularity: "month" })))
      .toBe("date")
    expect(datetimeControl(aspect("datetime", { granularity: "weekday" })))
      .toBe("weekday")
    expect(datetimeControl(aspect("datetime", { granularity: "hour" })))
      .toBe("hour")
  })
})

describe("formatDatetimeValue / parseDatetimeValue", () => {
  const sample = new Date(2024, 6, 1, 14, 5, 9)

  it("emits zero-padded formats per control", () => {
    expect(
      formatDatetimeValue(
        aspect("datetime", { granularity: "timestamp" }),
        sample,
      ),
    ).toBe(String(Math.floor(sample.getTime() / 1000)))
    expect(
      formatDatetimeValue(
        aspect("datetime", { granularity: ["year", "hour"] }),
        sample,
      ),
    ).toBe("2024/07/01 14:05:09")
    expect(
      formatDatetimeValue(aspect("datetime", { granularity: "year" }), sample),
    ).toBe("2024")
    expect(
      formatDatetimeValue(aspect("datetime", { granularity: "month" }), sample),
    ).toBe("07/01")
    expect(
      formatDatetimeValue(aspect("datetime", { granularity: "day" }), sample),
    ).toBe("01")
    expect(
      formatDatetimeValue(
        aspect("datetime", { granularity: "weekday" }),
        sample,
      ),
    ).toBe("Monday")
    expect(
      formatDatetimeValue(aspect("datetime", { granularity: "hour" }), sample),
    ).toBe("14:05")
  })

  it("round-trips year and month-day strings", () => {
    const yearAspect = aspect("datetime", { granularity: "year" })
    const parsed = parseDatetimeValue(yearAspect, "2024")
    expect(parsed).not.toBeNull()
    expect(formatDatetimeValue(yearAspect, parsed!)).toBe("2024")

    expect(parseDatetimeValue(yearAspect, "2024/07")).not.toBeNull()
    expect(parseDatetimeValue(yearAspect, "2024/07/01 00:00:00")).not.toBeNull()
    expect(parseDatetimeValue(yearAspect, "2024/07/01")).toBeNull()

    const monthAspect = aspect("datetime", { granularity: "month" })
    const monthParsed = parseDatetimeValue(monthAspect, "07/01")
    expect(monthParsed).not.toBeNull()
    expect(formatDatetimeValue(monthAspect, monthParsed!)).toBe("07/01")
  })
})

describe("aspectValueDescription", () => {
  it("describes number ranges", () => {
    expect(aspectValueDescription(aspect("number", { min: 0, max: 5 })))
      .toBe("Number between 0 and 5. Leave blank to omit.")
  })

  it("describes enum options", () => {
    expect(
      aspectValueDescription(
        aspect("enum", { values: ["laptop", "phone"] }),
      ),
    ).toBe("One of: laptop, phone. Leave blank to omit.")
  })
})

describe("aspectValueSchema", () => {
  it("allows blank values so aspects stay sparse", () => {
    const schema = aspectValueSchema(
      aspect("enum", { values: ["a", "b"] }),
    )
    expect(schema.safeParse("").success).toBe(true)
    expect(schema.safeParse("  ").success).toBe(true)
  })

  it("rejects enum values outside the configured list", () => {
    const schema = aspectValueSchema(
      aspect("enum", { values: ["laptop", "phone"] }),
    )
    expect(schema.safeParse("laptop").success).toBe(true)
    expect(schema.safeParse("tablet").success).toBe(false)
  })

  it("enforces number min and max", () => {
    const schema = aspectValueSchema(
      aspect("number", { min: 0, max: 100 }),
    )
    expect(schema.safeParse("50").success).toBe(true)
    expect(schema.safeParse("-1").success).toBe(false)
    expect(schema.safeParse("101").success).toBe(false)
    expect(schema.safeParse("abc").success).toBe(false)
  })

  it("requires raw vectors to match numDims", () => {
    const schema = aspectValueSchema(
      aspect("raw", { numDims: 2 }),
    )
    expect(schema.safeParse("[0.1, 0.2]").success).toBe(true)
    expect(schema.safeParse("[0.1]").success).toBe(false)
    expect(schema.safeParse("not-json").success).toBe(false)
  })

  it("reads raw dims from settings", () => {
    expect(aspectRawDims(aspect("raw", { numDims: 3 }))).toBe(3)
    expect(aspectRawDims(aspect("raw", {}))).toBeUndefined()
  })
})
