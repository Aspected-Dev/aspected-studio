import { describe, expect, it } from "vitest"
import {
  composeCredits,
  composeOverview,
  composeThemes,
  composeTitle,
  movieDocId,
  parseCsvObjects,
  popularityFromVotes,
  slugify,
} from "./movies-dataset.ts"

describe("slugify / movieDocId", () => {
  it("builds readable year-suffixed ids", () => {
    expect(movieDocId("The Dark Knight", 2008)).toBe("the-dark-knight-2008")
    expect(movieDocId("Batman", 1989)).toBe("batman-1989")
    expect(movieDocId("Batman", 1966)).toBe("batman-1966")
  })

  it("strips accents and punctuation", () => {
    expect(slugify("Amélie!")).toBe("amelie")
    expect(slugify("  Foo   Bar  ")).toBe("foo-bar")
  })
})

describe("compose helpers", () => {
  it("appends original title when it differs", () => {
    expect(composeTitle("The Host", "Gwoemul")).toBe("The Host (Gwoemul)")
    expect(composeTitle("Avatar", "Avatar")).toBe("Avatar")
  })

  it("falls back when overview is empty", () => {
    expect(composeOverview("", "A tagline", "Film")).toBe("Film. A tagline")
    expect(composeOverview("Plot here.", "Tag", "Film")).toBe(
      "Plot here. Tag",
    )
  })

  it("drops credit-stinger keywords from themes", () => {
    expect(
      composeThemes(
        ["Action", "Adventure"],
        ["space war", "duringcreditsstinger", "alien"],
      ),
    ).toBe("Action, Adventure, space war, alien")
  })

  it("formats credits with director and cast", () => {
    expect(composeCredits("Nolan", ["Bale", "Ledger"])).toBe(
      "Directed by Nolan. Starring Bale, Ledger.",
    )
    expect(composeCredits("", [])).toBe("Unknown credits.")
  })
})

describe("popularityFromVotes", () => {
  it("uses log10(voteCount + 1) and clamps", () => {
    expect(popularityFromVotes(0)).toBe(0)
    expect(popularityFromVotes(9)).toBeCloseTo(1, 5)
    expect(popularityFromVotes(999)).toBeCloseTo(3, 5)
    expect(popularityFromVotes(1_000_000)).toBe(4.2)
  })
})

describe("parseCsvObjects", () => {
  it("parses quoted commas and escaped quotes", () => {
    const rows = parseCsvObjects(
      `id,title\n1,"Hello, world"\n2,"Say ""hi"""\n`,
    )
    expect(rows).toEqual([
      { id: "1", title: "Hello, world" },
      { id: "2", title: 'Say "hi"' },
    ])
  })
})
