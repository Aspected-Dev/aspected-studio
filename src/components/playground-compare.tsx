import { useMemo } from "react"
import { AnimatePresence, LayoutGroup } from "motion/react"
import { ArrowDownIcon, ArrowUpIcon, CircleHelpIcon } from "lucide-react"
import { Line, LineChart, XAxis, YAxis } from "recharts"
import { AnimatedNumber } from "@/components/animated-number.tsx"
import { MotionTableRow } from "@/components/motion-table-row.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button, buttonVariants } from "@/components/ui/button.tsx"
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
import { Separator } from "@/components/ui/separator.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { cn } from "@/lib/utils.ts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  bumpSeries,
  type CompareMovement,
  compareRankings,
  type CompareRow,
  type ConfigChange,
  diffConfigs,
  idByRank,
  type PinnedRun,
  RBO_P,
  summariseComparison,
} from "@/lib/aspected/compare.ts"
import type { PlaygroundFormValues } from "@/lib/aspected/playground.ts"
import type { DistanceType } from "@/lib/aspected/types.ts"

/** Reorder feel, matching the Ranking tab. */
const REORDER_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
}

/** Stroke colours keyed by movement direction. */
const MOVEMENT_STROKE: Record<CompareMovement, string> = {
  up: "var(--chart-2)",
  down: "var(--chart-4)",
  same: "var(--muted-foreground)",
  entered: "var(--chart-2)",
  left: "var(--chart-4)",
}

/** Props for {@link PlaygroundCompare}. */
export type PlaygroundCompareProps = {
  pinned: PinnedRun | null
  /** Ranking currently on screen (B), in display order. */
  current: Array<{ id: string; distance: number }>
  currentValues: PlaygroundFormValues
  metric: DistanceType
  /** True once a real search has landed and can be pinned as A. */
  canPin: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onPin: () => void
  onRestore: () => void
  onClear: () => void
}

/**
 * A/B compare view: pin a real search as A, keep tweaking into B, and read the
 * difference as a bump chart plus overlap and RBO.
 */
export function PlaygroundCompare(props: PlaygroundCompareProps) {
  if (props.pinned === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compare</CardTitle>
          <CardDescription>
            Pin the last real search as config A, then tweak weights into B.
            Both rankings appear side by side with a bump chart connecting the
            same document across columns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            disabled={!props.canPin}
            onClick={props.onPin}
          >
            Pin current as A
          </Button>
          {!props.canPin
            ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Run a search first so there is something to pin.
              </p>
            )
            : null}
        </CardContent>
      </Card>
    )
  }

  return <PinnedCompare {...props} pinned={props.pinned} />
}

