import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useParams } from "react-router"
import { MotionConfig } from "motion/react"
import { DownloadIcon, PlusIcon, UploadIcon } from "lucide-react"
import { GoldenCaseEditor } from "@/components/golden-case-editor.tsx"
import { CaseResults } from "@/components/golden-case-editor.tsx"
import {
  DocsField,
  DocsTextLink,
  PageDocsButton,
} from "@/components/docs-help.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import {
  assignFileToInput,
  JsonFileDropzone,
} from "@/components/json-file-dropzone.tsx"
import { RequestInspector } from "@/components/request-inspector.tsx"
import {
  CaseChips,
  CaseScoreTable,
  displayK,
  ScorecardTiles,
} from "@/components/scorecard-summary.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import { Slider } from "@/components/ui/slider.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { useScorecard } from "@/hooks/use-scorecard.ts"
import {
  caseK,
  duplicateGoldenSet,
  emptyGoldenCase,
  emptyGoldenSet,
  type GoldenCase,
  goldenCaseDisplayName,
  type GoldenMetricKey,
  type GoldenSet,
  goldenSetDisplayName,
  goldenSetFilename,
  goldenSetImportStub,
  goldenSetsForIndex,
  parseGoldenSet,
  removeGoldenSet,
  serializeGoldenSet,
  UNTITLED_GOLDEN_SET,
  upsertGoldenSet,
} from "@/lib/aspected/golden.ts"
import { METRIC_LABELS, summariseScorecard } from "@/lib/aspected/relevance.ts"
import { sameWeights, scoreSet } from "@/lib/aspected/scorecard.ts"
import {
  SLIDER_STEPS,
  sliderToWeight,
  weightToSlider,
} from "@/lib/aspected/playground.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import type { IndexDetail } from "@/lib/aspected/types.ts"
import { tunedConfigsForIndex } from "@/lib/aspected/tuned-config.ts"
import { TunedConfigLoader } from "@/components/tuned-config-loader.tsx"
import { DOCS_HASH } from "@/lib/docs.ts"
import { countLabel } from "@/lib/utils.ts"
import { toast } from "sonner"

/** Metrics offered as the chip threshold, in reading order. */
const METRIC_OPTIONS: GoldenMetricKey[] = [
  "ndcg",
  "precision",
  "recall",
  "mrr",
]

/**
 * Golden sets and scorecard for one index.
 *
 * A golden set turns weight tuning from taste into measurement: write down the
 * queries that matter and the documents they should return, then read
 * precision, recall, MRR, and nDCG across the whole set instead of eyeballing
 * one ranking at a time.
 *
 * Runs are cached with their explanations, so changing a weight re-grades the
 * set locally and reports a preview before the next real run confirms it.
 */
