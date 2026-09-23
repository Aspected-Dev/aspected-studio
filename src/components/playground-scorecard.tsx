import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { Line, LineChart, ReferenceDot, XAxis, YAxis } from "recharts"
import { MetricHelp } from "@/components/metric-tile.tsx"
import {
  CaseChips,
  CaseScoreTable,
  displayK,
  ScorecardTiles,
} from "@/components/scorecard-summary.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { useScorecard } from "@/hooks/use-scorecard.ts"
import { indexPath } from "@/lib/app-nav.ts"
import {
  DEFAULT_SWEEP_STRIDE,
  pickSweepPeak,
  rankVsWeightIds,
  suggestWeights,
  type SuggestWeightsResult,
  sweepAspectNdcg,
  sweepRankVsWeight,
} from "@/lib/aspected/auto-tune.ts"
import {
  type GoldenSet,
  goldenSetDisplayName,
  goldenSetsForIndex,
} from "@/lib/aspected/golden.ts"
import { summariseScorecard } from "@/lib/aspected/relevance.ts"
import { sameWeights, scoreSet } from "@/lib/aspected/scorecard.ts"
import type { DistanceType, StoredAspect } from "@/lib/aspected/types.ts"

/** Stroke colours for rank-vs-weight lines. */
const RANK_VS_WEIGHT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

/** Tooltip for the nDCG sweep chart. */
const SWEEP_HELP =
  "nDCG across the whole golden set at every weight on the slider, holding the other aspects where they are. The curve is conditional on the other sliders: chaining Use best across aspects is not multi-aspect optimize. Prefer Auto-tune for Live multi-aspect search, or Quick suggest for a fast Preview pass. Edge peaks at the slider rails are often Preview artifacts."

/** Tooltip for the rank-vs-weight chart. */
const RANK_VS_WEIGHT_HELP =
  "How expected (and forbidden) documents for the selected case move in rank as the swept aspect changes. Rank 1 is at the top. Absent ranks mean the document left the cached top-k window."

/** Tooltip for Quick suggest (preview). */
const SUGGEST_HELP =
  "Fast Preview coordinate ascent on the cached golden-set window only. It tunes aspects used by the golden set, not Ranking toggles. Cosine Preview can disagree with Live. For real server-backed search of weights, on/off, and depth, use Auto-tune."

/** Pending Suggest weights session. */
type SuggestSession = {
  snapshot: Record<string, number>
  result: SuggestWeightsResult
  liveNdcg: number | null
}

/** Props for {@link PlaygroundScorecard}. */
export type PlaygroundScorecardProps = {
  indexName: string
  schema: StoredAspect[]
  metric: DistanceType
  /** Weights currently on the sliders. */
  weights: Record<string, number>
  /** Weights of the pinned A config, used for the deltas. */
  baselineWeights: Record<string, number> | null
  /** Writes a swept weight back onto the form. */
  onUseWeight: (aspectName: string, weight: number) => void
  /** Writes many weights in one pass (Suggest apply / revert). */
  onUseWeights: (next: Record<string, number>) => void
}

/**
 * Grades a golden set against the weights on the sliders, live.
 *
 * The set runs once, then every weight change re-grades the cached rows
 * locally. That turns the sliders into a search for a maximum instead of a
 * matter of taste, and the sweep chart shows the whole curve at once.
 */
