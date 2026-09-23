import { type ReactNode, useEffect, useRef, useState } from "react"
import { AspectValueField } from "@/components/aspect-value-field.tsx"
import { DocsField, DocsHelpIcon } from "@/components/docs-help.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import {
  aspectValueDescription,
  datetimeControl,
} from "@/lib/aspected/aspect-value.ts"
import { aspectOptionValues, clampWeight } from "@/lib/aspected/playground.ts"
import type { StoredAspect } from "@/lib/aspected/types.ts"
import { DOCS_HASH, docsPageForAspectType } from "@/lib/docs.ts"
import { cn } from "@/lib/utils.ts"

/** Participation state derived from the value and weight. */
export type AspectQueryStatus = "in-query" | "not-scored" | "sparse"

/**
 * Derives whether an aspect participates in the next search.
 *
 * Blank values stay sparse. A filled value with weight `0` is parked without
 * scoring. Anything else is in the query.
 */
export function aspectQueryStatus(
  value: string,
  weight: number,
): AspectQueryStatus {
  if (value.trim() === "") {
    return "sparse"
  }
  if (clampWeight(weight) <= 0) {
    return "not-scored"
  }
  return "in-query"
}

/** Whether the aspect value control opens an overlay (select or calendar). */
export function aspectUsesOverlayControl(aspect: StoredAspect): boolean {
  if (aspectOptionValues(aspect).length > 0) {
    return true
  }
  if (aspect.type !== "datetime") {
    return false
  }
  const control = datetimeControl(aspect)
  return control === "weekday" || control === "date" ||
    control === "date-time" ||
    control === "timestamp"
}

/** Props for {@link AspectQueryRow}. */
export type AspectQueryRowProps = {
  /** Stored aspect that drives the control and settings. */
  aspect: StoredAspect
  /** Current form string value. */
  value: string
  /** Called with the next form string when the control changes. */
  onChange: (next: string) => void
  /** Optional id forwarded to the primary control. */
  id?: string
  /** Inline validation message. */
  error?: string
  /**
   * Current weight used for participation. Omit when the row has no weight
   * control (golden cases).
   */
  weight?: number
  /**
   * Called when the presence switch restores a parked weight (`0` → `1`).
   * Required for honest switch behaviour when weight controls are present.
   */
  onWeightChange?: (next: number) => void
  /** Optional weight control rendered under the value field. */
  weightControl?: ReactNode
  /**
   * When true, show a presence switch that mirrors participation. Defaults to
   * true. Golden cases hide it because the case editor has its own semantics.
   */
  showPresence?: boolean
}

/**
 * Shared aspect query row: presence switch, name header, type-aware value
 * field, and optional weight slot. Used by Search, Playground, and the golden
 * case editor.
 *
 * Turning Include on is optimistic: the switch stays on while the user picks
 * or types a value. Closing the picker or blurring a blank field turns it back
 * off. A committed value keeps it on. Turning it off clears the value.
 */
export function AspectQueryRow({
  aspect,
  value,
  onChange,
  id,
  error,
  weight = 1,
  onWeightChange,
  weightControl,
  showPresence = true,
}: AspectQueryRowProps) {
  const multiplier = aspect.multiplier ?? 1
  const status = aspectQueryStatus(value, weight)
  const inQuery = status === "in-query"
  const valueId = id ?? `aspect-${aspect.name}`
  const valueRef = useRef<HTMLDivElement>(null)
  const valueLatest = useRef(value)
  const suppressCancelRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [controlOpen, setControlOpen] = useState(false)
  const active = inQuery || pending
  const usesOverlay = aspectUsesOverlayControl(aspect)

  valueLatest.current = value

  useEffect(() => {
    if (inQuery) {
      setPending(false)
    }
  }, [inQuery])

  function cancelPendingIfBlank() {
    if (suppressCancelRef.current) {
      return
    }
    if (valueLatest.current.trim() === "") {
      setPending(false)
    }
  }

  function handlePresenceChange(checked: boolean) {
    suppressCancelRef.current = false
    if (!checked) {
      setPending(false)
      setControlOpen(false)
      onChange("")
      return
    }
    if (status === "not-scored") {
      onWeightChange?.(1)
      return
    }
    setPending(true)
    if (usesOverlay) {
      setControlOpen(true)
      return
    }
    requestAnimationFrame(() => {
      const control = valueRef.current?.querySelector<HTMLElement>(
        "input, textarea",
      )
      control?.focus()
    })
  }

  function handleOpenChange(open: boolean) {
    setControlOpen(open)
    if (!open) {
      // Defer so a click on Include that closed the overlay is handled by the
      // switch first, instead of clearing pending and then turning Include on.
      window.setTimeout(() => {
        cancelPendingIfBlank()
      }, 0)
    }
  }

  function handleFieldBlur(
    event: { relatedTarget: EventTarget | null },
  ) {
    const next = event.relatedTarget
    if (next instanceof Node) {
      const include = document.querySelector(
        `[aria-label="Include ${aspect.name}"]`,
      )
      if (include?.contains(next) || include === next) {
        return
      }
    }
    cancelPendingIfBlank()
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {showPresence
            ? (
              <Switch
                checked={active}
                onPointerDown={() => {
                  suppressCancelRef.current = true
                }}
                onCheckedChange={(checked) =>
                  handlePresenceChange(Boolean(checked))}
                aria-label={`Include ${aspect.name}`}
              />
            )
            : null}
          <span
            className={cn(
              "font-mono text-sm",
              showPresence && !active ? "text-muted-foreground" : undefined,
            )}
          >
            {aspect.name}
          </span>
          <Badge variant="secondary">{aspect.type}</Badge>
          {multiplier !== 1
            ? <Badge variant="outline">multiplier {multiplier}</Badge>
            : null}
        </div>
        <DocsHelpIcon
          page={docsPageForAspectType(aspect.type)}
          label={aspect.name}
        />
      </div>

      <div
        ref={valueRef}
        className={cn(
          "grid gap-3 transition-opacity",
          showPresence && !active ? "opacity-45" : undefined,
        )}
      >
        <DocsField
          label="Value"
          htmlFor={valueId}
          page="resolvers"
          hash={DOCS_HASH.combiningResolvers}
          blurb="Leave blank to keep this aspect out of the query."
          description={aspectValueDescription(aspect)}
          error={error}
        >
          <AspectValueField
            aspect={aspect}
            id={valueId}
            value={value}
            onChange={onChange}
            invalid={Boolean(error)}
            open={usesOverlay ? controlOpen : undefined}
            onOpenChange={usesOverlay ? handleOpenChange : undefined}
            onBlur={usesOverlay ? undefined : handleFieldBlur}
          />
        </DocsField>

        {weightControl}
      </div>
    </div>
  )
}
