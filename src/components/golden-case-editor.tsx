import { useState } from "react"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import { DocsField, DocsHelpIcon } from "@/components/docs-help.tsx"
import { AspectValueField } from "@/components/aspect-value-field.tsx"
import { MetricHelp } from "@/components/metric-tile.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { aspectValueSchema } from "@/lib/aspected/aspect-value.ts"
import type { GoldenCase } from "@/lib/aspected/golden.ts"
import type { CaseScore } from "@/lib/aspected/relevance.ts"
import type { StoredAspect } from "@/lib/aspected/types.ts"
import { docsPageForAspectType } from "@/lib/docs.ts"

/** Tooltip for the graded gain field. */
const GAIN_HELP =
  "Relevance weight for this document. Leave it at 1 for plain relevant. Raise it when a document should outrank the other hits, which is the only part of nDCG that a yes or no judgement cannot express."

/** Tooltip for the forbidden list. */
const FORBIDDEN_HELP =
  "Documents that must never appear in the top k. Any hit grades the case red whatever the metric says, which is how a policy rule differs from a quality target."

/** Props for {@link GoldenCaseEditor}. */
export type GoldenCaseEditorProps = {
  item: GoldenCase
  /** Index schema, used to render the right control per aspect. */
  schema: StoredAspect[]
  /** Cut-off inherited from the set when the case does not override it. */
  setK: number
  onChange: (next: GoldenCase) => void
  onDelete: () => void
}

/**
 * Edits one test case: its query, its expected documents, and its policy.
 *
 * Weights are deliberately absent. A case describes what a good answer looks
 * like; the weights are the thing being measured against it.
 */
export function GoldenCaseEditor({
  item,
  schema,
  setK,
  onChange,
  onDelete,
}: GoldenCaseEditorProps) {
  const [newId, setNewId] = useState("")
  const [newForbidden, setNewForbidden] = useState("")

  const addExpected = () => {
    const id = newId.trim()
    if (!id || item.expected.some((entry) => entry.id === id)) {
      setNewId("")
      return
    }
    onChange({ ...item, expected: [...item.expected, { id, gain: 1 }] })
    setNewId("")
  }

  const addForbidden = () => {
    const id = newForbidden.trim()
    if (!id || item.forbidden.includes(id)) {
      setNewForbidden("")
      return
    }
    onChange({ ...item, forbidden: [...item.forbidden, id] })
    setNewForbidden("")
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-64"
          value={item.name}
          onChange={(event) => onChange({ ...item, name: event.target.value })}
          aria-label="Case name"
          placeholder="Case name"
        />
        <div className="flex items-center gap-2">
          <Switch
            checked={item.enabled}
            onCheckedChange={(checked) =>
              onChange({ ...item, enabled: Boolean(checked) })}
            aria-label="Run this case"
          />
          <span className="text-sm">Run</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">k</span>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={item.k ?? ""}
            placeholder={String(setK)}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              onChange({
                ...item,
                k: event.target.value.trim() === "" || !Number.isFinite(parsed)
                  ? null
                  : Math.max(1, Math.floor(parsed)),
              })
            }}
            aria-label="Case k override"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto text-destructive"
          onClick={onDelete}
        >
          Delete case
        </Button>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        {schema.map((aspect) => {
          const row = item.aspects.find((entry) => entry.name === aspect.name)
          const valueId = `golden-value-${item.id}-${aspect.name}`
          const value = row?.value ?? ""
          const enabled = row?.enabled ?? false
          const valueError = value.trim() === ""
            ? undefined
            : aspectValueSchema(aspect).safeParse(value).error?.issues[0]
              ?.message

          const update = (patch: { enabled?: boolean; value?: string }) => {
            const existing = item.aspects.some((entry) =>
              entry.name === aspect.name
            )
            const merged = {
              name: aspect.name,
              type: aspect.type,
              enabled: patch.enabled ?? enabled,
              value: patch.value ?? value,
            }
            onChange({
              ...item,
              aspects: existing
                ? item.aspects.map((entry) =>
                  entry.name === aspect.name ? merged : entry
                )
                : [...item.aspects, merged],
            })
          }

          return (
            <div key={aspect.name} className="grid gap-2">
              <div className="flex flex-wrap items-center gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) =>
                      update({ enabled: Boolean(checked) })}
                    aria-label={`Use ${aspect.name}`}
                  />
                  <span className="font-mono text-sm">{aspect.name}</span>
                  <Badge variant="secondary">{aspect.type}</Badge>
                </div>
                <DocsHelpIcon
                  page={docsPageForAspectType(aspect.type)}
                  label={aspect.name}
                />
              </div>
              <AspectValueField
                aspect={aspect}
                id={valueId}
                value={value}
                error={valueError}
                invalid={Boolean(valueError)}
                onChange={(next) => update({ value: next, enabled: true })}
              />
            </div>
          )
        })}
      </div>

      <Separator />

      <div className="grid gap-3">
        <div className="flex min-w-0 items-center">
          <span className="text-sm font-medium">Expected documents</span>
          <MetricHelp label="expected documents" text={GAIN_HELP} />
        </div>
        {item.expected.length === 0
          ? (
            <p className="text-sm text-muted-foreground">
              None yet. Run the case, then mark the good results below.
            </p>
          )
          : (
            <div className="grid gap-2">
              {item.expected.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">
                    {entry.id}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="w-20"
                    value={entry.gain}
                    onChange={(event) => {
                      const parsed = Number(event.target.value)
                      onChange({
                        ...item,
                        expected: item.expected.map((other) =>
                          other.id === entry.id
                            ? {
                              ...other,
                              gain: Number.isFinite(parsed) && parsed > 0
                                ? parsed
                                : 1,
                            }
                            : other
                        ),
                      })
                    }}
                    aria-label={`Gain for ${entry.id}`}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...item,
                        expected: item.expected.filter((other) =>
                          other.id !== entry.id
                        ),
                      })}
                    aria-label={`Remove ${entry.id}`}
                  >
                    <XIcon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        <div className="flex items-center gap-2">
          <Input
            className="max-w-64"
            value={newId}
            onChange={(event) => setNewId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addExpected()
              }
            }}
            placeholder="Document id"
            aria-label="Expected document id"
          />
          <Button type="button" variant="outline" onClick={addExpected}>
            <PlusIcon />
            Add
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-3">
        <div className="flex min-w-0 items-center">
          <span className="text-sm font-medium">Forbidden documents</span>
          <MetricHelp label="forbidden documents" text={FORBIDDEN_HELP} />
        </div>
        {item.forbidden.length > 0
          ? (
            <div className="flex flex-wrap gap-2">
              {item.forbidden.map((id) => (
                <Badge key={id} variant="outline" className="font-mono">
                  {id}
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...item,
                        forbidden: item.forbidden.filter((other) =>
                          other !== id
                        ),
                      })}
                    aria-label={`Allow ${id}`}
                  >
                    <XIcon />
                  </button>
                </Badge>
              ))}
            </div>
          )
          : null}
        <div className="flex items-center gap-2">
          <Input
            className="max-w-64"
            value={newForbidden}
            onChange={(event) => setNewForbidden(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                addForbidden()
              }
            }}
            placeholder="Document id"
            aria-label="Forbidden document id"
          />
          <Button type="button" variant="outline" onClick={addForbidden}>
            <PlusIcon />
            Forbid
          </Button>
        </div>
      </div>

      <Separator />

      <DocsField
        label="Notes"
        htmlFor={`golden-notes-${item.id}`}
        description="Why this case matters. Travels with the exported JSON."
      >
        <Textarea
          id={`golden-notes-${item.id}`}
          rows={2}
          value={item.notes}
          onChange={(event) => onChange({ ...item, notes: event.target.value })}
        />
      </DocsField>
    </div>
  )
}

