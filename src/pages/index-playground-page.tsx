import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type Control,
  Controller,
  type Resolver,
  useFieldArray,
  useForm,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useParams } from "react-router"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
} from "motion/react"
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { AnimatedNumber } from "@/components/animated-number.tsx"
import { AspectQueryRow } from "@/components/aspect-query-row.tsx"
import { AspectWeightSlider } from "@/components/aspect-weight-slider.tsx"
import {
  DocsField,
  DocsHelpIcon,
  DocsTextLink,
  PageDocsButton,
} from "@/components/docs-help.tsx"
import { MotionTableRow } from "@/components/motion-table-row.tsx"
import { PlaygroundCompare } from "@/components/playground-compare.tsx"
import { PlaygroundScorecard } from "@/components/playground-scorecard.tsx"
import { JsonInspectSheet } from "@/components/json-inspect-sheet.tsx"
import { JsonPreviewCell } from "@/components/json-preview-cell.tsx"
import { RequestInspector } from "@/components/request-inspector.tsx"
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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { type RecordedRequest } from "@/lib/aspected/client.ts"
import {
  activeAspects,
  aspectRowsFromSchema,
  buildPlaygroundRequest,
  coerceAspectValue,
  formWeights,
  playgroundFormSchema,
  type PlaygroundFormValues,
  scoringWeights,
} from "@/lib/aspected/playground.ts"
import type { PinnedRun } from "@/lib/aspected/compare.ts"
import {
  hasCompleteGrades,
  multipliersFromSchema,
  previewDeviation,
  rerank,
} from "@/lib/aspected/scoring.ts"
import { toastCaughtError } from "@/lib/aspected/user-error.ts"
import type {
  IndexDetail,
  SearchIndexRequest,
  SearchResultRow,
  StoredAspect,
} from "@/lib/aspected/types.ts"
import { DOCS_HASH } from "@/lib/docs.ts"
import { countLabel } from "@/lib/utils.ts"

/** Reorder feel: springy enough that fast slider drags interrupt cleanly. */
const REORDER_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 34,
}

/**
 * Chart palette from the theme tokens in `index.css`.
 *
 * Those tokens are a single-hue lightness ramp, so neighbouring indexes look
 * almost identical when stacked. Taking every other step first spreads adjacent
 * aspects as far apart in lightness as the five-colour theme allows.
 */
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-2)",
  "var(--chart-4)",
]

/** Results shown in the contribution chart before it gets unreadable. */
const CHART_ROWS = 10

/**
 * Below this, stacked distances are float noise (or a perfect match) and the
 * chart only confuses. Hide the bars rather than drawing a micro-axis.
 */
const CHART_DISTANCE_EPSILON = 1e-6

/**
 * Identity of the query itself, ignoring weights.
 *
 * Weight changes can be previewed locally, but a different query means
 * different embeddings and the recovered grades no longer apply.
 *
 * @returns `null` when a value cannot be coerced for its resolver.
 */
function querySignature(values: PlaygroundFormValues): string | null {
  try {
    const entries = activeAspects(values).map(
      (aspect) =>
        [aspect.name, coerceAspectValue(aspect.type, aspect.value)] as const,
    )
    return JSON.stringify({
      k: Number(values.k),
      query: Object.fromEntries(entries),
    })
  } catch {
    return null
  }
}

/** Full request identity, used to tell a live result from a preview. */
function requestSignature(values: PlaygroundFormValues): string | null {
  try {
    return JSON.stringify(buildPlaygroundRequest(values))
  } catch {
    return null
  }
}

