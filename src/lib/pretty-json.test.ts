import { describe, expect, it } from "vitest"
import { compactJson, prettyJson } from "./pretty-json.ts"

describe("compactJson", () => {
  it("returns null for nullish values", () => {
    expect(compactJson(null)).toBeNull()
    expect(compactJson(undefined)).toBeNull()
  })

  it("stringifies objects on one line", () => {
    expect(compactJson({ a: 1 })).toBe('{"a":1}')
  })
})

describe("prettyJson", () => {
  it("returns an empty string for nullish values", () => {
    expect(prettyJson(null)).toBe("")
    expect(prettyJson(undefined)).toBe("")
  })

  it("pretty-prints objects", () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})
