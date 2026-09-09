import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import type { GoldenSet } from "@/lib/aspected/golden.ts"
import { goldenSetDisplayName } from "@/lib/aspected/golden.ts"
import { DEFAULT_TUNE_CONCURRENCY } from "@/hooks/use-auto-tune.ts"
import {
  type AspectTuneSpace,
  BUDGET_PRESETS,
  type TuneSpace,
} from "@/lib/aspected/tuner.ts"
import { HOLDOUT_MIN_CASES } from "@/lib/aspected/tune-objective.ts"

/** Budget preset keys plus custom. */
export type BudgetPresetKey = keyof typeof BUDGET_PRESETS | "custom"

/** Setup form values for starting a run. */
export type AutoTuneSetupValues = {
  setId: string
  space: TuneSpace
  budgetPreset: BudgetPresetKey
  customBudget: number
  concurrency: number
  useHoldout: boolean
  tuneDepth: boolean
  wallClockMinutes: number | null
}

/** Props for {@link AutoTuneSetup}. */
export type AutoTuneSetupProps = {
  sets: GoldenSet[]
  values: AutoTuneSetupValues
  onChange: (next: AutoTuneSetupValues) => void
  runnableCaseCount: number
  disabled: boolean
  onStart: () => void
}

/**
 * Setup card: golden set, aspect space, budget, and Start.
 */