/** One aspect's query value and weight controls. */
function AspectControl({
  control,
  index,
  aspect,
  error,
}: {
  control: Control<PlaygroundFormValues>
  index: number
  aspect: StoredAspect
  error?: string
}) {
  const valueId = `playground-value-${index}`
  const weightId = `playground-weight-${index}`

  return (
    <Controller
      control={control}
      name={`aspects.${index}.value`}
      render={({ field: valueField }) => (
        <Controller
          control={control}
          name={`aspects.${index}.weight`}
          render={({ field: weightField }) => (
            <AspectQueryRow
              aspect={aspect}
              id={valueId}
              value={valueField.value}
              onChange={valueField.onChange}
              error={error}
              weight={weightField.value}
              onWeightChange={weightField.onChange}
              weightControl={
                <AspectWeightSlider
                  aspectName={aspect.name}
                  id={weightId}
                  value={weightField.value}
                  onChange={weightField.onChange}
                />
              }
            />
          )}
        />
      )}
    />
  )
}

/**
 * Weight tuning playground: compose a sparse query, drag per-aspect weights,
 * and watch the ranking re-order.
 *
 * Weight changes re-score the results already on screen, which is exact for
 * Manhattan, Euclidean, and DotProduct and a close approximation for Cosine.
 * A real search follows on a short debounce so the numbers on screen always
 * converge on what the server says.
 */
