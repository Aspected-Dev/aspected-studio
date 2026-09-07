import { MetricHelp, MetricTile } from "@/components/metric-tile.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import type { GoldenSet, GoldenThresholds } from "@/lib/aspected/golden.ts"
import { caseK, goldenCaseDisplayName } from "@/lib/aspected/golden.ts"
import {
  type CaseGrade,
  CHIP_HELP,
  gradeCase,
  MAP_HELP,
  METRIC_HELP,
  metricLabel,
  type ScorecardSummary,
} from "@/lib/aspected/relevance.ts"
import type { ScoredCase } from "@/lib/aspected/scorecard.ts"
import { cn, countLabel } from "@/lib/utils.ts"

/** Chip colours per grade. */
const GRADE_CLASS: Record<CaseGrade, string> = {
  green: "border-pass/30 bg-pass/12 text-pass",
  amber: "border-warn/35 bg-warn/12 text-warn",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
}

/** Props for {@link ScorecardTiles}. */
export type ScorecardTilesProps = {
  summary: ScorecardSummary
  /** Cut-off shown in the metric labels. */
  k: number
  /** Earlier summary to show deltas against, e.g. the pinned config. */
  baseline?: ScorecardSummary | null
}

/**
 * The five summary figures for a scorecard run, each with its own help icon.
 *
 * Every figure is a macro mean over cases, so one hard case cannot be drowned
 * out by a dozen easy ones.
 */
export function ScorecardTiles({
  summary,
  k,
  baseline = null,
}: ScorecardTilesProps) {
  const cases = countLabel(summary.scored, "case")

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <MetricTile
        label={metricLabel("precision", k)}
        value={summary.precision}
        digits={3}
        detail={cases}
        help={METRIC_HELP.precision}
        delta={baseline ? summary.precision - baseline.precision : null}
      />
      <MetricTile
        label={metricLabel("recall", k)}
        value={summary.recall}
        digits={3}
        detail={cases}
        help={METRIC_HELP.recall}
        delta={baseline ? summary.recall - baseline.recall : null}
      />
      <MetricTile
        label={metricLabel("mrr", k)}
        value={summary.mrr}
        digits={3}
        detail="First relevant hit"
        help={METRIC_HELP.mrr}
        delta={baseline ? summary.mrr - baseline.mrr : null}
      />
      <MetricTile
        label={metricLabel("ndcg", k)}
        value={summary.ndcg}
        digits={3}
        detail="Order quality"
        help={METRIC_HELP.ndcg}
        delta={baseline ? summary.ndcg - baseline.ndcg : null}
      />
      <MetricTile
        label="MAP"
        value={summary.map}
        digits={3}
        detail="Hits early, not just present"
        help={MAP_HELP}
        delta={baseline ? summary.map - baseline.map : null}
      />
    </div>
  )
}

/** Props for {@link CaseChips}. */
export type CaseChipsProps = {
  scored: ScoredCase[]
  thresholds: GoldenThresholds
  selectedId: string | null
  onSelect: (caseId: string) => void
}

/**
 * One chip per case, coloured by grade.
 *
 * This is the fastest read on the page: a wall of green means the weights are
 * safe to keep, and a single red chip is a case to open.
 */
export function CaseChips({
  scored,
  thresholds,
  selectedId,
  onSelect,
}: CaseChipsProps) {
  if (scored.length === 0) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex items-center">
        <span className="text-xs text-muted-foreground">Cases</span>
        <MetricHelp label="case chips" text={CHIP_HELP} />
      </div>
      {scored.map((entry) => {
        const grade = entry.score === null
          ? null
          : gradeCase(entry.score, thresholds)
        return (
          <Badge
            key={entry.item.id}
            variant="outline"
            className={cn(
              "cursor-pointer",
              grade === null ? "text-muted-foreground" : GRADE_CLASS[grade],
              selectedId === entry.item.id ? "ring-2 ring-ring/50" : null,
            )}
            render={
              <button
                type="button"
                onClick={() => onSelect(entry.item.id)}
                aria-label={`${goldenCaseDisplayName(entry.item)}: ${
                  grade ?? (entry.error ?? "not run")
                }`}
              />
            }
          >
            {goldenCaseDisplayName(entry.item)}
          </Badge>
        )
      })}
    </div>
  )
}

/** Props for {@link CaseScoreTable}. */
export type CaseScoreTableProps = {
  set: GoldenSet
  scored: ScoredCase[]
  selectedId: string | null
  onSelect: (caseId: string) => void
}

/**
 * Per-case breakdown of every metric, so a failing chip can be explained.
 */
export function CaseScoreTable({
  set,
  scored,
  selectedId,
  onSelect,
}: CaseScoreTableProps) {
  return (
    <Table aria-label="Case scores">
      <TableHeader>
        <TableRow>
          <TableHead>Case</TableHead>
          <TableHead className="w-20">Grade</TableHead>
          <TableHead className="w-24">P@k</TableHead>
          <TableHead className="w-24">R@k</TableHead>
          <TableHead className="w-24">MRR</TableHead>
          <TableHead className="w-24">nDCG</TableHead>
          <TableHead className="w-20">Hits</TableHead>
          <TableHead className="w-20">First</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scored.map((entry) => {
          const grade = entry.score === null
            ? null
            : gradeCase(entry.score, set.thresholds)
          return (
            <TableRow
              key={entry.item.id}
              className="cursor-pointer"
              data-state={selectedId === entry.item.id ? "selected" : undefined}
              onClick={() => onSelect(entry.item.id)}
            >
              <TableCell className="font-medium">
                {goldenCaseDisplayName(entry.item)}
                {entry.item.enabled
                  ? null
                  : (
                    <span className="ml-2 text-xs text-muted-foreground">
                      off
                    </span>
                  )}
              </TableCell>
              <TableCell>
                {grade === null
                  ? (
                    <span className="text-xs text-muted-foreground">
                      {entry.error ?? "Not run"}
                    </span>
                  )
                  : (
                    <Badge variant="outline" className={GRADE_CLASS[grade]}>
                      {grade}
                    </Badge>
                  )}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatScore(entry.score?.precision)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatScore(entry.score?.recall)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatScore(entry.score?.mrr)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatScore(entry.score?.ndcg)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {entry.score === null
                  ? "-"
                  : `${entry.score.hits}/${entry.score.relevantTotal}`}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {entry.score?.firstRelevantRank ?? "-"}
              </TableCell>
            </TableRow>
          )
        })}
        {scored.length === 0
          ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                No cases yet. Add one to start measuring.
              </TableCell>
            </TableRow>
          )
          : null}
      </TableBody>
    </Table>
  )
}

/**
 * Cut-off used by the metric labels: the set default, or the shared per-case
 * value when every case overrides it the same way.
 */
export function displayK(set: GoldenSet): number {
  const values = new Set(set.cases.map((item) => caseK(set, item)))
  return values.size === 1 ? [...values][0] : set.k
}

function formatScore(value: number | undefined): string {
  return value === undefined ? "-" : value.toFixed(3)
}
