/**
 * Offline (and optional live) checks for the movies golden sets.
 *
 * Offline validates ids, aspect names/types/values against {@link MOVIES_SCHEMA}
 * and the CSV-derived docs. `--live` grades both sets against a running server.
 *
 * ```bash
 * deno task check:movies
 * deno task check:movies -- --live
 * ASPECTED_URL=http://box:8080 deno task check:movies -- --live
 * ```
 */

import { AspectedClient } from "../src/lib/aspected/client.ts"
import { DEFAULT_BASE_URL } from "../src/lib/aspected/connection.ts"
import {
  caseK,
  type GoldenCase,
  type GoldenSet,
  parseGoldenSet,
} from "../src/lib/aspected/golden.ts"
import { gradeCase, summariseScorecard } from "../src/lib/aspected/relevance.ts"
import {
  buildCaseRequest,
  type CaseRun,
  caseScoringWeights,
  caseSignature,
  runnableCases,
  scoreSet,
} from "../src/lib/aspected/scorecard.ts"
import {
  defaultTmdbDir,
  loadMovies,
  MOVIE_GENRES,
  MOVIE_LANGUAGES,
  MOVIES_INDEX,
  MOVIES_SCHEMA,
  type MovieUpload,
} from "./movies-dataset.ts"

const baseUrl = (Deno.env.get("ASPECTED_URL") ?? DEFAULT_BASE_URL)
  .replace(/\/+$/, "")
const apiToken = Deno.env.get("ASPECTED_TOKEN") ?? ""
const tmdbDir = Deno.env.get("TMDB_DIR") ?? defaultTmdbDir()
const live = Deno.args.includes("--live")
const CONCURRENCY = 4

const SCHEMA_BY_NAME = new Map<string, {
  name: string
  type: string
  settings: Record<string, unknown>
}>(
  MOVIES_SCHEMA.map((aspect) => [aspect.name, {
    name: aspect.name,
    type: aspect.type,
    settings: aspect.settings as Record<string, unknown>,
  }]),
)

const YEAR_QUERY =
  /^(?:\d{4}|\d{4}\/\d{2}|\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})$/

type Issue = { file: string; caseName: string; message: string }

function installBrowserShims(): void {
  const globals = globalThis as {
    window?: unknown
    fetch: typeof fetch
  }
  globals.window = { location: { origin: baseUrl } }

  const inner = globals.fetch
  globals.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith("/")) {
      return inner(`${baseUrl}${input.replace(/^\/api/, "")}`, init)
    }
    return inner(input, init)
  }
}

async function loadGolden(filename: string): Promise<GoldenSet> {
  const path = new URL(`./${filename}`, import.meta.url)
  const parsed = parseGoldenSet(await Deno.readTextFile(path))
  if (!parsed.ok) {
    console.error(`${filename} is not a golden set: ${parsed.error}`)
    Deno.exit(1)
  }
  if (parsed.set.indexName !== MOVIES_INDEX) {
    console.error(
      `${filename} indexName is "${parsed.set.indexName}", expected "${MOVIES_INDEX}"`,
    )
    Deno.exit(1)
  }
  return parsed.set
}

function checkCase(
  file: string,
  item: GoldenCase,
  docsById: Map<string, MovieUpload>,
): Issue[] {
  const issues: Issue[] = []
  const push = (message: string) => {
    issues.push({ file, caseName: item.name, message })
  }

  if (item.expected.length === 0) {
    push("expected list is empty")
  }

  const expectedIds = new Set(item.expected.map((entry) => entry.id))
  for (const id of item.forbidden) {
    if (expectedIds.has(id)) {
      push(`id ${id} is both expected and forbidden`)
    }
  }

  for (const judgement of item.expected) {
    if (!docsById.has(judgement.id)) {
      push(`expected id not in dataset: ${judgement.id}`)
    }
  }
  for (const id of item.forbidden) {
    if (!docsById.has(id)) {
      push(`forbidden id not in dataset: ${id}`)
    }
  }

  const seenAspects = new Set<string>()
  for (const row of item.aspects) {
    if (seenAspects.has(row.name)) {
      push(`duplicate aspect row: ${row.name}`)
    }
    seenAspects.add(row.name)

    const schema = SCHEMA_BY_NAME.get(row.name)
    if (!schema) {
      push(`unknown aspect ${row.name}`)
      continue
    }
    if (row.type !== schema.type) {
      push(
        `aspect ${row.name} type is ${row.type}, schema expects ${schema.type}`,
      )
    }

    const value = row.value.trim()
    if (!row.enabled || value === "") {
      continue
    }

    if (row.type === "enum") {
      const values = (schema.settings.values as string[] | undefined) ?? []
      if (!values.includes(value)) {
        push(`aspect ${row.name} value ${JSON.stringify(value)} not in enum`)
      }
    }

    if (row.type === "number") {
      const parsed = Number(value)
      const min = Number(schema.settings.min ?? 0)
      const max = Number(schema.settings.max)
      if (!Number.isFinite(parsed)) {
        push(`aspect ${row.name} is not a number: ${value}`)
      } else if (parsed < min || parsed > max) {
        push(`aspect ${row.name} ${parsed} outside [${min}, ${max}]`)
      }
    }

    if (row.type === "datetime" && !YEAR_QUERY.test(value)) {
      push(
        `aspect ${row.name} datetime ${
          JSON.stringify(value)
        } is not a year query format`,
      )
    }
  }

  for (const aspect of MOVIES_SCHEMA) {
    if (!seenAspects.has(aspect.name)) {
      push(`missing aspect row for ${aspect.name}`)
    }
  }

  return issues
}

