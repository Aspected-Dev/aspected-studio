import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { Line, LineChart, XAxis, YAxis } from "recharts"
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
  type GoldenSet,
  goldenSetDisplayName,
  goldenSetsForIndex,
} from "@/lib/aspected/golden.ts"
import { SLIDER_STEPS, sliderToWeight } from "@/lib/aspected/playground.ts"
import { summariseScorecard } from "@/lib/aspected/relevance.ts"
import { sameWeights, scoreSet } from "@/lib/aspected/scorecard.ts"
import type { DistanceType, StoredAspect } from "@/lib/aspected/types.ts"

/** Slider positions sampled by the sweep. Every fourth step reads smoothly. */
const SWEEP_STRIDE = 4

/** Tooltip for the sweep chart. */
const SWEEP_HELP =
  "nDCG across the whole golden set at every weight on the slider, holding the other aspects where they are. The rows are already on the client, so the curve is arithmetic rather than a hundred searches. Read the peak as the best weight for this aspect given the documents each case has already fetched."

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
}: PlaygroundScorecardProps) {
  const [sets, setSets] = useState<GoldenSet[]>([])
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [sweepAspect, setSweepAspect] = useState<string | null>(
    () => schema[0]?.name ?? null,
  )

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
      baselineMatchesRun
        ? {}
        : { metric, weights: baselineWeights, schema },
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

    const points: Array<{ weight: number; ndcg: number }> = []
    for (let step = 0; step <= SLIDER_STEPS; step += SWEEP_STRIDE) {
      const weight = sliderToWeight(step)
      const candidate = { ...weights, [sweepAspect]: weight }
      const at = scoreSet(activeSet, scorecard.runs, {
        metric,
        weights: candidate,
        schema,
      })
      points.push({
        weight,
        ndcg: summariseScorecard(
          at.filter((entry) => entry.score !== null).map((entry) =>
            entry.score!
          ),
          activeSet.thresholds,
        ).ndcg,
      })
    }
    return points
  }, [activeSet, sweepAspect, scorecard.runs, weights, metric, schema])

  const best = sweep.reduce<{ weight: number; ndcg: number } | null>(
    (winner, point) =>
      winner === null || point.ndcg > winner.ndcg ? point : winner,
    null,
  )

  const chartConfig: ChartConfig = {
    ndcg: { label: "nDCG", color: "var(--chart-2)" },
  }

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
            {best && sweepAspect
              ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onUseWeight(sweepAspect, best.weight)}
                >
                  Use best ({best.weight})
                </Button>
              )
              : null}
          </div>

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
