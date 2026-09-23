/**
 * Seeds the `movies` index from TMDB 5000 CSVs in `utility/`.
 *
 * Re-running deletes and rebuilds the index. Four text aspects mean roughly
 * 19k embeddings, so a full load takes minutes on CPU.
 *
 * ```bash
 * deno task seed:movies
 * MOVIES_LIMIT=50 deno task seed:movies
 * ASPECTED_URL=http://box:8080 deno task seed:movies
 * ```
 */

import {
  defaultTmdbDir,
  loadMovies,
  MOVIES_INDEX,
  MOVIES_SCHEMA,
} from "./movies-dataset.ts"

const baseUrl = (Deno.env.get("ASPECTED_URL") ?? "http://localhost:8080")
  .replace(/\/+$/, "")
const apiToken = Deno.env.get("ASPECTED_TOKEN") ?? ""
const tmdbDir = Deno.env.get("TMDB_DIR") ?? defaultTmdbDir()
const limitRaw = Deno.env.get("MOVIES_LIMIT")
const limit = limitRaw ? Number(limitRaw) : undefined

if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
  throw new Error(`MOVIES_LIMIT must be a positive number, got ${limitRaw}`)
}

const BATCH = 25

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const started = performance.now()
const { movies, stats } = await loadMovies({ dir: tmdbDir, limit })
console.log(
  `Loaded ${stats.uploaded}/${stats.totalRows} movies` +
    ` (dropped ${stats.droppedNoRelease} without release date)` +
    ` from ${tmdbDir}`,
)
console.log(
  `  empty overview ${stats.emptyOverview}` +
    `  unknown genre ${stats.unknownGenre}` +
    `  runtime imputed ${stats.runtimeImputed}` +
    `  no director ${stats.noDirector}`,
)
console.log(
  `Seeding ${movies.length} documents into ${MOVIES_INDEX} at ${baseUrl}`,
)

await call("DELETE", `/indexes/${MOVIES_INDEX}`).catch(() => null)

await call("PUT", `/indexes/${MOVIES_INDEX}`, {
  idSize: 96,
  distanceType: "Cosine",
  schema: MOVIES_SCHEMA,
})

for (let start = 0; start < movies.length; start += BATCH) {
  const batch = movies.slice(start, start + BATCH)
  await call("POST", `/indexes/${MOVIES_INDEX}/docs`, {
    data: batch,
    policy: { duplicate: "Replace", missing: "Ignore" },
  })
  const done = start + batch.length
  const elapsed = ((performance.now() - started) / 1000).toFixed(1)
  console.log(`  uploaded ${done}/${movies.length} (${elapsed}s)`)
}

const totalSec = ((performance.now() - started) / 1000).toFixed(1)
console.log(`Done in ${totalSec}s. Open /indexes/${MOVIES_INDEX}/playground`)
