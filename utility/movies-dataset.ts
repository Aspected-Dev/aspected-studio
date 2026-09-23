/**
 * TMDB 5000 movie rows shaped for the `movies` Aspected index.
 *
 * Shared by `seed-movies.ts` and `check-movies.ts` so the schema and document
 * ids cannot drift between seed and golden-set checks.
 */

/** Index this dataset owns. */
export const MOVIES_INDEX = "movies"

/** Text embedding model shipped with Aspected. */
export const TEXT_MODEL = "nomic-embed-text-v1.5.f16.gguf"

/** Noise keywords that do not help retrieval. */
const KEYWORD_NOISE = new Set([
  "duringcreditsstinger",
  "aftercreditsstinger",
])

/**
 * Primary genres plus `Unknown` for films with an empty genre list.
 *
 * Order matches the TMDB vocabulary plus the fill label.
 */
export const MOVIE_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Foreign",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "TV Movie",
  "Thriller",
  "War",
  "Western",
  "Unknown",
] as const

/** ISO language codes present in TMDB 5000 `original_language`. */
export const MOVIE_LANGUAGES = [
  "af",
  "ar",
  "cn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fa",
  "fr",
  "he",
  "hi",
  "hu",
  "id",
  "is",
  "it",
  "ja",
  "ko",
  "ky",
  "nb",
  "nl",
  "no",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sl",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "vi",
  "xx",
  "zh",
] as const

/** Create-index schema for {@link MOVIES_INDEX}. */
export const MOVIES_SCHEMA = [
  {
    name: "title",
    type: "text",
    path: "$.title",
    settings: { model: TEXT_MODEL },
  },
  {
    name: "overview",
    type: "text",
    path: "$.overview",
    settings: { model: TEXT_MODEL },
  },
  {
    name: "themes",
    type: "text",
    path: "$.themes",
    settings: { model: TEXT_MODEL },
  },
  {
    name: "credits",
    type: "text",
    path: "$.credits",
    settings: { model: TEXT_MODEL },
  },
  {
    name: "genre",
    type: "enum",
    path: "$.genre",
    settings: {
      values: [...MOVIE_GENRES],
      maxValuesPerRadial: 5,
    },
  },
  {
    name: "language",
    type: "enum",
    path: "$.language",
    settings: {
      values: [...MOVIE_LANGUAGES],
      maxValuesPerRadial: 5,
    },
  },
  {
    name: "released",
    type: "datetime",
    path: "$.released",
    settings: {
      granularity: ["year"],
      minYear: 1910,
      maxYear: 2020,
    },
  },
  {
    name: "rating",
    type: "number",
    path: "$.rating",
    settings: { min: 0, max: 10 },
  },
  {
    name: "popularity",
    type: "number",
    path: "$.popularity",
    settings: { min: 0, max: 4.2 },
  },
  {
    name: "runtime",
    type: "number",
    path: "$.runtime",
    settings: { min: 0, max: 340 },
  },
] as const

/** One upload row for `POST /indexes/movies/docs`. */
export type MovieUpload = {
  id: string
  doc: MovieDoc
}

/** Document payload stored under each movie id. */
export type MovieDoc = {
  title: string
  overview: string
  themes: string
  credits: string
  genre: string
  language: string
  released: string
  rating: number
  popularity: number
  runtime: number
  tmdbId: number
  year: number
  genres: string[]
  director: string
  runtimeImputed: boolean
}

/** Counts logged after a load so fill rules stay visible. */
export type MovieLoadStats = {
  totalRows: number
  uploaded: number
  droppedNoRelease: number
  emptyOverview: number
  unknownGenre: number
  runtimeImputed: number
  noDirector: number
}

type NamedJson = { name?: string }
type CastMember = { name?: string; order?: number }
type CrewMember = { name?: string; job?: string }

/** Default directory holding the TMDB CSVs (the `utility/` folder). */
export function defaultTmdbDir(): string {
  return new URL(".", import.meta.url).pathname
}

/**
 * Builds a stable, readable document id: `slug(title)-year`.
 *
 * Opaque TMDB ids would make golden-set reviews painful. The year suffix
 * disambiguates the three duplicate titles in this dump.
 */
