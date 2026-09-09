import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { PageDocsButton } from "@/components/docs-help.tsx"
import { AutoTuneHistory } from "@/components/auto-tune-history.tsx"
import { AutoTuneProgressPanel } from "@/components/auto-tune-progress.tsx"
import { AutoTuneResults } from "@/components/auto-tune-results.tsx"
import {
  AutoTuneSetup,
  type AutoTuneSetupValues,
} from "@/components/auto-tune-setup.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { useAutoTune } from "@/hooks/use-auto-tune.ts"
import {
  type GoldenSet,
  goldenSetDisplayName,
  goldenSetsForIndex,
} from "@/lib/aspected/golden.ts"
import { runnableCases } from "@/lib/aspected/scorecard.ts"
import {
  newTunedConfigId,
  removeTunedConfig,
  TUNED_CONFIG_VERSION,
  type TunedConfig,
  tunedConfigsForIndex,
  upsertTunedConfig,
} from "@/lib/aspected/tuned-config.ts"
import {
  BUDGET_PRESETS,
  defaultTuneSpace,
  type TuneConfig,
  type TuneTrial,
} from "@/lib/aspected/tuner.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import type { IndexDetail } from "@/lib/aspected/types.ts"
import { indexPath } from "@/lib/app-nav.ts"
import { DOCS_HASH } from "@/lib/docs.ts"
import { toast } from "sonner"

/**
 * Budgeted Live auto-tune for an index golden set.
 */
