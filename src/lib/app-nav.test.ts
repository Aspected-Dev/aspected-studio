import { describe, expect, it } from "vitest"
import { DOCS_HASH } from "./docs.ts"
import {
  breadcrumbsForLocation,
  docsTargetForLocation,
  indexPath,
  indexStudioUrl,
  parseStudioLocation,
} from "./app-nav.ts"

describe("indexPath", () => {
  it("encodes the index name", () => {
    expect(indexPath("my index")).toBe("/indexes/my%20index")
    expect(indexPath("my index", "docs")).toBe("/indexes/my%20index/docs")
    expect(indexPath("my index", "search")).toBe(
      "/indexes/my%20index/search",
    )
    expect(indexPath("my index", "playground")).toBe(
      "/indexes/my%20index/playground",
    )
    expect(indexPath("my index", "scorecard")).toBe(
      "/indexes/my%20index/scorecard",
    )
    expect(indexPath("my index", "auto-tune")).toBe(
      "/indexes/my%20index/auto-tune",
    )
  })
})

describe("indexStudioUrl", () => {
  it("joins origin and the schema path by default", () => {
    expect(indexStudioUrl("http://studio.local/", "my index")).toBe(
      "http://studio.local/indexes/my%20index",
    )
  })

  it("can target documents and search", () => {
    expect(indexStudioUrl("http://studio.local", "movies", "docs")).toBe(
      "http://studio.local/indexes/movies/docs",
    )
    expect(indexStudioUrl("http://studio.local", "movies", "search")).toBe(
      "http://studio.local/indexes/movies/search",
    )
    expect(indexStudioUrl("http://studio.local", "movies", "playground")).toBe(
      "http://studio.local/indexes/movies/playground",
    )
  })
})

describe("parseStudioLocation", () => {
  it("treats the home route as the index list", () => {
    expect(parseStudioLocation("/")).toEqual({ kind: "indexes" })
  })

  it("recognizes create index", () => {
    expect(parseStudioLocation("/indexes/new")).toEqual({ kind: "create" })
  })

  it("maps index pages and decodes the name", () => {
    expect(parseStudioLocation("/indexes/movies")).toEqual({
      kind: "index",
      name: "movies",
      page: "schema",
    })
    expect(parseStudioLocation("/indexes/my%20index/docs")).toEqual({
      kind: "index",
      name: "my index",
      page: "docs",
    })
    expect(parseStudioLocation("/indexes/movies/search")).toEqual({
      kind: "index",
      name: "movies",
      page: "search",
    })
    expect(parseStudioLocation("/indexes/movies/playground")).toEqual({
      kind: "index",
      name: "movies",
      page: "playground",
    })
    expect(parseStudioLocation("/indexes/movies/scorecard")).toEqual({
      kind: "index",
      name: "movies",
      page: "scorecard",
    })
    expect(parseStudioLocation("/indexes/movies/auto-tune")).toEqual({
      kind: "index",
      name: "movies",
      page: "auto-tune",
    })
  })
})

describe("docsTargetForLocation", () => {
  it("points disconnected sessions at Getting started", () => {
    expect(docsTargetForLocation("/indexes/new", { connected: false }))
      .toEqual({ page: "gettingStarted" })
  })

  it("maps Studio screens onto docs pages", () => {
    expect(docsTargetForLocation("/")).toEqual({ page: "tutorial" })
    expect(docsTargetForLocation("/indexes/new")).toEqual({
      page: "resolvers",
    })
    expect(docsTargetForLocation("/indexes/movies")).toEqual({
      page: "resolvers",
    })
    expect(docsTargetForLocation("/indexes/movies/docs")).toEqual({
      page: "tutorial",
      hash: DOCS_HASH.tutorialTrain,
    })
    expect(docsTargetForLocation("/indexes/movies/search")).toEqual({
      page: "resolvers",
      hash: DOCS_HASH.combiningResolvers,
    })
    expect(docsTargetForLocation("/indexes/movies/playground")).toEqual({
      page: "resolvers",
      hash: DOCS_HASH.inspectingResolvers,
    })
    expect(docsTargetForLocation("/indexes/movies/scorecard")).toEqual({
      page: "resolvers",
      hash: DOCS_HASH.inspectingResolvers,
    })
    expect(docsTargetForLocation("/indexes/movies/auto-tune")).toEqual({
      page: "resolvers",
      hash: DOCS_HASH.inspectingResolvers,
    })
  })
})

describe("breadcrumbsForLocation", () => {
  it("shows Welcome while disconnected", () => {
    expect(breadcrumbsForLocation("/indexes/movies", { connected: false }))
      .toEqual([{ label: "Welcome" }])
  })

  it("marks Indexes as the current page on home", () => {
    expect(breadcrumbsForLocation("/")).toEqual([{ label: "Indexes" }])
  })

  it("links back to Indexes on the create screen", () => {
    expect(breadcrumbsForLocation("/indexes/new")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "Create" },
    ])
  })

  it("includes the index name and current section", () => {
    expect(breadcrumbsForLocation("/indexes/movies")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "movies", href: "/indexes/movies" },
      { label: "Schema" },
    ])
    expect(breadcrumbsForLocation("/indexes/movies/docs")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "movies", href: "/indexes/movies" },
      { label: "Documents" },
    ])
    expect(breadcrumbsForLocation("/indexes/movies/playground")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "movies", href: "/indexes/movies" },
      { label: "Playground" },
    ])
    expect(breadcrumbsForLocation("/indexes/movies/scorecard")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "movies", href: "/indexes/movies" },
      { label: "Scorecard" },
    ])
    expect(breadcrumbsForLocation("/indexes/movies/auto-tune")).toEqual([
      { label: "Indexes", href: "/" },
      { label: "movies", href: "/indexes/movies" },
      { label: "Auto-tune" },
    ])
  })
})