/** Props for {@link CaseResults}. */
export type CaseResultsProps = {
  item: GoldenCase
  score: CaseScore | null
  /** Ranked ids as graded, best first. */
  ranked: string[]
  onChange: (next: GoldenCase) => void
}

/**
 * The ranking one case produced, with one-click labelling.
 *
 * Judging documents where you are already looking at them is the difference
 * between a golden set that gets maintained and one that rots after a week.
 */
export function CaseResults({
  item,
  score,
  ranked,
  onChange,
}: CaseResultsProps) {
  if (score === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Run the set to see what this case returns.
      </p>
    )
  }

  const gains = new Map(item.expected.map((entry) => [entry.id, entry.gain]))
  const forbidden = new Set(item.forbidden)

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-2">
        {ranked.slice(0, score.k).map((id, position) => {
          const gain = gains.get(id)
          return (
            <div
              key={id}
              className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1"
            >
              <span className="w-6 shrink-0 text-xs text-muted-foreground">
                {position + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {id}
              </span>
              {forbidden.has(id)
                ? (
                  <Badge
                    variant="outline"
                    className="border-destructive/30 bg-destructive/10 text-destructive"
                  >
                    forbidden
                  </Badge>
                )
                : null}
              {gain === undefined
                ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onChange({
                        ...item,
                        expected: [...item.expected, { id, gain: 1 }],
                      })}
                  >
                    <CheckIcon />
                    Mark relevant
                  </Button>
                )
                : (
                  <Badge
                    variant="outline"
                    className="border-pass/30 bg-pass/12 text-pass"
                  >
                    gain {gain}
                  </Badge>
                )}
            </div>
          )
        })}
        {ranked.length === 0
          ? (
            <p className="text-sm text-muted-foreground">
              This case returned nothing.
            </p>
          )
          : null}
      </div>

      {score.missing.length > 0
        ? (
          <div className="grid gap-2">
            <span className="text-sm font-medium">
              Expected but missing
            </span>
            <div className="flex flex-wrap gap-2">
              {score.missing.map((id) => (
                <Badge
                  key={id}
                  variant="outline"
                  className="border-warn/35 bg-warn/12 font-mono text-warn"
                >
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        )
        : null}
    </div>
  )
}
