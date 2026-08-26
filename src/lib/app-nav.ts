import { DOCS_HASH, type DocsTarget } from "@/lib/docs.ts"

/** Page within an index: schema is the index root. */
export type IndexPage = "schema" | "docs" | "search" | "playground"

/** Parsed Studio location used by the sidebar and breadcrumbs. */
export type StudioLocation =
  | { kind: "indexes" }
  | { kind: "create" }
  | { kind: "index"; name: string; page: IndexPage }

/** One breadcrumb. Omit `href` for the current page. */
export type AppBreadcrumb = {
  label: string
  href?: string
}

/**
 * Returns the path to an index page.
 */
export function indexPath(name: string, page: IndexPage = "schema"): string {
  const encoded = encodeURIComponent(name)
  if (page === "docs") {
    return `/indexes/${encoded}/docs`
  }
  if (page === "search") {
    return `/indexes/${encoded}/search`
  }
  if (page === "playground") {
    return `/indexes/${encoded}/playground`
  }
  return `/indexes/${encoded}`
}

/**
 * Absolute Studio URL for an index page, using the given origin.
 */
export function indexStudioUrl(
  origin: string,
  name: string,
  page: IndexPage = "schema",
): string {
  return `${origin.replace(/\/+$/, "")}${indexPath(name, page)}`
}

/**
 * Maps a pathname onto the Studio screen the chrome should highlight.
 */
export function parseStudioLocation(pathname: string): StudioLocation {
  if (pathname === "/indexes/new") {
    return { kind: "create" }
  }

  const match = pathname.match(
    /^\/indexes\/([^/]+)(?:\/(docs|search|playground))?\/?$/,
  )
  if (!match) {
    return { kind: "indexes" }
  }

  const page: IndexPage = match[2] === "docs"
    ? "docs"
    : match[2] === "search"
    ? "search"
    : match[2] === "playground"
    ? "playground"
    : "schema"

  return {
    kind: "index",
    name: decodeURIComponent(match[1]),
    page,
  }
}

function indexPageLabel(page: IndexPage): string {
  if (page === "docs") {
    return "Documents"
  }
  if (page === "search") {
    return "Search"
  }
  if (page === "playground") {
    return "Playground"
  }
  return "Schema"
}

/**
 * Docs page that matches the current Studio screen.
 * Disconnected sessions always point at Getting started.
 */
export function docsTargetForLocation(
  pathname: string,
  options: { connected?: boolean } = {},
): DocsTarget {
  if (options.connected === false) {
    return { page: "gettingStarted" }
  }

  const location = parseStudioLocation(pathname)
  if (location.kind === "create") {
    return { page: "resolvers" }
  }
  if (location.kind === "index") {
    if (location.page === "docs") {
      return { page: "tutorial", hash: DOCS_HASH.tutorialTrain }
    }
    if (location.page === "search") {
      return { page: "resolvers", hash: DOCS_HASH.combiningResolvers }
    }
    if (location.page === "playground") {
      return { page: "resolvers", hash: DOCS_HASH.inspectingResolvers }
    }
    return { page: "resolvers" }
  }
  return { page: "tutorial" }
}

/**
 * Breadcrumb trail for the current pathname.
 * Disconnected sessions always show Welcome, regardless of the URL.
 */
export function breadcrumbsForLocation(
  pathname: string,
  options: { connected?: boolean } = {},
): AppBreadcrumb[] {
  if (options.connected === false) {
    return [{ label: "Welcome" }]
  }

  const location = parseStudioLocation(pathname)

  if (location.kind === "indexes") {
    return [{ label: "Indexes" }]
  }

  if (location.kind === "create") {
    return [
      { label: "Indexes", href: "/" },
      { label: "Create" },
    ]
  }

  return [
    { label: "Indexes", href: "/" },
    { label: location.name, href: indexPath(location.name) },
    { label: indexPageLabel(location.page) },
  ]
}
