import { useState } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { Calendar } from "@/components/ui/calendar.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx"
import { cn } from "@/lib/utils.ts"

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function timeFromDate(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function mergeTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number)
  const next = new Date(date)
  next.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  )
  return next
}

/** Props for {@link DateTimePicker}. */
export type DateTimePickerProps = {
  /** Selected instant, or `null` when empty. */
  value: Date | null
  /** Called when the calendar or time input changes. */
  onChange: (next: Date | null) => void
  /** When true, show an `HH:mm` time input beside the calendar trigger. */
  withTime?: boolean
  /** Optional id for the trigger button. */
  id?: string
  /** Accessible name for the trigger. */
  ariaLabel?: string
  /** Marks the trigger invalid for shadcn `aria-invalid` styling. */
  invalid?: boolean
  /** Disables the trigger and time input. */
  disabled?: boolean
  /** Controlled open state for the calendar popover. */
  open?: boolean
  /** Called when the calendar popover opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** Optional class names for the outer wrapper. */
  className?: string
}

/**
 * Popover calendar with an optional time input, composed from shadcn Popover
 * and Calendar.
 */
export function DateTimePicker({
  value,
  onChange,
  withTime = false,
  id,
  ariaLabel,
  invalid = false,
  disabled = false,
  open,
  onOpenChange,
  className,
}: DateTimePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = open ?? uncontrolledOpen

  function setIsOpen(next: boolean) {
    onOpenChange?.(next)
    if (open === undefined) {
      setUncontrolledOpen(next)
    }
  }

  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-invalid={invalid || undefined}
              data-empty={!value}
              className="h-8 min-w-0 flex-1 justify-start text-left font-normal data-[empty=true]:text-muted-foreground"
            />
          }
        >
          <CalendarIcon />
          {value
            ? format(value, withTime ? "PPP p" : "PPP")
            : <span>Pick a date</span>}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(next) => {
              if (!next) {
                onChange(null)
                return
              }
              const merged = value && withTime
                ? mergeTime(next, timeFromDate(value))
                : next
              onChange(merged)
              if (!withTime) {
                setIsOpen(false)
              }
            }}
          />
        </PopoverContent>
      </Popover>
      {withTime
        ? (
          <Input
            type="time"
            disabled={disabled || value === null}
            value={value ? timeFromDate(value) : ""}
            aria-label={ariaLabel ? `${ariaLabel} time` : "Time"}
            className="w-32"
            onChange={(event) => {
              if (!value) {
                return
              }
              onChange(mergeTime(value, event.target.value))
            }}
          />
        )
        : null}
    </div>
  )
}
