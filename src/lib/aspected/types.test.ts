import { describe, expect, it } from "vitest"
import { createIndexRequestSchema } from "./types.ts"

describe("createIndexRequestSchema", () => {
  it("accepts schema and camelCase fields", () => {
    const parsed = createIndexRequestSchema.parse({
      idSize: 36,
      schema: [
        {
          name: "category",
          type: "enum",
          path: "$.category",
          settings: { values: ["electronics", "clothing"] },
        },
      ],
    })

    expect(parsed.schema[0]?.name).toBe("category")
  })

  it("rejects tutorial aspects field name", () => {
    const result = createIndexRequestSchema.safeParse({
      idSize: 36,
      aspects: [
        {
          name: "category",
          type: "enum",
          path: "$.category",
          settings: { values: ["electronics"] },
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
