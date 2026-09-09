import { describe, expect, it } from "vitest"
import { holdoutHint } from "@/components/auto-tune-results.tsx"

describe("holdoutHint", () => {
  it("reports the gap against the train champion once the holdout is scored", () => {
    expect(holdoutHint(0.94, 1, 3)).toBe("-0.060 vs train champion")
    expect(holdoutHint(1, 0.94, 3)).toBe("+0.060 vs train champion")
  })

  it("keeps a scored holdout of zero out of the unmeasured branch", () => {
    expect(holdoutHint(0, 0.5, 3)).toBe("-0.500 vs train champion")
  })

  it("says the split never happened when there are no held-out cases", () => {
    expect(holdoutHint(null, 1, 0)).toBe(
      "Holdout was off or the set was too small",
    )
  })

  it("does not blame the split size when the run ended before confirm", () => {
    const hint = holdoutHint(null, 1, 3)

    expect(hint).toBe(
      "Run ended before the confirm stage scored the 3 held-out cases",
    )
    expect(hint).not.toMatch(/too small/)
  })
})