export function IndexAutoTunePage() {
  const { name } = useParams()
  const { client } = useConnection()
  const [index, setIndex] = useState<IndexDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sets, setSets] = useState<GoldenSet[]>([])
  const [saved, setSaved] = useState<TunedConfig[]>([])
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null)
  const tuner = useAutoTune(name ?? "")
  const autoSavedRef = useRef<number | null>(null)

  const [setup, setSetup] = useState<AutoTuneSetupValues>({
    setId: "",
    space: { aspects: [], tuneDepth: true },
    budgetPreset: "standard",
    customBudget: 1000,
    concurrency: 4,
    useHoldout: true,
    tuneDepth: true,
    wallClockMinutes: null,
  })

  useEffect(() => {
    if (!name) {
      return
    }
    let cancelled = false
    client.getIndex(name).then((response) => {
      if (cancelled) {
        return
      }
      setIndex(response.data)
    }).catch((caught) => {
      if (cancelled) {
        return
      }
      setLoadFailed(true)
      toastCaughtError(caught, "Could not load index")
    })
    return () => {
      cancelled = true
    }
  }, [client, name])

  useEffect(() => {
    if (!name) {
      return
    }
    const reload = () => {
      const stored = goldenSetsForIndex(name)
      setSets(stored)
      setSaved(tunedConfigsForIndex(name))
      setSetup((current) => {
        const setId = current.setId &&
            stored.some((item) => item.id === current.setId)
          ? current.setId
          : stored[0]?.id ?? ""
        const active = stored.find((item) => item.id === setId)
        const weights = Object.fromEntries(
          (index?.schema ?? []).map((aspect) => [aspect.name, 1]),
        )
        const space = active
          ? {
            ...defaultTuneSpace(active, weights),
            tuneDepth: current.tuneDepth,
          }
          : { aspects: [], tuneDepth: current.tuneDepth }
        return { ...current, setId, space }
      })
    }
    reload()
    window.addEventListener("focus", reload)
    return () => {
      window.removeEventListener("focus", reload)
    }
  }, [name, index])

  const activeSet = sets.find((item) => item.id === setup.setId) ?? null

  useEffect(() => {
    if (
      tuner.running ||
      !tuner.champion ||
      !activeSet ||
      !name ||
      autoSavedRef.current === tuner.champion.id
    ) {
      return
    }
    autoSavedRef.current = tuner.champion.id
    saveChampion({
      trial: tuner.champion,
      snapshot: tuner,
      set: activeSet,
      indexName: name,
    })
    setSaved(tunedConfigsForIndex(name))
    toast.success("Champion auto-saved")
  }, [tuner.running, tuner.champion, activeSet, name, tuner])

  const startWeights = useMemo(() => {
    return Object.fromEntries(
      (index?.schema ?? []).map((aspect) => [aspect.name, 1]),
    )
  }, [index])

  const runnableCount = activeSet
    ? runnableCases(activeSet, startWeights).length
    : 0

  if (loadFailed) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load this index.
      </p>
    )
  }

  if (index === null || !name) {
    return <p className="text-sm text-muted-foreground">Loading schema…</p>
  }

  const startConfig: TuneConfig = {
    weights: startWeights,
    fetchK: activeSet?.k ?? 20,
  }

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Auto-tune</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Search aspect weights, on/off, and retrieval depth with real server
            searches on a golden set. Apply the champion here as a saved config,
            then load it from Playground or Scorecard.
          </p>
        </div>
        <PageDocsButton
          page="resolvers"
          hash={DOCS_HASH.inspectingResolvers}
          label="Docs"
          blurb="Auto-tune runs many Live searches. Point it at a non-serving connection when you can."
        />
      </div>

      {sets.length === 0
        ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              No golden set for this index yet. Create or import one on the
              Scorecard page first.
            </p>
            <Button
              className="mt-3"
              variant="outline"
              render={<Link to={indexPath(name, "scorecard")} />}
            >
              Open Scorecard
            </Button>
          </div>
        )
        : (
          <AutoTuneSetup
            sets={sets}
            values={setup}
            onChange={setSetup}
            runnableCaseCount={runnableCount}
            disabled={tuner.running}
            onStart={() => {
              if (!activeSet) {
                return
              }
              setAppliedNotice(null)
              autoSavedRef.current = null
              void tuner.start({
                set: activeSet,
                start: startConfig,
                space: {
                  ...setup.space,
                  tuneDepth: setup.tuneDepth,
                },
                maxSearches: setup.budgetPreset === "custom"
                  ? setup.customBudget
                  : BUDGET_PRESETS[setup.budgetPreset],
                concurrency: setup.concurrency,
                useHoldout: setup.useHoldout,
                wallClockMs: setup.wallClockMinutes === null
                  ? null
                  : setup.wallClockMinutes * 60_000,
              })
            }}
          />
        )}

      {tuner.trials.length > 0 || tuner.running
        ? (
          <AutoTuneProgressPanel
            snapshot={tuner}
            onStop={tuner.stop}
          />
        )
        : null}

      {!tuner.running && tuner.champion
        ? (
          <AutoTuneResults
            snapshot={tuner}
            onApply={(config) => {
              setAppliedNotice(
                `Champion ready: ${
                  Object.entries(config.weights)
                    .filter(([, weight]) => weight !== 1)
                    .map(([aspect, weight]) => `${aspect}=${weight}`)
                    .join(", ") || "all weights 1"
                }. Save it, then load from Playground or Scorecard.`,
              )
              toast.success("Champion noted. Save it to reuse later.")
            }}
            onSave={(trial) => {
              if (!activeSet || !name) {
                return
              }
              saveChampion({
                trial,
                snapshot: tuner,
                set: activeSet,
                indexName: name,
              })
              setSaved(tunedConfigsForIndex(name))
              toast.success("Tuned config saved")
            }}
          />
        )
        : null}

      {appliedNotice
        ? <p className="text-sm text-muted-foreground">{appliedNotice}</p>
        : null}

      <AutoTuneHistory
        configs={saved}
        onApply={(config) => {
          setAppliedNotice(
            `Loaded “${config.name}”. Open Playground or Scorecard and use Load tuned config.`,
          )
          toast.success(`“${config.name}” is available to load`)
        }}
        onDelete={(id) => {
          removeTunedConfig(id)
          if (name) {
            setSaved(tunedConfigsForIndex(name))
          }
        }}
      />
    </div>
  )
}

function saveChampion(options: {
  trial: TuneTrial
  snapshot: ReturnType<typeof useAutoTune>
  set: GoldenSet
  indexName: string
}) {
  const { trial, snapshot, set, indexName } = options
  const config: TunedConfig = {
    version: TUNED_CONFIG_VERSION,
    id: newTunedConfigId(),
    name: `${goldenSetDisplayName(set)} · ${new Date().toLocaleString()}`,
    indexName,
    goldenSetId: set.id,
    goldenSetName: goldenSetDisplayName(set),
    weights: trial.config.weights,
    fetchK: trial.config.fetchK,
    primaryMetric: set.thresholds.metric,
    trainPrimary: trial.objective.primary,
    holdoutPrimary: snapshot.holdoutObjective?.primary ?? null,
    objectiveValue: trial.objective.value,
    noiseFloor: snapshot.noiseFloor,
    rationale: snapshot.rationale,
    createdAt: Date.now(),
  }
  upsertTunedConfig(config)
}
