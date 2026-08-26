import { afterEach, describe, expect, it, vi } from "vitest"
import { cn, copyToClipboard } from "./utils"

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
