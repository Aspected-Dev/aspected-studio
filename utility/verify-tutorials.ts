/**
 * Grades the catalog golden set at the three weight configs Tutorial 5 walks
 * through, without a browser.
 *
 * Every number printed here comes from the same modules the UI calls, so this
 * is a real check of the tutorial rather than a second implementation of the
 * scoring rules. Nothing is asserted: the point is to print the figures so a
 * human can compare them against the cheat sheet in
 * `docs/tutorials/05-catalog-scorecard-demo.md`.
 *
 * ```bash
 * deno task verify:tutorials
 * ASPECTED_URL=http://box:8080 deno task verify:tutorials
 * ```
 */

import { AspectedClient } from "../src/lib/aspected/client.ts"
import { DEFAULT_BASE_URL } from "../src/lib/aspected/connection.ts"
import { caseK, parseGoldenSet } from "../src/lib/aspected/golden.ts"
import type { GoldenSet } from "../src/lib/aspected/golden.ts"
import { gradeCase, summariseScorecard } from "../src/lib/aspected/relevance.ts"
import {
  buildCaseRequest,
  type CaseRun,
  caseScoringWeights,
  caseSignature,
  runnableCases,
  scoreSet,
} from "../src/lib/aspected/scorecard.ts"

const baseUrl = (Deno.env.get("ASPECTED_URL") ?? DEFAULT_BASE_URL)
  .replace(/\/+$/, "")
const apiToken = Deno.env.get("ASPECTED_TOKEN") ?? ""

/** Requests kept in flight at once, matching `useScorecard`. */
const CONCURRENCY = 4

/** The three weight configs Tutorial 5 grades, in the order it grades them. */
const CONFIGS: Array<{ label: string; weights: Record<string, number> }> = [
  { label: "all weights 1", weights: {} },
  { label: "price 8", weights: { price: 8 } },
  { label: "price 8 + category 6", weights: { price: 8, category: 6 } },
]

/**
 * Teaches the browser-only bits of `client.ts` to run under Deno.
 *
 * `resolveApiBase` sends the default local server through the `/api` prefix so
 * the Vite dev proxy can dodge CORS, and `buildUrl` resolves that relative
 * path against `window.location.origin`. Outside the browser there is no
 * proxy and no `window`, so this stands in for both: it supplies an origin and
 * rewrites `/api` the way `vite.config.ts` does.
 */
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

/** Reads the golden set that ships beside this script. */
async function loadSet(): Promise<GoldenSet> {
  const path = new URL("./catalog-golden-set.json", import.meta.url)
  const parsed = parseGoldenSet(await Deno.readTextFile(path))
  if (!parsed.ok) {
    console.error(
      `catalog-golden-set.json is not a golden set: ${parsed.error}`,
    )
    Deno.exit(1)
  }
  return parsed.set
}

/**
 * Runs every runnable case against the server, mirroring `useScorecard`.
 *
 * Each config re-runs rather than re-ranking cached rows, because weights
 * change the request and Tutorial 5's re-run steps are what this checks.
 */
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

/** Prints one config's per-case chips and the summary tiles. */
function report(
  set: GoldenSet,
  label: string,
  weights: Record<string, number>,
  runs: Map<string, CaseRun>,
): number {
  const scored = scoreSet(set, runs, {})
  const graded = scored.filter((entry) => entry.score !== null)
  const summary = summariseScorecard(
    graded.map((entry) => entry.score!),
    set.thresholds,
  )

  const shown = Object.keys(weights).length === 0
    ? "every aspect at 1"
    : Object.entries(weights).map(([name, weight]) => `${name}=${weight}`).join(
      ", ",
    )
  console.log(`\n## ${label}  (${shown})`)

  const width = Math.max(
    ...scored.map((entry) => entry.item.name.length),
    4,
  )
  console.log(
    `${"Case".padEnd(width)}  chip   nDCG   forbidden  missing`,
  )
  for (const entry of scored) {
    if (entry.score === null) {
      console.log(
        `${entry.item.name.padEnd(width)}  ${
          (entry.error ?? "did not run").slice(0, 40)
        }`,
      )
      continue
    }
    const chip = gradeCase(entry.score, set.thresholds)
    console.log(
      [
        entry.item.name.padEnd(width),
        chip.padEnd(5),
        entry.score.ndcg.toFixed(3),
        String(entry.score.forbiddenHits.length).padStart(9),
        String(entry.score.missing.length).padStart(7),
      ].join("  "),
    )
  }

  const errors = scored.filter((entry) => entry.error !== null).length
  console.log(
    `\n  ${summary.green} green / ${summary.amber} amber / ${summary.red} red` +
      `   (${summary.scored}/${summary.cases} scored${
        errors > 0 ? `, ${errors} failed` : ""
      })`,
  )
  console.log(
    `  precision ${summary.precision.toFixed(3)}` +
      `  recall ${summary.recall.toFixed(3)}` +
      `  mrr ${summary.mrr.toFixed(3)}` +
      `  ndcg ${summary.ndcg.toFixed(3)}`,
  )
  return errors
}

installBrowserShims()

const set = await loadSet()
const client = new AspectedClient({ baseUrl, apiToken })

try {
  await client.getStatus()
} catch (caught) {
  const detail = caught instanceof Error ? caught.message : String(caught)
  console.error(`Cannot reach an Aspected server at ${baseUrl}: ${detail}`)
  console.error("Start one, or set ASPECTED_URL, then run this again.")
  Deno.exit(1)
}

console.log(`Grading "${set.name}" on index "${set.indexName}" at ${baseUrl}`)
console.log(
  `Set k=${set.k}, primary metric ${set.thresholds.metric}, ` +
    `green >= ${set.thresholds.green}, amber >= ${set.thresholds.amber}`,
)

let failed = 0
for (const config of CONFIGS) {
  failed += report(
    set,
    config.label,
    config.weights,
    await runCases(client, set, config.weights),
  )
}

console.log(
  "\nCompare against the cheat sheet in " +
    "docs/tutorials/05-catalog-scorecard-demo.md.",
)
console.log(
  "Note: the tutorial reads price 8 as a Preview re-rank of the all-1 rows, " +
    "while this script re-runs each config Live, so that row can differ.",
)

if (failed > 0) {
  console.error(`\n${failed} case run(s) failed.`)
  Deno.exit(1)
}
