import { afterEach, describe, expect, it, vi } from "vitest"
import { cn, copyToClipboard, countLabel } from "./utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("resolves conflicting Tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("ignores falsy values", () => {
    expect(cn("px-2", false, null, undefined, "text-sm")).toBe("px-2 text-sm")
  })
})

describe("countLabel", () => {
  it("keeps the noun singular for one", () => {
    expect(countLabel(1, "case")).toBe("1 case")
  })

  it("pluralises everything else, including zero", () => {
    expect(countLabel(0, "case")).toBe("0 cases")
    expect(countLabel(3, "case")).toBe("3 cases")
  })

  it("takes an irregular plural", () => {
    expect(countLabel(2, "match", "matches")).toBe("2 matches")
  })
})

describe("copyToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("writes text through navigator.clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    await copyToClipboard("products")
    expect(writeText).toHaveBeenCalledWith("products")
  })
})