export function movieDocId(title: string, year: number): string {
  const slug = slugify(title)
  if (!slug) {
    throw new Error(`Cannot slugify title: ${JSON.stringify(title)}`)
  }
  return `${slug}-${year}`
}

/** Lowercase ASCII slug with hyphens, matching the golden-set id style. */
export function slugify(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** `log10(voteCount + 1)`, clamped to the popularity aspect range. */
export function popularityFromVotes(voteCount: number): number {
  const raw = Math.log10(Math.max(0, voteCount) + 1)
  return Math.min(4.2, Math.max(0, Math.round(raw * 1e6) / 1e6))
}

/** Title text aspect: append original title when it differs. */
export function composeTitle(
  title: string,
  originalTitle: string,
): string {
  const trimmed = title.trim()
  const original = originalTitle.trim()
  if (original && original !== trimmed) {
    return `${trimmed} (${original})`
  }
  return trimmed
}

/** Overview text aspect: overview + tagline, with a title fallback. */
export function composeOverview(
  overview: string,
  tagline: string,
  title: string,
): string {
  const body = overview.trim()
  const tag = tagline.trim()
  if (!body) {
    return [title.trim(), tag].filter(Boolean).join(". ")
  }
  return tag ? `${body} ${tag}` : body
}

/** Themes text aspect: genres and keywords, dropping credit-stinger noise. */
export function composeThemes(
  genres: string[],
  keywords: string[],
): string {
  const parts = [
    ...genres,
    ...keywords.filter((word) => !KEYWORD_NOISE.has(word.toLowerCase())),
  ]
  return parts.join(", ")
}

/** Credits text aspect: director plus top-billed cast. */
export function composeCredits(
  director: string,
  cast: string[],
): string {
  const bits: string[] = []
  if (director) {
    bits.push(`Directed by ${director}.`)
  }
  if (cast.length > 0) {
    bits.push(`Starring ${cast.join(", ")}.`)
  }
  return bits.join(" ") || "Unknown credits."
}

/**
 * Loads and joins the TMDB CSVs into upload rows.
 *
 * Films without a release date are dropped (datetime cannot be null). Missing
 * overview, genre, runtime, and director are filled so every aspect is scalar.
 */
export async function loadMovies(options?: {
  dir?: string
  limit?: number
}): Promise<{ movies: MovieUpload[]; stats: MovieLoadStats }> {
  const dir = (options?.dir ?? defaultTmdbDir()).replace(/\/+$/, "")
  const moviesPath = `${dir}/tmdb_5000_movies.csv`
  const creditsPath = `${dir}/tmdb_5000_credits.csv`

  const movieRows = await readCsv(moviesPath)
  const creditRows = await readCsv(creditsPath)
  const creditsById = new Map(
    creditRows.map((row) => [String(row.movie_id ?? ""), row]),
  )

  const runtimeByGenre = medianRuntimeByGenre(movieRows)
  const overallMedian = median(
    movieRows
      .map((row) => Number(row.runtime))
      .filter((value) => Number.isFinite(value) && value > 0),
  ) ?? 104

  const stats: MovieLoadStats = {
    totalRows: movieRows.length,
    uploaded: 0,
    droppedNoRelease: 0,
    emptyOverview: 0,
    unknownGenre: 0,
    runtimeImputed: 0,
    noDirector: 0,
  }

  const movies: MovieUpload[] = []
  const seenIds = new Set<string>()

  for (const row of movieRows) {
    if (options?.limit !== undefined && movies.length >= options.limit) {
      break
    }

    const releaseDate = String(row.release_date ?? "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
      stats.droppedNoRelease += 1
      continue
    }

    const year = Number(releaseDate.slice(0, 4))
    const title = String(row.title ?? "").trim()
    const id = movieDocId(title, year)
    if (seenIds.has(id)) {
      throw new Error(`Duplicate movie id after slugify: ${id}`)
    }
    seenIds.add(id)

    const genres = parseNamedList(row.genres)
    const keywords = parseNamedList(row.keywords)
    const genre = genres[0] ?? "Unknown"
    if (genre === "Unknown") {
      stats.unknownGenre += 1
    }
    if (!String(row.overview ?? "").trim()) {
      stats.emptyOverview += 1
    }

    const credit = creditsById.get(String(row.id ?? ""))
    const cast = topCast(credit?.cast, 5)
    const director = firstDirector(credit?.crew)
    if (!director) {
      stats.noDirector += 1
    }

    let runtime = Number(row.runtime)
    let runtimeImputed = false
    if (!Number.isFinite(runtime) || runtime <= 0) {
      runtime = runtimeByGenre.get(genre) ?? overallMedian
      runtimeImputed = true
      stats.runtimeImputed += 1
    }
    runtime = Math.min(340, Math.max(0, runtime))

    const language = String(row.original_language ?? "xx").trim() || "xx"
    if (!(MOVIE_LANGUAGES as readonly string[]).includes(language)) {
      throw new Error(`Unexpected language on ${id}: ${language}`)
    }

    const voteAverage = Number(row.vote_average)
    const voteCount = Number(row.vote_count)
    const rating = Number.isFinite(voteAverage)
      ? Math.min(10, Math.max(0, voteAverage))
      : 0
    const popularity = popularityFromVotes(
      Number.isFinite(voteCount) ? voteCount : 0,
    )

    const [y, m, d] = releaseDate.split("-")
    const released = `${y}/${m}/${d} 00:00:00`

    movies.push({
      id,
      doc: {
        title: composeTitle(title, String(row.original_title ?? "")),
        overview: composeOverview(
          String(row.overview ?? ""),
          String(row.tagline ?? ""),
          title,
        ),
        themes: composeThemes(genres, keywords),
        credits: composeCredits(director, cast),
        genre,
        language,
        released,
        rating,
        popularity,
        runtime,
        tmdbId: Number(row.id),
        year,
        genres,
        director,
        runtimeImputed,
      },
    })
  }

  stats.uploaded = movies.length
  return { movies, stats }
}

async function readCsv(path: string): Promise<Record<string, string>[]> {
  const text = await Deno.readTextFile(path)
  const cleaned = text.replace(/^\uFEFF/, "")
  return parseCsvObjects(cleaned)
}

/**
 * Minimal RFC 4180 CSV parser that returns objects keyed by the header row.
 *
 * Kept local so Vitest can import pure helpers without resolving JSR packages.
 */
export function parseCsvObjects(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text)
  if (rows.length === 0) {
    return []
  }
  const header = rows[0]
  return rows.slice(1).map((cells) => {
    const row: Record<string, string> = {}
    for (let i = 0; i < header.length; i += 1) {
      row[header[i]] = cells[i] ?? ""
    }
    return row
  })
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let i = 0
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ""
  }
  const pushRow = () => {
    pushCell()
    if (row.length > 1 || row[0] !== "" || rows.length === 0) {
      rows.push(row)
    }
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ",") {
      pushCell()
      i += 1
      continue
    }
    if (ch === "\n") {
      pushRow()
      i += 1
      continue
    }
    if (ch === "\r") {
      i += 1
      continue
    }
    cell += ch
    i += 1
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow()
  }
  return rows
}

function parseNamedList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as NamedJson[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((entry) => String(entry?.name ?? "").trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function topCast(raw: unknown, limit: number): string[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as CastMember[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return [...parsed]
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      .map((entry) => String(entry?.name ?? "").trim())
      .filter(Boolean)
      .slice(0, limit)
  } catch {
    return []
  }
}

function firstDirector(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return ""
  }
  try {
    const parsed = JSON.parse(raw) as CrewMember[]
    if (!Array.isArray(parsed)) {
      return ""
    }
    const director = parsed.find((entry) => entry?.job === "Director")
    return String(director?.name ?? "").trim()
  } catch {
    return ""
  }
}

function medianRuntimeByGenre(
  rows: Record<string, string>[],
): Map<string, number> {
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const genres = parseNamedList(row.genres)
    const genre = genres[0] ?? "Unknown"
    const runtime = Number(row.runtime)
    if (!Number.isFinite(runtime) || runtime <= 0) {
      continue
    }
    const list = buckets.get(genre) ?? []
    list.push(runtime)
    buckets.set(genre, list)
  }
  const result = new Map<string, number>()
  for (const [genre, values] of buckets) {
    const mid = median(values)
    if (mid !== null) {
      result.set(genre, mid)
    }
  }
  return result
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}
