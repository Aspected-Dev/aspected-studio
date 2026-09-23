import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { MetricHelp } from "@/components/metric-tile.tsx"
import type { AutoTuneSnapshot } from "@/hooks/use-auto-tune.ts"
import {
  classifyHoldoutGap,
  noiseLabel,
  TUNE_RESULT_HELP,
} from "@/lib/aspected/tune-objective.ts"
import type { TuneConfig, TuneTrial } from "@/lib/aspected/tuner.ts"

/** Props for {@link AutoTuneResults}. */
export type AutoTuneResultsProps = {
  snapshot: AutoTuneSnapshot
  onApply: (config: TuneConfig) => void
  onSave: (trial: TuneTrial) => void
  /** Opens Scorecard with champion weights loaded for a full-set Run set. */
  onVerify?: () => void
}

/**
 * Explains the Holdout tile. A run only scores the holdout in the confirm
 * stage, so an unmeasured split has to read differently from no split at all.
 */
export function holdoutHint(
  holdoutValue: number | null,
  championValue: number,
  holdoutCases: number,
): string {
  if (holdoutValue !== null) {
    const delta = holdoutValue - championValue
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} vs train champion`
  }
  if (holdoutCases === 0) {
    return "Holdout was off or the set was too small"
  }
  return `Run ended before the confirm stage scored the ${holdoutCases} held-out cases`
}

/**
 * Champion card: deltas, holdout, rationale, leaderboard, actions.
 */
export function AutoTuneResults({
  snapshot,
  onApply,
  onSave,
  onVerify,
}: AutoTuneResultsProps) {
  const {
    champion,
    baseline,
    holdoutObjective,
    rationale,
    leaderboard,
    caseDeltas,
    noiseFloor,
    stopped,
    exhausted,
    holdoutIds,
    seed,
  } = snapshot

  if (!champion || !baseline) {
    return null
  }

  const gain = champion.objective.value - baseline.objective.value
  const kind = noiseLabel(gain, noiseFloor)
  const holdoutGap = holdoutObjective
    ? classifyHoldoutGap(
      champion.objective.value,
      holdoutObjective.value,
      noiseFloor,
    )
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results</CardTitle>
        <CardDescription>
          {stopped
            ? "Stopped early. Best-so-far is still usable."
            : exhausted
            ? "Search budget exhausted. Best-so-far is below."
            : "Run complete."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Start objective"
            value={baseline.objective.value.toFixed(3)}
            help={TUNE_RESULT_HELP.startObjective}
          />
          <MetricTile
            label="Champion objective"
            value={champion.objective.value.toFixed(3)}
            help={TUNE_RESULT_HELP.championObjective}
            hint={`${gain >= 0 ? "+" : ""}${gain.toFixed(3)} · ${
              kind === "noise" ? "within" : "above"
            } noise ${noiseFloor.toFixed(3)}`}
          />
          <MetricTile
            label="Holdout"
            value={holdoutObjective ? holdoutObjective.value.toFixed(3) : "n/a"}
            help={TUNE_RESULT_HELP.holdout}
            hint={holdoutHint(
              holdoutObjective?.value ?? null,
              champion.objective.value,
              holdoutIds.length,
            )}
          />
        </div>

        {holdoutGap
          ? (
            <p className="text-sm text-muted-foreground">
              {holdoutGap.message}
            </p>
          )
          : null}

        {seed !== null && holdoutIds.length > 0
          ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Holdout seed:{" "}
                <span className="font-mono text-xs text-foreground">
                  {seed}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => {
                  void navigator.clipboard.writeText(String(seed))
                }}
              >
                Copy
              </Button>
            </p>
          )
          : null}

        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium">Why this config</p>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {rationale.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>

        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium">Weight changes</p>
          <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
            {weightLines(baseline.config, champion.config).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {weightLines(baseline.config, champion.config).length === 0
              ? <li>No weight changes versus start.</li>
              : null}
          </ul>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 items-center">
            <p className="text-sm font-medium">Per-case primary delta</p>
            <MetricHelp
              label="per-case primary delta"
              text={TUNE_RESULT_HELP.perCaseDelta}
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" aria-label="Per-case deltas">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 font-medium">Start</th>
                  <th className="px-3 py-2 font-medium">Champion</th>
                  <th className="px-3 py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {caseDeltas.map((row) => (
                  <tr key={row.caseId} className="border-b last:border-0">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.baseline.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.primary.toFixed(3)}
                      {row.forbidden ? " · forbidden" : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.delta >= 0 ? "+" : ""}
                      {row.delta.toFixed(3)}
                    </td>
                  </tr>
                ))}
                {caseDeltas.length === 0
                  ? (
                    <tr>
                      <td
                        className="px-3 py-2 text-muted-foreground"
                        colSpan={4}
                      >
                        No case deltas yet.
                      </td>
                    </tr>
                  )
                  : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium">Leaderboard</p>
          <ul className="grid gap-2">
            {leaderboard.map((trial, index) => (
              <li
                key={trial.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span>
                  #{index + 1} · trial {trial.id} · {trial.label} ·{" "}
                  {trial.objective.value.toFixed(3)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onApply(trial.config)}
                >
                  Apply
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          {onVerify
            ? (
              <Button type="button" onClick={onVerify}>
                Verify on Scorecard
              </Button>
            )
            : null}
          <Button
            type="button"
            variant={onVerify ? "secondary" : "default"}
            onClick={() => onApply(champion.config)}
          >
            Apply champion
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onSave(champion)}
          >
            Save tuned config
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricTile({
  label,
  value,
  hint,
  help,
}: {
  label: string
  value: string
  hint?: string
  help: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex min-w-0 items-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <MetricHelp label={label} text={help} />
      </div>
      <p className="mt-1 text-lg font-medium tabular-nums">{value}</p>
      {hint
        ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        : null}
    </div>
  )
}

function formatWeight(weight: number): string {
  return weight <= 0 ? "off" : String(weight)
}

function weightLines(start: TuneConfig, champion: TuneConfig): string[] {
  const names = new Set([
    ...Object.keys(start.weights),
    ...Object.keys(champion.weights),
  ])
  const lines: string[] = []
  for (const name of [...names].sort()) {
    const from = start.weights[name] ?? 1
    const to = champion.weights[name] ?? 1
    if (from === to) {
      continue
    }
    lines.push(`${name}: ${formatWeight(from)} → ${formatWeight(to)}`)
  }
  if (start.fetchK !== champion.fetchK) {
    lines.push(`fetchK: ${start.fetchK} → ${champion.fetchK}`)
  }
  return lines
}