export function AutoTuneSetup({
  sets,
  values,
  onChange,
  runnableCaseCount,
  disabled,
  onStart,
}: AutoTuneSetupProps) {
  const maxSearches = values.budgetPreset === "custom"
    ? values.customBudget
    : BUDGET_PRESETS[values.budgetPreset]
  const holdoutReady = runnableCaseCount >= HOLDOUT_MIN_CASES

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup</CardTitle>
        <CardDescription>
          Auto-tune issues many Live searches against your golden set. Prefer a
          replica or an off-peak window on production indexes. Stop is always
          available and keeps the best config so far.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-6">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="auto-tune-set">Golden set</Label>
          <Select
            value={values.setId || null}
            items={Object.fromEntries(
              sets.map((item) => [item.id, goldenSetDisplayName(item)]),
            )}
            onValueChange={(next) => {
              if (typeof next === "string") {
                onChange({ ...values, setId: next })
              }
            }}
          >
            <SelectTrigger
              id="auto-tune-set"
              className="w-64"
              aria-label="Golden set"
            >
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
          <p className="text-sm text-muted-foreground">
            {runnableCaseCount}{" "}
            runnable case{runnableCaseCount === 1 ? "" : "s"}
          </p>
        </div>

        <Separator />

        <div className="grid min-w-0 gap-3">
          <div>
            <p className="text-sm font-medium">Aspect space</p>
            <p className="text-sm text-muted-foreground">
              Tune weight searches the log grid. Allow off tries weight 0 (omit
              from every case query). Freeze keeps the start weight.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Aspect</th>
                  <th className="px-3 py-2 font-medium">Tune weight</th>
                  <th className="px-3 py-2 font-medium">Allow off</th>
                  <th className="px-3 py-2 font-medium">Freeze</th>
                </tr>
              </thead>
              <tbody>
                {values.space.aspects.map((aspect) => (
                  <tr key={aspect.name} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {aspect.name}
                    </td>
                    <td className="px-3 py-2">
                      <AspectFlag
                        checked={aspect.tuneWeight && !aspect.freeze}
                        disabled={disabled || aspect.freeze}
                        label={`Tune weight for ${aspect.name}`}
                        onCheckedChange={(checked) =>
                          patchAspect(values, onChange, aspect.name, {
                            tuneWeight: checked,
                          })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <AspectFlag
                        checked={aspect.allowOff && !aspect.freeze}
                        disabled={disabled || aspect.freeze}
                        label={`Allow off for ${aspect.name}`}
                        onCheckedChange={(checked) =>
                          patchAspect(values, onChange, aspect.name, {
                            allowOff: checked,
                          })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <AspectFlag
                        checked={aspect.freeze}
                        disabled={disabled}
                        label={`Freeze ${aspect.name}`}
                        onCheckedChange={(checked) =>
                          patchAspect(values, onChange, aspect.name, {
                            freeze: checked,
                            tuneWeight: checked ? false : aspect.tuneWeight,
                            allowOff: checked ? false : aspect.allowOff,
                          })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={values.tuneDepth}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange({
                  ...values,
                  tuneDepth: checked === true,
                  space: { ...values.space, tuneDepth: checked === true },
                })}
            />
            Also try deeper retrieval (1× / 2× / 4× the deepest case grading k).
            Grading k stays fixed.
          </label>
        </div>

        <Separator />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <Label>Budget</Label>
            <Select
              value={values.budgetPreset}
              items={{
                quick: `Quick (${BUDGET_PRESETS.quick})`,
                standard: `Standard (${BUDGET_PRESETS.standard})`,
                thorough: `Thorough (${BUDGET_PRESETS.thorough})`,
                custom: "Custom",
              }}
              onValueChange={(next) => {
                if (
                  next === "quick" || next === "standard" ||
                  next === "thorough" || next === "custom"
                ) {
                  onChange({ ...values, budgetPreset: next })
                }
              }}
            >
              <SelectTrigger className="w-full" aria-label="Budget preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick">
                  Quick ({BUDGET_PRESETS.quick} searches)
                </SelectItem>
                <SelectItem value="standard">
                  Standard ({BUDGET_PRESETS.standard} searches)
                </SelectItem>
                <SelectItem value="thorough">
                  Thorough ({BUDGET_PRESETS.thorough} searches)
                </SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {values.budgetPreset === "custom"
              ? (
                <Input
                  type="number"
                  min={10}
                  value={values.customBudget}
                  disabled={disabled}
                  aria-label="Custom search budget"
                  onChange={(event) =>
                    onChange({
                      ...values,
                      customBudget: Math.max(
                        10,
                        Number(event.target.value) || 10,
                      ),
                    })}
                />
              )
              : null}
            <p className="text-sm text-muted-foreground">
              About {maxSearches}{" "}
              searches. Signature cache reuses unchanged cases, so a trial often
              costs far fewer. A run stops at the first trial past the budget,
              so it can finish slightly over.
            </p>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="auto-tune-concurrency">Concurrency</Label>
            <Input
              id="auto-tune-concurrency"
              type="number"
              min={1}
              max={16}
              value={values.concurrency}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...values,
                  concurrency: Math.min(
                    16,
                    Math.max(1, Number(event.target.value) || 1),
                  ),
                })}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.useHoldout}
                disabled={disabled || !holdoutReady}
                onCheckedChange={(checked) =>
                  onChange({ ...values, useHoldout: checked === true })}
              />
              Train / holdout split
              {!holdoutReady ? ` (needs ≥${HOLDOUT_MIN_CASES} cases)` : null}
            </label>
            <Label htmlFor="auto-tune-wall">
              Wall-clock cap (minutes, optional)
            </Label>
            <Input
              id="auto-tune-wall"
              type="number"
              min={1}
              placeholder="None"
              value={values.wallClockMinutes ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const raw = event.target.value.trim()
                onChange({
                  ...values,
                  wallClockMinutes: raw === ""
                    ? null
                    : Math.max(1, Number(raw) || 1),
                })
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={disabled || !values.setId || runnableCaseCount === 0}
            onClick={onStart}
          >
            Start auto-tune
          </Button>
          <p className="text-sm text-muted-foreground">
            Budget: {maxSearches} searches · concurrency{" "}
            {values.concurrency || DEFAULT_TUNE_CONCURRENCY}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function AspectFlag({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={(value) => onCheckedChange(value === true)}
    />
  )
}

function patchAspect(
  values: AutoTuneSetupValues,
  onChange: (next: AutoTuneSetupValues) => void,
  name: string,
  patch: Partial<AspectTuneSpace>,
) {
  onChange({
    ...values,
    space: {
      ...values.space,
      aspects: values.space.aspects.map((aspect) =>
        aspect.name === name ? { ...aspect, ...patch } : aspect
      ),
    },
  })
}