export function IndexScorecardPage() {
  const { name } = useParams()
  const { client } = useConnection()

  const [index, setIndex] = useState<IndexDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [sets, setSets] = useState<GoldenSet[]>([])
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  /** Remounts the file input so a prior drop does not keep showing a name. */
  const [importFileInputKey, setImportFileInputKey] = useState(0)
  const [pendingDeleteSet, setPendingDeleteSet] = useState<GoldenSet | null>(
    null,
  )
  const [pendingDeleteCase, setPendingDeleteCase] = useState<GoldenCase | null>(
    null,
  )
  const [nameDraft, setNameDraft] = useState<
    { id: string; value: string } | null
  >(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)

  const scorecard = useScorecard(name ?? "")

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
      setWeights(
        Object.fromEntries(
          response.data.schema.map((aspect) => [aspect.name, 1]),
        ),
      )
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
    const stored = goldenSetsForIndex(name)
    setSets(stored)
    setActiveSetId(stored[0]?.id ?? null)
  }, [name])

  const activeSet = sets.find((item) => item.id === activeSetId) ?? null
  const schema = index?.schema ?? []

  // The field is only a draft while it has focus on the set it was typed for.
  // Keying it by id means switching sets shows the stored name again without
  // an effect that could clobber what is being typed.
  const nameValue = nameDraft !== null && nameDraft.id === activeSetId
    ? nameDraft.value
    : activeSet?.name ?? ""

  const metric = index?.distanceType ?? "Cosine"

  const persist = useCallback((next: GoldenSet) => {
    const saved = upsertGoldenSet(next)
    setSets((previous) =>
      previous.some((item) => item.id === saved.id)
        ? previous.map((item) => item.id === saved.id ? saved : item)
        : [...previous, saved]
    )
    return saved
  }, [])

  /**
   * Selects a set and puts the cursor in the name field.
   *
   * Sets are created unnamed, so naming is the obvious next action. Focusing
   * the field is also the only feedback that says which set is now open.
   */
  const openSetForNaming = (set: GoldenSet) => {
    setActiveSetId(set.id)
    setSelectedCaseId(set.cases[0]?.id ?? null)
    scorecard.clear()
    requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    })
  }

  const createSet = () => {
    if (!name) {
      return
    }
    openSetForNaming(persist(emptyGoldenSet(name, schema)))
    toast.success("Golden set created", {
      description: "Name it, then add the searches that matter.",
    })
  }

  const duplicateSet = () => {
    if (!activeSet) {
      return
    }
    const copy = persist(duplicateGoldenSet(activeSet))
    openSetForNaming(copy)
    toast.success(`Duplicated ${goldenSetDisplayName(activeSet)}`, {
      description: `${
        countLabel(copy.cases.length, "case")
      } copied. Runs start fresh.`,
    })
  }

  /**
   * Writes the name field back to storage.
   *
   * Renames land on blur or Enter rather than on every keystroke, so a
   * half-typed name never becomes the stored one and typing stays smooth.
   */
  const commitName = () => {
    setNameDraft(null)
    if (!activeSet || nameValue === activeSet.name) {
      return
    }
    persist({ ...activeSet, name: nameValue })
  }

  const updateCase = (next: GoldenCase) => {
    if (!activeSet) {
      return
    }
    persist({
      ...activeSet,
      cases: activeSet.cases.map((item) => item.id === next.id ? next : item),
    })
  }

  const addCase = () => {
    if (!activeSet) {
      return
    }
    const created = emptyGoldenCase(
      schema,
      `Case ${activeSet.cases.length + 1}`,
    )
    persist({ ...activeSet, cases: [...activeSet.cases, created] })
    setSelectedCaseId(created.id)
  }

  const confirmDeleteCase = () => {
    if (!activeSet || !pendingDeleteCase) {
      return
    }
    persist({
      ...activeSet,
      cases: activeSet.cases.filter((item) => item.id !== pendingDeleteCase.id),
    })
    setSelectedCaseId(null)
    setPendingDeleteCase(null)
    toast.success(`Deleted ${goldenCaseDisplayName(pendingDeleteCase)}`)
  }

  const confirmDeleteSet = () => {
    if (!pendingDeleteSet || !name) {
      return
    }
    const removed = pendingDeleteSet
    removeGoldenSet(removed.id)
    const remaining = goldenSetsForIndex(name)
    setSets(remaining)
    setActiveSetId(remaining[0]?.id ?? null)
    setSelectedCaseId(null)
    setPendingDeleteSet(null)
    scorecard.clear()
    toast.success(`Deleted ${goldenSetDisplayName(removed)}`)
  }

  const exportSet = () => {
    if (!activeSet) {
      return
    }
    const blob = new Blob([serializeGoldenSet(activeSet)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = goldenSetFilename(activeSet)
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success("Golden set exported")
  }

  const importSet = () => {
    if (!name) {
      return
    }
    const parsed = parseGoldenSet(importText, name)
    if (!parsed.ok) {
      toast.error("Could not import golden set", {
        description: parsed.error,
      })
      return
    }
    const saved = persist(parsed.set)
    setActiveSetId(saved.id)
    setSelectedCaseId(saved.cases[0]?.id ?? null)
    setImportOpen(false)
    setImportText("")
    scorecard.clear()
    toast.success(`Imported ${goldenSetDisplayName(saved)}`, {
      description: `${countLabel(saved.cases.length, "case")} ready to run.`,
    })
  }

  const importFile = async (file: File) => {
    assignFileToInput(importFileInputRef.current, file)
    setImportText(await file.text())
  }

  /**
   * Opens the import sheet with a filled stub so the export shape is visible
   * before a file is chosen.
   *
   * Seeding happens here rather than in Sheet `onOpenChange`: controlled opens
   * via `setImportOpen(true)` do not call that callback.
   */
  const openImport = () => {
    if (name) {
      setImportText(goldenSetImportStub(name, schema))
    }
    setImportFileInputKey((key) => key + 1)
    setImportOpen(true)
  }

  const previewing = scorecard.ranWeights !== null &&
    !sameWeights(scorecard.ranWeights, weights)

  const scored = useMemo(
    () =>
      activeSet
        ? scoreSet(
          activeSet,
          scorecard.runs,
          previewing ? { metric, weights, schema } : {},
        )
        : [],
    [activeSet, scorecard.runs, previewing, metric, weights, schema],
  )

  const graded = scored.filter((entry) => entry.score !== null)
  const summary = useMemo(
    () =>
      summariseScorecard(
        graded.map((entry) => entry.score!),
        activeSet?.thresholds ?? { metric: "ndcg", green: 0.8, amber: 0.5 },
      ),
    [graded, activeSet?.thresholds],
  )

  const selected = scored.find((entry) => entry.item.id === selectedCaseId) ??
    null
  const selectedRun = selectedCaseId
    ? scorecard.runs.get(selectedCaseId) ?? null
    : null
  const inspected = selectedRun && name
    ? client.describeRequest(
      `/indexes/${encodeURIComponent(name)}/search`,
      { method: "POST", body: selectedRun.request },
    )
    : null

  if (loadFailed) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load this index.
      </p>
    )
  }

  if (index === null) {
    return <p className="text-sm text-muted-foreground">Loading schema…</p>
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-w-0 gap-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Write down the searches that matter and the documents they should
            return, then measure a weight change instead of guessing. Grades
            come from the same{" "}
            <DocsTextLink
              page="resolvers"
              hash={DOCS_HASH.inspectingResolvers}
            >
              per-aspect explanations
            </DocsTextLink>{" "}
            the Playground uses.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <PageDocsButton
              page="resolvers"
              hash={DOCS_HASH.inspectingResolvers}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[22rem_1fr] xl:items-start">
          <Card>
            <CardHeader>
              <CardTitle>Golden set</CardTitle>
              <CardDescription>
                Stored in this browser. Export the JSON to keep it in your repo.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
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
                  <SelectTrigger className="w-full" aria-label="Golden set">
                    <SelectValue
                      placeholder={sets.length === 0
                        ? "No sets yet"
                        : "Choose a set"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {goldenSetDisplayName(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={createSet}>
                    <PlusIcon />
                    New
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={activeSet === null}
                    onClick={duplicateSet}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    disabled={activeSet === null}
                    onClick={() => setPendingDeleteSet(activeSet)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {activeSet
                ? (
                  <>
                    <Separator />

                    <DocsField
                      label="Set name"
                      htmlFor="golden-set-name"
                      blurb={null}
                    >
                      <Input
                        id="golden-set-name"
                        ref={nameInputRef}
                        placeholder={UNTITLED_GOLDEN_SET}
                        value={nameValue}
                        onChange={(event) =>
                          setNameDraft({
                            id: activeSet.id,
                            value: event.target.value,
                          })}
                        onBlur={commitName}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            commitName()
                          }
                        }}
                      />
                    </DocsField>

                    <div className="grid grid-cols-2 gap-3">
                      <DocsField
                        label="Default k"
                        htmlFor="golden-set-k"
                        page="tutorial"
                        hash={DOCS_HASH.tutorialSearch}
                        blurb="Cut-off every case is graded at unless it overrides it."
                        mono
                      >
                        <Input
                          id="golden-set-k"
                          type="number"
                          min={1}
                          value={activeSet.k}
                          onChange={(event) => {
                            const parsed = Number(event.target.value)
                            persist({
                              ...activeSet,
                              k: Number.isFinite(parsed) && parsed >= 1
                                ? Math.floor(parsed)
                                : 1,
                            })
                          }}
                        />
                      </DocsField>

                      <div className="grid gap-1.5">
                        <span className="text-sm">Primary metric</span>
                        <Select
                          value={activeSet.thresholds.metric}
                          items={Object.fromEntries(
                            METRIC_OPTIONS.map((option) => [
                              option,
                              METRIC_LABELS[option],
                            ]),
                          )}
                          onValueChange={(next) => {
                            if (typeof next === "string") {
                              persist({
                                ...activeSet,
                                thresholds: {
                                  ...activeSet.thresholds,
                                  metric: next as GoldenMetricKey,
                                },
                              })
                            }
                          }}
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label="Primary metric"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {METRIC_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {METRIC_LABELS[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <span className="text-sm">Green at</span>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={activeSet.thresholds.green}
                          onChange={(event) =>
                            persist({
                              ...activeSet,
                              thresholds: {
                                ...activeSet.thresholds,
                                green: clampRatio(event.target.value, 0.8),
                              },
                            })}
                          aria-label="Green threshold"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <span className="text-sm">Amber at</span>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={activeSet.thresholds.amber}
                          onChange={(event) =>
                            persist({
                              ...activeSet,
                              thresholds: {
                                ...activeSet.thresholds,
                                amber: clampRatio(event.target.value, 0.5),
                              },
                            })}
                          aria-label="Amber threshold"
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          Weights under test
                        </span>
                        <TunedConfigLoader
                          configs={tunedConfigsForIndex(name ?? "")}
                          onLoad={(config) =>
                            setWeights((previous) => ({
                              ...previous,
                              ...config.weights,
                            }))}
                        />
                      </div>
                      {schema.map((aspect) => (
                        <div key={aspect.name} className="grid gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground">
                            {aspect.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <Slider
                              className="flex-1"
                              min={0}
                              max={SLIDER_STEPS}
                              step={1}
                              value={[
                                weightToSlider(weights[aspect.name] ?? 1),
                              ]}
                              onValueChange={(next) =>
                                setWeights((previous) => ({
                                  ...previous,
                                  [aspect.name]: sliderToWeight(
                                    Array.isArray(next) ? next[0] : next,
                                  ),
                                }))}
                              aria-label={`Weight slider for ${aspect.name}`}
                            />
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              className="w-20"
                              value={weights[aspect.name] ?? 1}
                              onChange={(event) => {
                                const parsed = Number(event.target.value)
                                setWeights((previous) => ({
                                  ...previous,
                                  [aspect.name]: Number.isFinite(parsed)
                                    ? parsed
                                    : 0,
                                }))
                              }}
                              aria-label={`Weight for ${aspect.name}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <Button
                      type="button"
                      disabled={scorecard.running ||
                        activeSet.cases.length === 0}
                      onClick={() => void scorecard.run(activeSet, weights)}
                    >
                      {scorecard.running
                        ? `Running ${scorecard.progress.done}/${scorecard.progress.total}…`
                        : "Run set"}
                    </Button>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openImport}
                      >
                        <UploadIcon />
                        Import
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={exportSet}
                      >
                        <DownloadIcon />
                        Export
                      </Button>
                    </div>
                  </>
                )
                : (
                  <div className="grid gap-3">
                    <p className="text-sm text-muted-foreground">
                      No golden set for this index yet.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openImport}
                    >
                      <UploadIcon />
                      Import one
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle>Scorecard</CardTitle>
                  <CardDescription>
                    {activeSet === null
                      ? "Create or import a set to start measuring."
                      : scorecard.ranAt === null
                      ? "Not run yet."
                      : `${graded.length} of ${
                        countLabel(activeSet.cases.length, "case")
                      } graded.`}
                  </CardDescription>
                </div>
                {scorecard.ranAt === null
                  ? null
                  : (
                    <Badge variant={previewing ? "outline" : "secondary"}>
                      {previewing ? "Preview" : "Live"}
                    </Badge>
                  )}
              </CardHeader>
              <CardContent className="grid min-w-0 gap-6">
                <ScorecardTiles
                  summary={summary}
                  k={activeSet ? displayK(activeSet) : 0}
                />

                {previewing
                  ? (
                    <p className="text-sm text-muted-foreground">
                      Weights changed since the last run, so these grades are
                      re-scored locally from the rows already fetched. Run the
                      set again to let the server confirm them.
                    </p>
                  )
                  : null}

                <CaseChips
                  scored={scored}
                  thresholds={activeSet?.thresholds ??
                    { metric: "ndcg", green: 0.8, amber: 0.5 }}
                  selectedId={selectedCaseId}
                  onSelect={setSelectedCaseId}
                />

                {activeSet
                  ? (
                    <CaseScoreTable
                      set={activeSet}
                      scored={scored}
                      selectedId={selectedCaseId}
                      onSelect={setSelectedCaseId}
                    />
                  )
                  : null}
              </CardContent>
            </Card>

            {activeSet
              ? (
                <Card>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <CardTitle>Cases</CardTitle>
                      <CardDescription>
                        {selected
                          ? `Editing ${goldenCaseDisplayName(selected.item)}.`
                          : "Pick a case to edit it, or add a new one."}
                      </CardDescription>
                    </div>
                    <Button type="button" variant="outline" onClick={addCase}>
                      <PlusIcon />
                      Add case
                    </Button>
                  </CardHeader>
                  <CardContent className="grid min-w-0 gap-6">
                    {selected
                      ? (
                        <>
                          <GoldenCaseEditor
                            item={selected.item}
                            schema={schema}
                            setK={caseK(activeSet, selected.item)}
                            onChange={updateCase}
                            onDelete={() => setPendingDeleteCase(selected.item)}
                          />
                          <Separator />
                          <CaseResults
                            item={selected.item}
                            score={selected.score}
                            ranked={selected.ranked}
                            onChange={updateCase}
                          />
                        </>
                      )
                      : (
                        <p className="text-sm text-muted-foreground">
                          Nothing selected.
                        </p>
                      )}
                  </CardContent>
                </Card>
              )
              : null}

            <RequestInspector request={inspected} density="compact" />
          </div>
        </div>
      </div>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className="flex h-full min-h-0 w-full flex-col sm:max-w-xl">
          <JsonFileDropzone
            label="Drop JSON file to import"
            onFile={(file) => {
              void importFile(file)
            }}
            onReject={() => {
              toast.error("Could not import golden set", {
                description: "Drop a .json file, or paste JSON below.",
              })
            }}
            header={
              <SheetHeader className="shrink-0">
                <SheetTitle>Import a golden set</SheetTitle>
                <SheetDescription>
                  Paste an exported set, or choose or drop a JSON file. Ids are
                  regenerated so the same file can live in a repo and in several
                  browsers.
                </SheetDescription>
              </SheetHeader>
            }
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <Input
                key={importFileInputKey}
                ref={importFileInputRef}
                type="file"
                accept="application/json,.json"
                className="shrink-0"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void importFile(file)
                  }
                }}
                aria-label="Golden set file"
              />
              <JsonEditor
                value={importText}
                onChange={setImportText}
                fitContent={false}
                height="100%"
                className="min-h-0 flex-1"
              />
            </div>
            <SheetFooter className="mt-0 shrink-0 p-0">
              <Button
                type="button"
                disabled={importText.trim() === ""}
                onClick={importSet}
              >
                Import
              </Button>
            </SheetFooter>
          </JsonFileDropzone>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingDeleteSet !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteSet(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete golden set</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <DeleteTarget>
                {pendingDeleteSet ? goldenSetDisplayName(pendingDeleteSet) : ""}
              </DeleteTarget>{" "}
              and its {countLabel(pendingDeleteSet?.cases.length ?? 0, "case")}
              {" "}
              from this browser. Export first to keep a copy. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteSet}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteCase !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteCase(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <DeleteTarget>
                {pendingDeleteCase
                  ? goldenCaseDisplayName(pendingDeleteCase)
                  : ""}
              </DeleteTarget>{" "}
              and its expected documents from this golden set. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteCase}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MotionConfig>
  )
}

/**
 * The name of the thing a confirm dialog is about to delete.
 *
 * A free-text name inside muted dialog copy is easy to skim past, so it is
 * lifted to the body colour and weight to read as the subject of the sentence.
 */
function DeleteTarget({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** Clamps a threshold input into `0..1`, falling back on unusable input. */
function clampRatio(raw: string, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, 0), 1)
}
