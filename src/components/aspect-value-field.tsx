import type { ReactNode } from "react"
import { DateTimePicker } from "@/components/date-time-picker.tsx"
import { FieldError } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import {
  datetimeControl,
  formatDatetimeValue,
  parseDatetimeValue,
  weekdayOptions,
} from "@/lib/aspected/aspect-value.ts"
import { aspectOptionValues } from "@/lib/aspected/playground.ts"
import type { StoredAspect } from "@/lib/aspected/types.ts"

/** Props for {@link AspectValueField}. */
export type AspectValueFieldProps = {
  /** Stored aspect that drives the control and settings. */
  aspect: StoredAspect
  /** Current form string value. */
  value: string
  /** Called with the next form string when the control changes. */
  onChange: (next: string) => void
  /** Optional id forwarded to the primary control. */
  id?: string
  /** Disables the control. */
  disabled?: boolean
  /**
   * Marks the control invalid for shadcn `aria-invalid` styling. Prefer this
   * when a parent `DocsField` already renders the error message.
   */
  invalid?: boolean
  /** Inline validation message when no parent Field wrapper shows one. */
  error?: string
}

/**
 * Type-aware aspect query value control shared by Search, Playground, and the
 * golden case editor.
 *
 * Closed option sets (`enum` / `dict`) use a Select. Text uses a Textarea.
 * Numbers use a number Input (range is enforced by Zod, not HTML min/max).
 * Datetime picks a calendar, weekday Select, or time Input from the configured
 * granularities. Raw uses a Textarea for a JSON vector.
 */
export function AspectValueField({
  aspect,
  value,
  onChange,
  id,
  disabled = false,
  invalid = false,
  error,
}: AspectValueFieldProps) {
  const ariaLabel = `${aspect.name} value`
  const ariaInvalid = invalid || Boolean(error)
  const options = aspectOptionValues(aspect)
  const control = aspect.type === "datetime" ? datetimeControl(aspect) : null

  let body: ReactNode

  if (options.length > 0) {
    body = (
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next)
          }
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
        >
          <SelectValue placeholder="Choose a value" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (aspect.type === "text") {
    body = (
      <Textarea
        id={id}
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="Free text"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else if (aspect.type === "raw") {
    body = (
      <Textarea
        id={id}
        rows={2}
        value={value}
        disabled={disabled}
        placeholder="[0.1, 0.2]"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else if (aspect.type === "number") {
    body = (
      <Input
        id={id}
        type="number"
        step="any"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else if (aspect.type === "datetime" && control === "weekday") {
    body = (
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next)
          }
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
        >
          <SelectValue placeholder="Choose a weekday" />
        </SelectTrigger>
        <SelectContent>
          {weekdayOptions().map((day) => (
            <SelectItem key={day} value={day}>
              {day}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (aspect.type === "datetime" && control === "hour") {
    body = (
      <Input
        id={id}
        type="time"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  } else if (aspect.type === "datetime") {
    const withTime = control === "date-time" || control === "timestamp"
    body = (
      <DateTimePicker
        id={id}
        ariaLabel={ariaLabel}
        disabled={disabled}
        invalid={ariaInvalid}
        withTime={withTime}
        value={parseDatetimeValue(aspect, value)}
        onChange={(next) => {
          onChange(next ? formatDatetimeValue(aspect, next) : "")
        }}
      />
    )
  } else {
    body = (
      <Input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  return (
    <>
      {body}
      {error ? <FieldError>{error}</FieldError> : null}
    </>
  )
}