export function PlaygroundScorecard({
  indexName,
  schema,
  metric,
  weights,
  baselineWeights,
  onUseWeight,
  onUseWeights,
}: PlaygroundScorecardProps) {
  const [sets, setSets] = useState<GoldenSet[]>([])
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [sweepAspect, setSweepAspect] = useState<string | null>(
    () => schema[0]?.name ?? null,
  )
  const [suggest, setSuggest] = useState<SuggestSession | null>(null)

  const scorecard = useScorecard(indexName)

  // Sets are managed on the Scorecard page, which may be another tab. Re-read
  // storage when the window regains focus so a set created there shows up
  // without reloading the playground.
  useEffect(() => {
    const reload = () => {
      const stored = goldenSetsForIndex(indexName)
      setSets(stored)
      setActiveSetId((current) =>
        current !== null && stored.some((item) => item.id === current)
          ? current
          : stored[0]?.id ?? null
      )
    }
    reload()
    window.addEventListener("focus", reload)
    return () => {
      window.removeEventListener("focus", reload)
    }
  }, [indexName])

  // Keep the sweep on a live aspect when the schema loads or changes.
  useEffect(() => {
    setSweepAspect((current) => {
      if (
        current !== null && schema.some((aspect) => aspect.name === current)
      ) {
        return current
      }
      return schema[0]?.name ?? null
    })
  }, [schema])

  const activeSet = sets.find((item) => item.id === activeSetId) ?? null
  const previewing = scorecard.ranWeights !== null &&
    !sameWeights(scorecard.ranWeights, weights)

  const scored = useMemo(
    () =>
      activeSet
        ? scoreSet(
          activeSet,
          scorecard.runs,
          // Live matches the Scorecard page: grade server order. Preview
          // re-ranks locally. Always re-ranking made Cosine Live disagree with
          // the page (Gaming green at weight 1 instead of amber).
          previewing ? { metric, weights, schema } : {},
        )
        : [],
    [activeSet, scorecard.runs, previewing, metric, weights, schema],
  )

  const summary = useMemo(
    () =>
      summariseScorecard(
        scored.filter((entry) => entry.score !== null).map((entry) =>
          entry.score!
        ),
        activeSet?.thresholds ?? { metric: "ndcg", green: 0.8, amber: 0.5 },
      ),
    [scored, activeSet?.thresholds],
  )

  const baseline = useMemo(() => {
    if (!activeSet || baselineWeights === null) {
      return null
    }
    const baselineMatchesRun = scorecard.ranWeights !== null &&
      sameWeights(scorecard.ranWeights, baselineWeights)
    const at = scoreSet(
      activeSet,
      scorecard.runs,
      baselineMatchesRun ? {} : { metric, weights: baselineWeights, schema },
    )
    return summariseScorecard(
      at.filter((entry) => entry.score !== null).map((entry) => entry.score!),
      activeSet.thresholds,
    )
  }, [
    activeSet,
    baselineWeights,
    scorecard.runs,
    scorecard.ranWeights,
    metric,
    schema,
  ])

  const sweep = useMemo(() => {
    if (!activeSet || sweepAspect === null || scorecard.runs.size === 0) {
      return []
    }
    return sweepAspectNdcg(
      activeSet,
      scorecard.runs,
      metric,
      weights,
      schema,
      sweepAspect,
      DEFAULT_SWEEP_STRIDE,
    )
  }, [activeSet, sweepAspect, scorecard.runs, weights, metric, schema])

  const peak = useMemo(() => pickSweepPeak(sweep), [sweep])

  const rankCase = useMemo(() => {
    if (!activeSet) {
      return null
    }
    if (selectedCaseId !== null) {
      return activeSet.cases.find((item) => item.id === selectedCaseId) ?? null
    }
    return activeSet.cases.find((item) => item.enabled) ?? null
  }, [activeSet, selectedCaseId])

  const trackedIds = useMemo(() => {
    if (!rankCase) {
      return []
    }
    return rankVsWeightIds(
      rankCase.expected.map((entry) => entry.id),
      rankCase.forbidden,
    )
  }, [rankCase])

  const rankVsWeight = useMemo(() => {
    if (
      !activeSet || !rankCase || sweepAspect === null ||
      scorecard.runs.size === 0 || trackedIds.length === 0
    ) {
      return []
    }
    return sweepRankVsWeight(
      activeSet,
      scorecard.runs,
      metric,
      weights,
      schema,
      sweepAspect,
      rankCase.id,
      trackedIds,
      DEFAULT_SWEEP_STRIDE,
    )
  }, [
    activeSet,
    rankCase,
    sweepAspect,
    scorecard.runs,
    metric,
    weights,
    schema,
    trackedIds,
  ])

  const chartConfig: ChartConfig = {
    ndcg: { label: "nDCG", color: "var(--chart-2)" },
  }

  const rankVsWeightConfig: ChartConfig = Object.fromEntries(
    trackedIds.map((id, index) => [
      id,
      {
        label: id,
        color: RANK_VS_WEIGHT_COLORS[index % RANK_VS_WEIGHT_COLORS.length],
      },
    ]),
  )

  const axisDepth = useMemo(() => {
    let max = 1
    for (const point of rankVsWeight) {
      for (const id of trackedIds) {
        const rank = point[id]
        if (typeof rank === "number" && rank > max) {
          max = rank
        }
      }
    }
    return max
  }, [rankVsWeight, trackedIds])

  if (sets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
          <CardDescription>
            No golden set for this index yet. A set is a handful of searches
            with the documents they should return, which is what makes a weight
            change measurable instead of a matter of opinion. Sets are created
            and edited on Scorecard, then graded here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            render={<Link to={indexPath(indexName, "scorecard")} />}
          >
            Create a golden set
          </Button>
        </CardContent>
      </Card>
    )
  }

  const canTune = activeSet !== null && scorecard.runs.size > 0 &&
    !scorecard.running

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <CardTitle>Scorecard</CardTitle>
          <CardDescription>
            {scorecard.ranAt === null
              ? "Run the set once, then every weight change re-grades it locally."
              : previewing
              ? "Re-graded locally at the weights on the sliders."
              : "Graded at the weights the server ran."}
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {scorecard.ranAt === null
            ? null
            : (
              <Badge variant={previewing ? "outline" : "secondary"}>
                {previewing ? "Preview" : "Live"}
              </Badge>
            )}
          <Select
            value={activeSetId ?? null}
            items={Object.fromEntries(
              sets.map((item) => [item.id, goldenSetDisplayName(item)]),
            )}
            onValueChange={(next) => {
              if (typeof next === "string") {
                setActiveSetId(next)
                setSelectedCaseId(null)
                setSuggest(null)
                scorecard.clear()
              }
            }}
          >
            <SelectTrigger className="w-44" aria-label="Golden set">
              <SelectValue placeholder="Choose a set" />
            </SelectTrigger>
            <SelectContent>
              {sets.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {goldenSetDisplayName(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={scorecard.running || activeSet === null}
            onClick={() => {
              if (activeSet) {
                void scorecard.run(activeSet, weights)
              }
            }}
          >
            {scorecard.running
              ? `Running ${scorecard.progress.done}/${scorecard.progress.total}…`
              : "Run set"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <ScorecardTiles
          summary={summary}
          k={activeSet ? displayK(activeSet) : 0}
          baseline={baseline}
        />

        {baseline === null
          ? null
          : (
            <p className="text-sm text-muted-foreground">
              Deltas are against the pinned A config, so a green number means
              the change is an improvement on this set and not just a reshuffle.
            </p>
          )}

        <CaseChips
          scored={scored}
          thresholds={activeSet?.thresholds ??
            { metric: "ndcg", green: 0.8, amber: 0.5 }}
          selectedId={selectedCaseId}
          onSelect={setSelectedCaseId}
        />

        <Separator />

        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center">
              <span className="text-sm font-medium">Weight sweep</span>
              <MetricHelp label="weight sweep" text={SWEEP_HELP} />
            </div>
            <Select
              value={sweepAspect ?? null}
              items={Object.fromEntries(
                schema.map((aspect) => [aspect.name, aspect.name]),
              )}
              onValueChange={(next) => {
                if (typeof next === "string") {
                  setSweepAspect(next)
                }
              }}
            >
              <SelectTrigger className="w-44" aria-label="Sweep aspect">
                <SelectValue placeholder="Choose an aspect" />
              </SelectTrigger>
              <SelectContent>
                {schema.map((aspect) => (
                  <SelectItem key={aspect.name} value={aspect.name}>
                    {aspect.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {peak && sweepAspect
              ? (
                <Button
                  type="button"
                  variant={peak.kind === "edge" ? "outline" : "secondary"}
                  onClick={() => onUseWeight(sweepAspect, peak.weight)}
                >
                  {peak.kind === "edge"
                    ? `Use peak (edge ${peak.weight} · nDCG ${
                      peak.ndcg.toFixed(3)
                    })`
                    : `Use best (${peak.weight} · nDCG ${
                      peak.ndcg.toFixed(3)
                    })`}
                </Button>
              )
              : null}
          </div>

          {peak?.kind === "edge"
            ? (
              <p className="text-sm text-muted-foreground">
                Peak sits at a slider rail. Edge peaks are often Preview
                artifacts; prefer Auto-tune or a manual drag, then Verify with
                Run set.
              </p>
            )
            : null}

          {sweep.length > 0
            ? (
              <ChartContainer
                config={chartConfig}
                className="aspect-auto h-64 w-full"
              >
                <LineChart
                  accessibilityLayer
                  data={sweep}
                  margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                >
                  <XAxis
                    dataKey="weight"
                    type="number"
                    scale="log"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => String(value)}
                  />
                  <YAxis
                    domain={[0, 1]}
                    width={48}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="ndcg"
                    type="monotone"
                    stroke="var(--color-ndcg)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {peak
                    ? (
                      <ReferenceDot
                        x={peak.weight}
                        y={peak.ndcg}
                        r={4}
                        fill="var(--color-ndcg)"
                        stroke="var(--background)"
                      />
                    )
                    : null}
                </LineChart>
              </ChartContainer>
            )
            : (
              <p className="text-sm text-muted-foreground">
                {scorecard.ranAt === null
                  ? "Run the set to sweep a weight."
                  : "Pick an aspect to sweep."}
              </p>
            )}

          {rankVsWeight.length > 0
            ? (
              <div className="grid min-w-0 gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="text-sm font-medium">
                    Rank vs weight
                    {rankCase ? ` · ${rankCase.name}` : ""}
                  </span>
                  <MetricHelp
                    label="rank vs weight"
                    text={RANK_VS_WEIGHT_HELP}
                  />
                </div>
                <ChartContainer
                  config={rankVsWeightConfig}
                  className="aspect-auto h-56 w-full"
                >
                  <LineChart
                    accessibilityLayer
                    data={rankVsWeight}
                    margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="weight"
                      type="number"
                      scale="log"
                      domain={["dataMin", "dataMax"]}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => String(value)}
                    />
                    <YAxis
                      reversed
                      domain={[0.5, axisDepth + 0.5]}
                      width={36}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {trackedIds.map((id) => (
                      <Line
                        key={id}
                        dataKey={id}
                        name={id}
                        type="monotone"
                        stroke={`var(--color-${id})`}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              </div>
            )
            : null}
        </div>

        <Separator />

        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 items-center">
              <span className="text-sm font-medium">
                Quick suggest (preview)
              </span>
              <MetricHelp label="quick suggest" text={SUGGEST_HELP} />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!canTune || activeSet === null}
              onClick={() => {
                if (!activeSet) {
                  return
                }
                const result = suggestWeights({
                  set: activeSet,
                  runs: scorecard.runs,
                  metric,
                  schema,
                  startWeights: weights,
                })
                setSuggest({
                  snapshot: { ...weights },
                  result,
                  liveNdcg: null,
                })
              }}
            >
              Quick suggest
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={<Link to={indexPath(indexName, "auto-tune")} />}
            >
              Open Auto-tune
            </Button>
          </div>

          {suggest
            ? (
              <div className="grid min-w-0 gap-3 rounded-lg border p-3">
                <p className="text-sm">
                  Preview nDCG {suggest.result.startNdcg.toFixed(3)} →{" "}
                  {suggest.result.previewNdcg.toFixed(3)}
                  {suggest.liveNdcg !== null
                    ? ` · Live after verify ${suggest.liveNdcg.toFixed(3)}`
                    : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  Preview only, on aspects the golden set queries. Prefer{" "}
                  <Link
                    className="underline underline-offset-2"
                    to={indexPath(indexName, "auto-tune")}
                  >
                    Auto-tune
                  </Link>{" "}
                  for Live search of weights, on/off, and depth.
                </p>
                {suggest.result.usedEdgePeak
                  ? (
                    <p className="text-sm text-muted-foreground">
                      At least one ascent step used an edge peak. Verify with
                      Run set before keeping.
                    </p>
                  )
                  : null}
                {suggest.liveNdcg !== null &&
                    suggest.liveNdcg + 1e-9 < suggest.result.startNdcg
                  ? (
                    <p className="text-sm text-muted-foreground">
                      Live nDCG dropped versus the start snapshot. Prefer Revert
                      unless you accept the trade-off.
                    </p>
                  )
                  : null}
                <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
                  {Object.keys(suggest.result.weights).map((name) => {
                    const from = suggest.snapshot[name] ?? 1
                    const to = suggest.result.weights[name] ?? 1
                    if (from === to) {
                      return null
                    }
                    return (
                      <li key={name}>
                        {name}: {from} → {to}
                      </li>
                    )
                  })}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onUseWeights(suggest.result.weights)}
                  >
                    Apply preview
                  </Button>
                  <Button
                    type="button"
                    disabled={!canTune || activeSet === null ||
                      scorecard.running}
                    onClick={() => {
                      if (!activeSet) {
                        return
                      }
                      const candidate = suggest.result.weights
                      onUseWeights(candidate)
                      void scorecard.run(activeSet, candidate).then(
                        (collected) => {
                          const live = summariseScorecard(
                            scoreSet(activeSet, collected)
                              .filter((entry) => entry.score !== null)
                              .map((entry) => entry.score!),
                            activeSet.thresholds,
                          ).ndcg
                          setSuggest((current) =>
                            current ? { ...current, liveNdcg: live } : current
                          )
                        },
                      )
                    }}
                  >
                    Verify with Run set
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      onUseWeights(suggest.result.weights)
                      setSuggest(null)
                    }}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onUseWeights(suggest.snapshot)
                      setSuggest(null)
                    }}
                  >
                    Revert
                  </Button>
                </div>
              </div>
            )
            : (
              <p className="text-sm text-muted-foreground">
                {scorecard.ranAt === null
                  ? "Run the set before suggesting weights."
                  : "Search the weight vector on the cache, then verify with a real Run set."}
              </p>
            )}
        </div>

        {activeSet
          ? (
            <>
              <Separator />
              <CaseScoreTable
                set={activeSet}
                scored={scored}
                selectedId={selectedCaseId}
                onSelect={setSelectedCaseId}
              />
            </>
          )
          : null}
      </CardContent>
    </Card>
  )
}
