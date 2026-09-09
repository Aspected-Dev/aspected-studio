import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { AutoTuneSnapshot } from "@/hooks/use-auto-tune.ts"
import { noiseLabel } from "@/lib/aspected/tune-objective.ts"
import type { TuneStage } from "@/lib/aspected/tuner.ts"

const STAGES: TuneStage[] = [
  "baseline",
  "screen",
  "coarse",
  "refine",
  "depth",
  "confirm",
  "done",
]

/** Props for {@link AutoTuneProgress}. */
export type AutoTuneProgressProps = {
  snapshot: AutoTuneSnapshot
  onStop: () => void
}

/**
 * Live progress: stage stepper, counters, best-so-far, trial feed.
 */
export function AutoTuneProgressPanel({
  snapshot,
  onStop,
}: AutoTuneProgressProps) {
  const { progress, champion, baseline, noiseFloor, trials, running } = snapshot
  const gain = champion && baseline
    ? champion.objective.value - baseline.objective.value
    : null
  const gainKind = gain === null ? null : noiseLabel(gain, noiseFloor)
  const etaMs = progress.meanSearchMs !== null &&
      progress.searchesUsed < progress.maxSearches
    ? progress.meanSearchMs *
      (progress.maxSearches - progress.searchesUsed)
    : null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {running
              ? "Searching Live. Cache hits do not count against the budget."
              : "Run finished or stopped."}
          </CardDescription>
        </div>
        {running
          ? (
            <Button type="button" variant="outline" onClick={onStop}>
              Stop
            </Button>
          )
          : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <ol className="flex flex-wrap gap-2">
          {STAGES.filter((stage) => stage !== "done").map((stage) => {
            const active = progress.stage === stage
            const done = stageIndex(progress.stage) > stageIndex(stage)
            return (
              <li key={stage}>
                <Badge
                  variant={active ? "default" : done ? "secondary" : "outline"}
                >
                  {stage}
                </Badge>
              </li>
            )
          })}
        </ol>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Searches"
            value={`${progress.searchesUsed} / ${progress.maxSearches}`}
          />
          <Stat
            label="Trials"
            value={String(progress.trialsDone)}
          />
          <Stat
            label="Cache"
            value={`${progress.cacheHits} hit · ${progress.cacheMisses} miss`}
          />
          <Stat
            label="Elapsed"
            value={formatDuration(progress.elapsedMs)}
            hint={etaMs !== null
              ? `ETA ~${formatDuration(etaMs)} at current pace`
              : undefined}
          />
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Best so far</p>
          {champion && baseline
            ? (
              <p className="mt-1 text-sm">
                Objective {baseline.objective.value.toFixed(3)} →{" "}
                {champion.objective.value.toFixed(3)}{" "}
                <span className="text-muted-foreground">
                  ({gain! >= 0 ? "+" : ""}
                  {gain!.toFixed(3)}
                  {gainKind === "noise"
                    ? `, within noise floor ${noiseFloor.toFixed(3)}`
                    : `, above noise floor ${noiseFloor.toFixed(3)}`}
                  )
                </span>
              </p>
            )
            : (
              <p className="mt-1 text-sm text-muted-foreground">
                Waiting for the baseline trial…
              </p>
            )}
        </div>

        <div className="grid min-w-0 gap-2">
          <p className="text-sm font-medium">Trial feed</p>
          <ul className="max-h-64 overflow-y-auto rounded-lg border font-mono text-xs">
            {[...trials].reverse().slice(0, 40).map((trial) => (
              <li
                key={trial.id}
                className="border-b px-3 py-1.5 last:border-0"
              >
                #{trial.id} · {trial.stage} · {trial.label} · objective{" "}
                {trial.objective.value.toFixed(3)} · {trial.searches} search
                {trial.searches === 1 ? "" : "es"}
              </li>
            ))}
            {trials.length === 0
              ? (
                <li className="px-3 py-2 text-muted-foreground">
                  No trials yet.
                </li>
              )
              : null}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function stageIndex(stage: TuneStage): number {
  return STAGES.indexOf(stage)
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
      {hint
        ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        : null}
    </div>
  )
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m ${rem}s`
}