export function IndexPlaygroundPage() {
  const { name } = useParams()
  const { client } = useConnection()

  const [index, setIndex] = useState<IndexDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [rows, setRows] = useState<SearchResultRow[]>([])
  const [weightsUsed, setWeightsUsed] = useState<Record<string, number>>({})
  const [ranSignature, setRanSignature] = useState<string | null>(null)
  const [ranQuerySignature, setRanQuerySignature] = useState<string | null>(
    null,
  )
  const [ranValues, setRanValues] = useState<PlaygroundFormValues | null>(null)
  const [pinned, setPinned] = useState<PinnedRun | null>(null)
  const [running, setRunning] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("ranking")
  const [inspectValue, setInspectValue] = useState<
    { title: string; value: unknown } | null
  >(null)
  const [lastRequest, setLastRequest] = useState<RecordedRequest | null>(null)
  const schemaRef = useRef<StoredAspect[]>([])

  const resolver = useCallback<Resolver<PlaygroundFormValues>>(
    (values, context, options) =>
      zodResolver(playgroundFormSchema(schemaRef.current))(
        values,
        context,
        options,
      ),
    [],
  )

  const form = useForm<PlaygroundFormValues>({
    resolver,
    defaultValues: { k: "20", autoRun: true, aspects: [] },
  })
  const { fields } = useFieldArray({ control: form.control, name: "aspects" })
  const values = form.watch()

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
      schemaRef.current = response.data.schema
      form.setValue("aspects", aspectRowsFromSchema(response.data.schema))
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
  }, [client, name, form])

  const runSearch = useCallback(async (next: PlaygroundFormValues) => {
    if (!name) {
      return
    }
    let body: SearchIndexRequest
    try {
      body = buildPlaygroundRequest(next)
    } catch (caught) {
      toastCaughtError(caught, "Could not build the search")
      return
    }

    setRunning(true)
    try {
      const response = await client.searchIndex(name, body)
      setLastRequest(client.lastRequest)
      setRows(response.data)
      setWeightsUsed(scoringWeights(next))
      setRanSignature(JSON.stringify(body))
      setRanQuerySignature(querySignature(next))
      // Clone so later form edits cannot mutate the snapshot used by Compare.
      setRanValues(structuredClone(next))
    } catch (caught) {
      setLastRequest(client.lastRequest)
      toastCaughtError(caught, "Search failed")
    } finally {
      setRunning(false)
    }
  }, [client, name])

  const metric = index?.distanceType ?? "Cosine"
  const schema = index?.schema ?? []
  const multipliers = useMemo(() => multipliersFromSchema(schema), [schema])
  const weights = scoringWeights(values)
  const activeNames = activeAspects(values).map((aspect) => aspect.name)
  const currentSignature = requestSignature(values)
  const currentQuerySignature = querySignature(values)

  // Deliberately not memoised: the weights map is rebuilt from form state on
  // every keystroke, so a memo would never hit while still costing a compare.
  const reranked = rerank(rows, metric, weightsUsed, weights, multipliers)

  const previewable = reranked.length === 0 ||
    hasCompleteGrades(reranked[0].grades, activeNames)

  const state: "empty" | "live" | "preview" | "stale" = ranSignature === null
    ? "empty"
    : currentQuerySignature !== ranQuerySignature
    ? "stale"
    : currentSignature === ranSignature
    ? "live"
    : previewable
    ? "preview"
    : "stale"

  const deviation = useMemo(
    () => previewDeviation(rows, metric, weightsUsed, multipliers),
    [rows, metric, weightsUsed, multipliers],
  )

  // Move baseline is the ranking before the latest weight tweak, frozen on
  // Live → Preview. It stays put when Auto-run / Run search returns Live so
  // the arrows still show how the new neighbourhood moved. Synced again only
  // on the first Live result, or when Live matches that frozen config.
  const moveBaselineRef = useRef<Map<string, number>>(new Map())
  const moveBaselineSigRef = useRef<string | null>(null)
  const rankingStateRef = useRef(state)
  const [moveBaselineVersion, setMoveBaselineVersion] = useState(0)

  useLayoutEffect(() => {
    const previousState = rankingStateRef.current
    rankingStateRef.current = state

    const replaceBaseline = (
      next: Map<string, number>,
      signature: string | null,
    ) => {
      const changed = !rankMapsEqual(moveBaselineRef.current, next) ||
        moveBaselineSigRef.current !== signature
      moveBaselineRef.current = next
      moveBaselineSigRef.current = signature
      if (changed) {
        setMoveBaselineVersion((version) => version + 1)
      }
    }

    if (state === "empty" || state === "stale") {
      replaceBaseline(new Map(), null)
      return
    }

    if (previousState === "live" && state === "preview" && rows.length > 0) {
      const ordered = rerank(
        rows,
        metric,
        weightsUsed,
        weightsUsed,
        multipliers,
      )
      replaceBaseline(
        new Map(ordered.map((item, position) => [item.row.id, position + 1])),
        ranSignature,
      )
      return
    }

    if (state === "live" && reranked.length > 0 && ranSignature !== null) {
      if (
        moveBaselineSigRef.current === null ||
        moveBaselineSigRef.current === ranSignature
      ) {
        replaceBaseline(
          new Map(
            reranked.map((item, position) => [item.row.id, position + 1]),
          ),
          ranSignature,
        )
      }
    }
  }, [
    state,
    rows,
    metric,
    weightsUsed,
    multipliers,
    ranSignature,
    reranked,
  ])

  const baselineRanks = moveBaselineRef.current
  void moveBaselineVersion

  useEffect(() => {
    if (!values.autoRun || index === null) {
      return
    }
    if (currentSignature === null || activeNames.length === 0) {
      return
    }
    if (currentSignature === ranSignature) {
      return
    }
    const timer = setTimeout(() => {
      void runSearch(form.getValues())
    }, 300)
    return () => clearTimeout(timer)
  }, [
    currentSignature,
    ranSignature,
    values.autoRun,
    index,
    activeNames.length,
    runSearch,
    form,
  ])

  const aspectNames = schema.map((aspect) => aspect.name)
  const chartRows = reranked.slice(0, CHART_ROWS)

  // Only chart aspects that actually contribute, but key colours off the schema
  // position so a bar keeps its colour when other aspects are toggled.
  const chartedNames = aspectNames.filter((aspectName) =>
    chartRows.some((item) =>
      item.contributions.some((entry) => entry.name === aspectName)
    )
  )

  const chartConfig: ChartConfig = Object.fromEntries(
    chartedNames.map((aspectName) => [
      aspectName,
      {
        label: aspectName,
        color: CHART_COLORS[
          aspectNames.indexOf(aspectName) % CHART_COLORS.length
        ],
      },
    ]),
  )

  const chartData = chartRows.map((item) => ({
    id: item.row.id,
    ...Object.fromEntries(
      item.contributions.map((entry) => [entry.name, entry.amount]),
    ),
  }))

  const chartMaxAmount = chartRows.reduce(
    (max, item) =>
      Math.max(
        max,
        ...item.contributions.map((entry) => Math.abs(entry.amount)),
        0,
      ),
    0,
  )
  const chartHasNegatives = chartRows.some((item) =>
    item.contributions.some((entry) => entry.amount < 0)
  )
  const showContributionChart = chartData.length > 0 &&
    chartMaxAmount > CHART_DISTANCE_EPSILON

  const selected = reranked.find((item) => item.row.id === selectedId) ?? null
  const selectedTotal = selected
    ? selected.contributions.reduce((sum, entry) => sum + entry.amount, 0)
    : 0

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
            Drag a weight to re-score the results on screen, then let the server
            confirm it. Read the split per aspect in the{" "}
            <DocsTextLink
              page="resolvers"
              hash={DOCS_HASH.inspectingResolvers}
            >
              resolver docs
            </DocsTextLink>.
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
              <CardTitle>Query and weights</CardTitle>
              <CardDescription>
                Distance is{" "}
                {metric}. Every bar stacks to the total distance, so a shorter
                bar is a closer match.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {fields.map((field, position) => (
                <div key={field.id} className="grid gap-4">
                  {position > 0 ? <Separator /> : null}
                  <AspectControl
                    control={form.control}
                    index={position}
                    aspect={schema[position]}
                    error={form.formState.errors.aspects?.[position]?.value
                      ?.message}
                  />
                </div>
              ))}

              <Separator />

              <div className="max-w-28">
                <DocsField
                  label="k"
                  htmlFor="playground-k"
                  page="tutorial"
                  hash={DOCS_HASH.tutorialSearch}
                  blurb="Number of nearest neighbours to return."
                  error={form.formState.errors.k?.message}
                  mono
                >
                  <Input
                    id="playground-k"
                    type="number"
                    min={1}
                    {...form.register("k")}
                  />
                </DocsField>
              </div>

              <Controller
                control={form.control}
                name="autoRun"
                render={({ field }) => (
                  <div className="flex items-center gap-0.5">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(Boolean(checked))}
                        aria-label="Auto-run searches"
                      />
                      <span className="text-sm">Auto-run</span>
                    </div>
                    <DocsHelpIcon
                      page="resolvers"
                      hash={DOCS_HASH.inspectingResolvers}
                      label="Auto-run"
                      blurb="Runs a real search shortly after each change. Turn off when text embedding is slow."
                    />
                  </div>
                )}
              />

              <Button
                type="button"
                disabled={running || activeNames.length === 0}
                onClick={() => void runSearch(form.getValues())}
              >
                {running ? "Searching…" : "Run search"}
              </Button>
              {activeNames.length === 0
                ? (
                  <p className="text-sm text-muted-foreground">
                    Give at least one aspect a value to search.
                  </p>
                )
                : null}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-6">
            <Tabs
              value={activeTab}
              onValueChange={(next) => {
                setActiveTab(next)
                setSelectedId(null)
              }}
              className="min-w-0 gap-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <TabsList>
                  <TabsTrigger value="ranking">Ranking</TabsTrigger>
                  <TabsTrigger value="compare">Compare</TabsTrigger>
                  <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
                </TabsList>
                <StateBadge
                  state={state}
                  metric={metric}
                  deviation={deviation}
                />
              </div>

              <TabsContent value="ranking" className="grid min-w-0 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Ranking</CardTitle>
                    <CardDescription>
                      {reranked.length === 0
                        ? "No results yet."
                        : `${
                          countLabel(reranked.length, "result")
                        }, ranked by ${metric} distance.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid min-w-0 gap-4">
                    {showContributionChart
                      ? (
                        <ChartContainer
                          config={chartConfig}
                          className="aspect-auto h-72 w-full"
                        >
                          <BarChart
                            accessibilityLayer
                            data={chartData}
                            layout="vertical"
                          >
                            <XAxis
                              type="number"
                              domain={chartHasNegatives
                                ? ["auto", "auto"]
                                : [0, "auto"]}
                              allowDataOverflow={false}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              type="category"
                              dataKey="id"
                              width={120}
                              interval={0}
                              tickLine={false}
                              axisLine={false}
                            />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            {chartedNames.map((aspectName) => (
                              <Bar
                                key={aspectName}
                                dataKey={aspectName}
                                stackId="contribution"
                                fill={`var(--color-${aspectName})`}
                                stroke="var(--card)"
                                strokeWidth={1}
                              />
                            ))}
                          </BarChart>
                        </ChartContainer>
                      )
                      : null}

                    <LayoutGroup>
                      <Table aria-label="Ranking">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-16">Move</TableHead>
                            <TableHead>ID</TableHead>
                            <TableHead>Distance</TableHead>
                            {aspectNames.map((aspectName) => (
                              <TableHead key={aspectName} className="font-mono">
                                {aspectName}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <AnimatePresence initial={false}>
                            {reranked.map((item, position) => {
                              const previous = baselineRanks.get(item.row.id)
                              const delta = previous === undefined
                                ? 0
                                : previous - (position + 1)
                              return (
                                <MotionTableRow
                                  key={item.row.id}
                                  layout
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={REORDER_TRANSITION}
                                  className="cursor-pointer"
                                  data-state={selectedId === item.row.id
                                    ? "selected"
                                    : undefined}
                                  onClick={() => setSelectedId(item.row.id)}
                                >
                                  <TableCell className="text-muted-foreground">
                                    {position + 1}
                                  </TableCell>
                                  <TableCell>
                                    <RankDelta delta={delta} />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    {item.row.id}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">
                                    <AnimatedNumber value={item.distance} />
                                  </TableCell>
                                  {aspectNames.map((aspectName) => {
                                    const grade = item.grades.find(
                                      (entry) => entry.name === aspectName,
                                    )
                                    return (
                                      <TableCell
                                        key={aspectName}
                                        className="font-mono text-xs text-muted-foreground"
                                      >
                                        {grade?.raw === null ||
                                            grade?.raw === undefined
                                          ? "—"
                                          : grade.raw.toFixed(3)}
                                      </TableCell>
                                    )
                                  })}
                                </MotionTableRow>
                              )
                            })}
                          </AnimatePresence>
                        </TableBody>
                      </Table>
                    </LayoutGroup>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="compare" className="min-w-0 flex-none">
                <PlaygroundCompare
                  pinned={pinned}
                  current={reranked.map((item) => ({
                    id: item.row.id,
                    distance: item.distance,
                  }))}
                  currentValues={values}
                  metric={metric}
                  canPin={ranValues !== null && ranSignature !== null}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onPin={() => {
                    if (ranValues === null) {
                      return
                    }
                    let request
                    try {
                      request = buildPlaygroundRequest(ranValues)
                    } catch (caught) {
                      toastCaughtError(caught, "Could not pin this search")
                      return
                    }
                    const snapshot = {
                      values: structuredClone(ranValues),
                      rows: structuredClone(rows),
                      // Freeze the Ranking-tab order (client re-score), not the
                      // raw server totals. Cosine preview distances diverge from
                      // server totals even at identical weights; B uses re-score.
                      ranking: reranked.map((item) => ({
                        id: item.row.id,
                        distance: item.distance,
                      })),
                      weightsUsed: { ...weightsUsed },
                      request,
                    }
                    setPinned(snapshot)
                  }}
                  onRestore={() => {
                    if (pinned === null) {
                      return
                    }
                    form.reset(structuredClone(pinned.values))
                  }}
                  onClear={() => setPinned(null)}
                />
              </TabsContent>

              <TabsContent value="scorecard" className="min-w-0 flex-none">
                {name
                  ? (
                    <PlaygroundScorecard
                      indexName={name}
                      schema={schema}
                      metric={metric}
                      weights={formWeights(values)}
                      baselineWeights={pinned
                        ? formWeights(pinned.values)
                        : null}
                      onUseWeight={(aspectName, weight) => {
                        const position = values.aspects.findIndex((aspect) =>
                          aspect.name === aspectName
                        )
                        if (position !== -1) {
                          form.setValue(`aspects.${position}.weight`, weight)
                        }
                      }}
                      onUseWeights={(next) => {
                        for (
                          const [aspectName, weight] of Object.entries(next)
                        ) {
                          const position = values.aspects.findIndex((aspect) =>
                            aspect.name === aspectName
                          )
                          if (position !== -1) {
                            form.setValue(
                              `aspects.${position}.weight`,
                              weight,
                            )
                          }
                        }
                      }}
                    />
                  )
                  : null}
              </TabsContent>
            </Tabs>

            <JsonInspectSheet
              open={selected !== null && activeTab === "ranking"}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedId(null)
                }
              }}
              title={selected?.row.id ?? ""}
              description="Which aspects account for this result's distance."
            >
              {selected
                ? (
                  <Table aria-label="Aspect contributions">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aspect</TableHead>
                        <TableHead>Stored value</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Contribution</TableHead>
                        <TableHead>Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.grades.map((grade) => {
                        const contribution = selected.contributions.find(
                          (entry) => entry.name === grade.name,
                        )
                        const share = contribution && selectedTotal !== 0
                          ? contribution.amount / selectedTotal * 100
                          : null
                        return (
                          <TableRow key={grade.name}>
                            <TableCell className="font-mono text-xs">
                              {grade.name}
                            </TableCell>
                            <TableCell>
                              <JsonPreviewCell
                                value={grade.value}
                                role="button"
                                tabIndex={0}
                                aria-label={`Inspect stored value for ${grade.name}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setInspectValue({
                                    title: grade.name,
                                    value: grade.value,
                                  })
                                }}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setInspectValue({
                                      title: grade.name,
                                      value: grade.value,
                                    })
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {grade.raw === null ? "—" : grade.raw.toFixed(3)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {weights[grade.name] ?? 0}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {contribution
                                ? contribution.amount.toFixed(3)
                                : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {share === null ? "—" : `${share.toFixed(1)}%`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )
                : null}
            </JsonInspectSheet>

            <RequestInspector request={lastRequest} density="compact" />
          </div>
        </div>
      </div>
      <JsonInspectSheet
        open={inspectValue !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInspectValue(null)
          }
        }}
        title={inspectValue?.title ?? ""}
        description="Stored value"
        value={inspectValue?.value}
      />
    </MotionConfig>
  )
}

