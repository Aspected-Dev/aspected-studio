import type { AspectType } from "@/lib/aspected/types.ts";

/**
 * Origin of the Aspected docs server.
 *
 * In production this is the live docs site. When the `VITE_DOCS_LOCAL`
 * environment variable is set to `"true"` (e.g. via `deno task dev:all`),
 * Studio points at a locally running mkdocs dev server on port 8000 instead.
 */
export const DOCS_ORIGIN: string = import.meta.env.VITE_DOCS_LOCAL === "true"
  ? "http://localhost:8000"
  : "https://docs.aspected.com";

/** Catalog of docs.aspected.com pages Studio can open. */
export const DOCS_PAGES = {
  home: {
    path: "/",
    title: "Documentation",
    blurb: "Aspected is a vector index that supports sparse queries.",
  },
  gettingStarted: {
    path: "/getting-started/",
    title: "Getting started",
    blurb: "Run Aspected with Docker and expose port 8080.",
  },
  tutorial: {
    path: "/tutorial/",
    title: "Tutorial",
    blurb: "Create an index, train it with documents, and search.",
  },
  configuration: {
    path: "/user-manual/configuration/",
    title: "Configuration",
    blurb: "Server, logging, storage, and GGUF model paths.",
  },
  hnsw: {
    path: "/user-manual/hnsw-parameters/",
    title: "HNSW parameters",
    blurb: "Graph knobs that trade recall, memory, and speed.",
  },
  security: {
    path: "/user-manual/security/",
    title: "Security",
    blurb: "HTTPS and a static API token on the Authorization header.",
  },
  accessControl: {
    path: "/user-manual/access-control/",
    title: "Access control",
    blurb: "Tag documents with access keys and filter search results.",
  },
  resolvers: {
    path: "/resolvers/",
    title: "Resolvers",
    blurb: "Each aspect converts a document field into a vector.",
  },
  resolverEnum: {
    path: "/resolvers/enum/",
    title: "Enum resolver",
    blurb: "Maps a closed set of strings onto a radial embedding.",
  },
  resolverText: {
    path: "/resolvers/text/",
    title: "Text resolver",
    blurb: "Embeds free text with a GGUF model from the models directory.",
  },
  resolverNumber: {
    path: "/resolvers/number/",
    title: "Number resolver",
    blurb: "Maps a number in a min/max range onto two dimensions.",
  },
  resolverDatetime: {
    path: "/resolvers/datetime/",
    title: "DateTime resolver",
    blurb:
      "Embeds timestamps at hour, day, weekday, month, year, or timestamp granularity.",
  },
  resolverRaw: {
    path: "/resolvers/raw/",
    title: "Raw resolver",
    blurb: "Stores a pre-computed float vector of a fixed length.",
  },
  resolverDict: {
    path: "/resolvers/dictionary/",
    title: "Dictionary resolver",
    blurb: "Maps licensed string keys to numbers, then a radial embedding.",
  },
} as const;

/** Key of a page in {@link DOCS_PAGES}. */
export type DocsPage = keyof typeof DOCS_PAGES;

/** Heading hashes on docs.aspected.com (Material mkdocs slugs). */
export const DOCS_HASH = {
  jsonPath: "jsonpath-expressions",
  combiningResolvers: "combining-resolvers",
  inspectingResolvers: "inspecting-resolvers",
  downloadingModels: "downloading-models",
  apiToken: "api-token-authentication",
  tutorialCreate: "step-1-create-the-index",
  tutorialTrain: "step-3-train-the-index",
  tutorialSearch: "step-4-search-single-aspect",
  tutorialSummary: "summary",
  accessAssigning: "assigning-access-keys",
  accessFiltering: "filtering-search-results",
  accessNull: "including-documents-with-no-access-keys",
  textModels: "using-the-text-resolver-embedding-models",
} as const;

/** Page plus optional heading hash. */
export type DocsTarget = {
  page: DocsPage;
  hash?: string;
};

/** Help menu entries shown in the site header. */
export const DOCS_MENU: Array<{ page: DocsPage }> = [
  { page: "gettingStarted" },
  { page: "tutorial" },
  { page: "resolvers" },
  { page: "hnsw" },
  { page: "accessControl" },
  { page: "security" },
  { page: "configuration" },
];

/** Per-aspect-type docs page. */
export const ASPECT_TYPE_DOCS: Record<AspectType, DocsPage> = {
  enum: "resolverEnum",
  text: "resolverText",
  number: "resolverNumber",
  datetime: "resolverDatetime",
  raw: "resolverRaw",
  dict: "resolverDict",
};

/** Index-level field helpers for schema badges and the create-index form. */
export const INDEX_FIELD_DOCS = {
  numDims: {
    page: "resolvers" as const,
    label: "Index dimensions",
    blurb: "Total dimensions are the sum of each resolver's embedding size.",
  },
  idSize: {
    page: "tutorial" as const,
    hash: DOCS_HASH.tutorialCreate,
    label: "ID size",
    blurb: "Maximum stored document id length.",
  },
  distanceType: {
    page: "resolvers" as const,
    label: "Distance",
    blurb: "How neighbours are ranked when searching this index.",
  },
};

/** HNSW field helpers keyed by the create-index form field name. */
export const HNSW_FIELD_DOCS: Record<string, { hash: string; blurb: string }> =
  {
    M: {
      hash: "m",
      blurb:
        "Neighbours each new vector tries to connect to. Typical range is 5 to 48. Default 16.",
    },
    Mmax: {
      hash: "mmax",
      blurb: "Max connections on upper layers. Usually equal to M.",
    },
    Mmax0: {
      hash: "mmax0",
      blurb:
        "Max connections on layer 0. Usually 2M. Important for high recall.",
    },
    mL: {
      hash: "ml",
      blurb:
        "Layer promotion factor. Usually 1 / ln(M). Leave empty unless you know why.",
    },
    efConstruction: {
      hash: "efconstruction",
      blurb:
        "Candidate list size while building. Higher improves graph quality and slows inserts.",
    },
    efSearch: {
      hash: "efsearch",
      blurb:
        "Candidate list size at query time. Higher improves recall and latency. Must be at least k.",
    },
    extendCandidates: {
      hash: "extendcandidates",
      blurb:
        "Expand candidates with their neighbours. Helps clustered data. Default true.",
    },
    keepPrunedConnections: {
      hash: "keepprunedconnections",
      blurb:
        "Fill leftover slots with pruned neighbours so degree stays near M. Default true.",
    },
    maxStoreSize: {
      hash: "maxstoresize",
      blurb:
        "Max vectors per on-disk file. Does not change search results. Default 10000.",
    },
  };

/**
 * Absolute docs URL for a catalog page, with an optional heading hash.
 */
export function docsUrl(page: DocsPage, hash?: string): string {
  const url = new URL(DOCS_PAGES[page].path, `${DOCS_ORIGIN}/`);
  if (hash) {
    url.hash = hash.startsWith("#") ? hash.slice(1) : hash;
  }
  return url.toString();
}

/**
 * Opens a docs page in a new window. Does not navigate Studio.
 */
export function openDocs(page: DocsPage, hash?: string): Window | null {
  return window.open(docsUrl(page, hash), "_blank", "noopener,noreferrer");
}

/**
 * Docs page for an aspect resolver type.
 */
export function docsPageForAspectType(type: AspectType): DocsPage {
  return ASPECT_TYPE_DOCS[type];
}