/** Compare body once a config has been pinned as A. */
function PinnedCompare({
  pinned,
  current,
  currentValues,
  metric,
  selectedId,
  onSelect,
  onPin,
  onRestore,
  onClear,
}: PlaygroundCompareProps & { pinned: PinnedRun }) {
  const a = useMemo(
    () =>
      [...pinned.rows]
        .sort((left, right) => left.distance - right.distance)
        .map((row) => ({ id: row.id, distance: row.distance })),
    [pinned.rows],
  )
  const compared = useMemo(
    () => compareRankings(a, current),
    [a, current],
  )
  const summary = useMemo(
    () => summariseComparison(a, current),
    [a, current],
  )
  const changes = useMemo(
    () => diffConfigs(pinned.values, currentValues),
    [pinned.values, currentValues],
  )
  const byRankA = useMemo(() => idByRank(a), [a])
  const byRankB = useMemo(() => idByRank(current), [current])
  const axisDepth = Math.max(a.length, current.length, 1)
  const series = useMemo(
    () => bumpSeries(compared, axisDepth),
    [compared, axisDepth],
  )
  const movementById = useMemo(
    () => new Map(compared.map((row) => [row.id, row.movement] as const)),
    [compared],
  )
  const chartConfig: ChartConfig = useMemo(
    () =>
      Object.fromEntries(
        series.ids.map((id) => [
          id,
          {
            label: id,
            color: MOVEMENT_STROKE[movementById.get(id) ?? "same"],
          },
        ]),
      ),
    [series.ids, movementById],
  )
  const ticks = useMemo(
    () => Array.from({ length: axisDepth }, (_, index) => index + 1),
    [axisDepth],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          A vs B
          {changes.map((change) => (
            <Badge key={changeKey(change)} variant="outline">
              {formatChange(change)}
            </Badge>
          ))}
        </CardTitle>
        <CardDescription>
          A is the pinned search. B is the ranking on the Ranking tab, including
          live local previews of weight changes. Distance is {metric}.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onPin}>
            Re-pin current as A
          </Button>
          <Button type="button" variant="outline" onClick={onRestore}>
            Restore A
          </Button>
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            label={`Overlap@${summary.depth}`}
            value={summary.fraction * 100}
            digits={1}
            suffix="%"
            detail={`${summary.shared} of ${summary.depth}`}
            help={`Share of the top ${summary.depth} documents that appear in both A and B. Depth is the smaller of the two list lengths.`}
          />
          <StatTile
            label={`RBO (p ${RBO_P})`}
            value={summary.rbo}
            digits={3}
            detail="Top-weighted agreement"
            help={`Rank-biased overlap. Higher ranks count more than lower ones, so a swap at rank 1 hurts more than one further down. The persistence parameter p (here ${RBO_P}) controls how quickly that weight falls off; at ${RBO_P}, roughly the top ${
              Math.round(1 / (1 - RBO_P))
            } ranks dominate the score. Identical prefixes score exactly 1.`}
          />
          <div className="grid gap-1 rounded-lg border p-3">
            <div className="flex min-w-0 items-center gap-1">
              <span className="text-xs text-muted-foreground">Movement</span>
              <StatHelp
                label="Movement"
                text="How many documents entered or left the compared top-k, and the largest rank change among documents present in both lists."
              />
            </div>
            <p className="font-mono text-sm">
              {summary.entered} entered, {summary.left} left
            </p>
            <p className="text-xs text-muted-foreground">
              Max shift <AnimatedNumber value={summary.maxShift} digits={0} />
            </p>
          </div>
        </div>

        <Separator />

        {series.ids.length > 0
          ? (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-96 w-full"
            >
              <LineChart
                accessibilityLayer
                data={series.data}
                margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
              >
                <XAxis
                  type="category"
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  type="number"
                  reversed
                  domain={[0.5, axisDepth + 0.5]}
                  ticks={ticks}
                  allowDataOverflow
                  width={96}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(rank) =>
                    truncateId(byRankA.get(Number(rank)) ?? "")}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  type="number"
                  reversed
                  domain={[0.5, axisDepth + 0.5]}
                  ticks={ticks}
                  allowDataOverflow
                  width={96}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(rank) =>
                    truncateId(byRankB.get(Number(rank)) ?? "")}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {series.ids.map((id) => (
                  <Line
                    key={id}
                    yAxisId="left"
                    type="linear"
                    dataKey={id}
                    name={id}
                    stroke={MOVEMENT_STROKE[movementById.get(id) ?? "same"]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
                {/* Anchor so the right axis always renders its ticks. */}
                <Line
                  yAxisId="right"
                  dataKey="__anchor"
                  stroke="none"
                  dot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )
          : (
            <p className="text-sm text-muted-foreground">
              No documents to compare yet.
            </p>
          )}

        <Separator />

        <LayoutGroup>
          <Table aria-label="Movement">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">A</TableHead>
                <TableHead className="w-12">B</TableHead>
                <TableHead className="w-24">Move</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Distance A</TableHead>
                <TableHead>Distance B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {compared.map((row) => (
                  <MotionTableRow
                    key={row.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={REORDER_TRANSITION}
                    className="cursor-pointer"
                    data-state={selectedId === row.id ? "selected" : undefined}
                    onClick={() => onSelect(row.id)}
                  >
                    <TableCell className="text-muted-foreground">
                      {row.rankA ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.rankB ?? "—"}
                    </TableCell>
                    <TableCell>
                      <MovementBadge row={row} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.distanceA === null
                        ? "—"
                        : <AnimatedNumber value={row.distanceA} />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.distanceB === null
                        ? "—"
                        : <AnimatedNumber value={row.distanceB} />}
                    </TableCell>
                  </MotionTableRow>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </LayoutGroup>
      </CardContent>
    </Card>
  )
}

/** One summary figure with an animated value. */
function StatTile({
  label,
  value,
  digits,
  suffix,
  detail,
  help,
}: {
  label: string
  value: number
  digits: number
  suffix?: string
  detail: string
  help: string
}) {
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <StatHelp label={label} text={help} />
      </div>
      <p className="font-mono text-lg">
        <AnimatedNumber value={value} digits={digits} />
        {suffix ?? ""}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

/**
 * Hover-only help for a compare metric. No navigation; focus shows the same
 * tip as hover so the explanation stays keyboard reachable.
 */
function StatHelp({ label, text }: { label: string; text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
                "text-muted-foreground",
              )}
              aria-label={`About ${label}`}
            />
          }
        >
          <CircleHelpIcon />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Rank movement badge for the movement table. */
function MovementBadge({ row }: { row: CompareRow }) {
  if (row.movement === "entered") {
    return <Badge variant="secondary">New</Badge>
  }
  if (row.movement === "left") {
    return <Badge variant="outline">Dropped</Badge>
  }
  if (row.delta === null || row.delta === 0) {
    return null
  }
  return (
    <Badge variant="secondary">
      {row.delta > 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
      {Math.abs(row.delta)}
    </Badge>
  )
}

/** Stable React key for a config change chip. */
function changeKey(change: ConfigChange): string {
  if (change.kind === "k") {
    return "k"
  }
  return `${change.kind}:${change.name}`
}

/** Short label for a config change chip. */
function formatChange(change: ConfigChange): string {
  switch (change.kind) {
    case "k":
      return `k ${change.from} to ${change.to}`
    case "weight":
      return `${change.name} weight ${change.from} to ${change.to}`
    case "enabled":
      return change.to ? `${change.name} on` : `${change.name} off`
    case "value":
      return `${change.name} value changed`
  }
}

/** Truncates a document id so axis ticks stay readable. */
function truncateId(id: string): string {
  if (id.length <= 12) {
    return id
  }
  return `${id.slice(0, 10)}…`
}