/** Rank movement against the frozen pre-tweak ranking (survives Live refresh). */
function RankDelta({ delta }: { delta: number }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {delta === 0 ? null : (
        <motion.span
          key={delta}
          initial={{ opacity: 0, y: delta > 0 ? 4 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          <Badge variant="secondary">
            {delta > 0 ? <ArrowUpIcon /> : <ArrowDownIcon />}
            {Math.abs(delta)}
          </Badge>
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** True when two id→rank maps list the same documents at the same ranks. */
function rankMapsEqual(
  left: Map<string, number>,
  right: Map<string, number>,
): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const [id, rank] of left) {
    if (right.get(id) !== rank) {
      return false
    }
  }
  return true
}

/** Whether the ranking on screen is server truth, a local preview, or stale. */
function StateBadge({
  state,
  metric,
  deviation,
}: {
  state: "empty" | "live" | "preview" | "stale"
  metric: IndexDetail["distanceType"]
  deviation: number
}) {
  if (state === "empty") {
    return null
  }

  const label = state === "live"
    ? "Live"
    : state === "preview"
    ? "Preview"
    : "Stale"

  const blurb = state === "live"
    ? "These are the distances the server returned."
    : state === "preview"
    ? metric === "Cosine"
      ? `Re-scored here. Cosine is approximated, last deviation ${
        deviation.toFixed(4)
      }.`
      : "Re-scored here, exactly as the server would."
    : "The query changed. Run a search to refresh the grades."

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant={state === "live" ? "secondary" : "outline"} />
          }
        >
          {label}
        </TooltipTrigger>
        <TooltipContent>{blurb}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