async function runCases(
  client: AspectedClient,
  set: GoldenSet,
  weights: Record<string, number>,
): Promise<Map<string, CaseRun>> {
  const pending = runnableCases(set, weights)
  const runs = new Map<string, CaseRun>()
  let cursor = 0

  const worker = async () => {
    while (cursor < pending.length) {
      const item = pending[cursor]
      cursor += 1
      const k = caseK(set, item)
      const signature = caseSignature(item, weights, k)

      try {
        const body = buildCaseRequest(item, weights, k)
        const response = await client.searchIndex(set.indexName, body)
        runs.set(item.id, {
          caseId: item.id,
          rows: response.data,
          weightsUsed: caseScoringWeights(item, weights),
          request: body,
          signature,
          error: null,
        })
      } catch (caught) {
        runs.set(item.id, {
          caseId: item.id,
          rows: [],
          weightsUsed: caseScoringWeights(item, weights),
          request: { k, query: {} },
          signature,
          error: caught instanceof Error ? caught.message : "Case failed",
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
  )
  return runs
}

function reportLive(
  set: GoldenSet,
  label: string,
  _weights: Record<string, number>,
  runs: Map<string, CaseRun>,
): number {
  const scored = scoreSet(set, runs, {})
  const graded = scored.filter((entry) => entry.score !== null)
  const summary = summariseScorecard(
    graded.map((entry) => entry.score!),
    set.thresholds,
  )

  console.log(`\n## ${set.name} / ${label}`)
  let knownRed = 0
  for (const entry of scored) {
    if (entry.score === null) {
      continue
    }
    const chip = gradeCase(entry.score, set.thresholds)
    if (
      entry.item.tags.includes("known-item") &&
      !entry.item.tags.includes("collision") &&
      chip === "red"
    ) {
      knownRed += 1
      console.log(`  RED known-item: ${entry.item.name}`)
    }
  }

  console.log(
    `  ${summary.green} green / ${summary.amber} amber / ${summary.red} red` +
      `   ndcg ${summary.ndcg.toFixed(3)}` +
      `   (${summary.scored}/${summary.cases} scored)`,
  )
  return scored.filter((entry) => entry.error !== null).length + knownRed
}

// Keep vocab exports referenced so schema drift stays visible to check.
void MOVIE_GENRES
void MOVIE_LANGUAGES

const { movies } = await loadMovies({ dir: tmdbDir })
const docsById = new Map(movies.map((row) => [row.id, row]))

const files = ["movies-golden-set.json", "movies-planted-set.json"]
const issues: Issue[] = []

for (const file of files) {
  const set = await loadGolden(file)
  console.log(
    `Checking ${file}: ${set.cases.length} cases against ${docsById.size} docs`,
  )
  for (const item of set.cases) {
    issues.push(...checkCase(file, item, docsById))
  }
}

if (issues.length > 0) {
  console.error(`\n${issues.length} offline issue(s):`)
  for (const issue of issues.slice(0, 50)) {
    console.error(`  [${issue.file}] ${issue.caseName}: ${issue.message}`)
  }
  if (issues.length > 50) {
    console.error(`  …and ${issues.length - 50} more`)
  }
  Deno.exit(1)
}

console.log("Offline checks passed.")

if (!live) {
  Deno.exit(0)
}

installBrowserShims()
const client = new AspectedClient({ baseUrl, apiToken })

try {
  await client.getStatus()
} catch (caught) {
  const detail = caught instanceof Error ? caught.message : String(caught)
  console.error(`Cannot reach Aspected at ${baseUrl}: ${detail}`)
  Deno.exit(1)
}

let failed = 0
for (const file of files) {
  const set = await loadGolden(file)
  failed += await reportLive(
    set,
    "all weights 1",
    {},
    await runCases(client, set, {}),
  )
  failed += await reportLive(
    set,
    "title 4",
    { title: 4 },
    await runCases(client, set, { title: 4 }),
  )
}

if (failed > 0) {
  console.error(`\nLive check reported ${failed} problem(s).`)
  Deno.exit(1)
}

console.log("\nLive checks finished.")
