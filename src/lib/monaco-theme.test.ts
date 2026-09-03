import { describe, expect, it } from "vitest"
import { cssColorToHex, syntaxRules } from "./monaco-theme.ts"

describe("cssColorToHex", () => {
  it("passes through six-digit hex", () => {
    expect(cssColorToHex("#A1B2C3")).toBe("#a1b2c3")
  })

  it("expands three-digit hex", () => {
    expect(cssColorToHex("#abc")).toBe("#aabbcc")
  })

  it("parses rgb()", () => {
    expect(cssColorToHex("rgb(255, 128, 0)")).toBe("#ff8000")
  })

  it("parses rgba() and drops alpha", () => {
    expect(cssColorToHex("rgba(16, 32, 48, 0.5)")).toBe("#102030")
  })

  it("parses modern space-separated rgb()", () => {
    expect(cssColorToHex("rgb(10 20 30)")).toBe("#0a141e")
  })

  it("parses modern rgb with alpha", () => {
    expect(cssColorToHex("rgb(10 20 30 / 0.4)")).toBe("#0a141e")
  })

  it("returns null for unrecognised values", () => {
    expect(cssColorToHex("oklch(0.5 0.1 100)")).toBeNull()
    expect(cssColorToHex("")).toBeNull()
  })
})

describe("syntaxRules", () => {
  it("uses a lighter violet for dark-mode strings than for light-mode strings", () => {
    const light = syntaxRules("light").find((rule) => rule.token === "string")
    const dark = syntaxRules("dark").find((rule) => rule.token === "string")
    expect(light?.foreground).toBe("5b4fcf")
    expect(dark?.foreground).toBe("ddd6fe")
  })
})
