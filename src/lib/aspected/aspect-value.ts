import { z } from "zod"
import { aspectNumberSetting, aspectOptionValues } from "./playground.ts"
import type { DatetimeGranularity, StoredAspect } from "./types.ts"
import { datetimeGranularitySchema } from "./types.ts"

/** Control shape chosen from an aspect's configured datetime granularities. */
export type DatetimeControl =
  | "timestamp"
  | "date-time"
  | "date"
  | "weekday"
  | "hour"

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

const GRANULARITY_SET = new Set<string>(datetimeGranularitySchema.options)

/**
 * Reads the configured datetime granularities from an aspect's settings.
 */
export function aspectGranularities(
  aspect: StoredAspect,
): DatetimeGranularity[] {
  const raw = aspect.settings.granularity
  if (typeof raw === "string" && GRANULARITY_SET.has(raw)) {
    return [raw as DatetimeGranularity]
  }
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is DatetimeGranularity =>
      typeof entry === "string" && GRANULARITY_SET.has(entry)
    )
  }
  return []
}

/**
 * Reads optional `minYear` / `maxYear` bounds from a datetime aspect.
 */
export function aspectDatetimeYearBounds(aspect: StoredAspect): {
  minYear: number | null
  maxYear: number | null
} {
  if (aspect.type !== "datetime") {
    return { minYear: null, maxYear: null }
  }
  const min = aspect.settings.minYear
  const max = aspect.settings.maxYear
  return {
    minYear: typeof min === "number" && Number.isFinite(min) ? min : null,
    maxYear: typeof max === "number" && Number.isFinite(max) ? max : null,
  }
}

/**
 * Picks the UI control for a datetime aspect from its configured granularities.
 *
 * Wider modes win: timestamp, then year (optionally with time), then month,
 * day, weekday, and finally hour-only.
 */
export function datetimeControl(aspect: StoredAspect): DatetimeControl {
  const modes = new Set(aspectGranularities(aspect))
  if (modes.has("timestamp")) {
    return "timestamp"
  }
  if (modes.has("year")) {
    return modes.has("hour") ? "date-time" : "date"
  }
  if (modes.has("month") || modes.has("day")) {
    return "date"
  }
  if (modes.has("weekday")) {
    return "weekday"
  }
  return "hour"
}

/** Weekday names the datetime resolver accepts for weekday-only queries. */
export function weekdayOptions(): readonly string[] {
  return WEEKDAYS
}

/** Reads `settings.numDims` for a raw aspect. */
export function aspectRawDims(aspect: StoredAspect): number | undefined {
  const value = aspect.settings.numDims
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Formats a `Date` into the string the datetime resolver expects for this
 * aspect's control mode.
 */
export function formatDatetimeValue(
  aspect: StoredAspect,
  date: Date,
): string {
  const control = datetimeControl(aspect)
  const year = date.getFullYear()
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  const hours = pad2(date.getHours())
  const minutes = pad2(date.getMinutes())
  const seconds = pad2(date.getSeconds())

  switch (control) {
    case "timestamp":
      return String(Math.floor(date.getTime() / 1000))
    case "date-time":
      return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
    case "date": {
      const modes = new Set(aspectGranularities(aspect))
      if (modes.has("year")) {
        // Year-only resolvers accept YYYY and YYYY/MM, not YYYY/MM/DD.
        return `${year}`
      }
      if (modes.has("month")) {
        return `${month}/${day}`
      }
      return day
    }
    case "weekday":
      return WEEKDAYS[date.getDay()]
    case "hour":
      return `${hours}:${minutes}`
  }
}

/**
 * Parses a stored datetime query string back into a `Date` for the picker.
 *
 * Returns `null` when the string does not match the aspect's control format.
 */
export function parseDatetimeValue(
  aspect: StoredAspect,
  value: string,
): Date | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const control = datetimeControl(aspect)
  const now = new Date()

  if (control === "timestamp") {
    if (!/^\d+$/.test(trimmed)) {
      return null
    }
    const ms = Number(trimmed) * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (control === "hour") {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
    if (!match) {
      return null
    }
    const date = new Date(now)
    date.setHours(
      Number(match[1]),
      Number(match[2]),
      Number(match[3] ?? "0"),
      0,
    )
    return date
  }

  if (control === "weekday") {
    const index = WEEKDAYS.findIndex(
      (day) => day.toLowerCase() === trimmed.toLowerCase(),
    )
    if (index === -1) {
      return null
    }
    const date = new Date(now)
    const delta = index - date.getDay()
    date.setDate(date.getDate() + delta)
    date.setHours(0, 0, 0, 0)
    return date
  }

  const modes = new Set(aspectGranularities(aspect))

  // Year-only: server accepts YYYY, YYYY/MM, and full date-time, not bare
  // YYYY/MM/DD.
  if (modes.has("year") && control === "date") {
    const yearOnly = /^(\d{4})$/.exec(trimmed)
    if (yearOnly) {
      return new Date(Number(yearOnly[1]), 0, 1, 0, 0, 0)
    }
    const yearMonth = /^(\d{4})\/(\d{2})$/.exec(trimmed)
    if (yearMonth) {
      return new Date(
        Number(yearMonth[1]),
        Number(yearMonth[2]) - 1,
        1,
        0,
        0,
        0,
      )
    }
    const full = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
      .exec(trimmed)
    if (full) {
      return new Date(
        Number(full[1]),
        Number(full[2]) - 1,
        Number(full[3]),
        Number(full[4]),
        Number(full[5]),
        Number(full[6]),
      )
    }
    return null
  }

  const dateTime = /^(\d{4})\/(\d{2})\/(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/
    .exec(trimmed)
  if (dateTime) {
    return new Date(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4] ?? "0"),
      Number(dateTime[5] ?? "0"),
      Number(dateTime[6] ?? "0"),
    )
  }

  const monthDay = /^(\d{2})\/(\d{2})$/.exec(trimmed)
  if (monthDay) {
    return new Date(
      now.getFullYear(),
      Number(monthDay[1]) - 1,
      Number(monthDay[2]),
      0,
      0,
      0,
    )
  }

  const dayOnly = /^(\d{2})$/.exec(trimmed)
  if (dayOnly) {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      Number(dayOnly[1]),
      0,
      0,
      0,
    )
  }

  return null
}

function datetimePattern(aspect: StoredAspect): RegExp {
  const control = datetimeControl(aspect)
  switch (control) {
    case "timestamp":
      return /^\d+$/
    case "date-time":
      return /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/
    case "date": {
      const modes = new Set(aspectGranularities(aspect))
      if (modes.has("year")) {
        return /^(?:\d{4}|\d{4}\/\d{2}|\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})$/
      }
      if (modes.has("month")) {
        return /^\d{2}\/\d{2}$/
      }
      return /^\d{2}$/
    }
    case "weekday":
      return new RegExp(`^(${WEEKDAYS.join("|")})$`, "i")
    case "hour":
      return /^\d{2}:\d{2}(?::\d{2})?$/
  }
}

/**
 * Short helper text for an aspect value control: what is valid, and that blank
 * omits the aspect from a sparse query.
 */
export function aspectValueDescription(aspect: StoredAspect): string {
  const omit = "Leave blank to omit."

  if (aspect.type === "enum" || aspect.type === "dict") {
    const options = aspectOptionValues(aspect)
    if (options.length > 0) {
      return `One of: ${options.join(", ")}. ${omit}`
    }
    return `Choose a ${aspect.type} value. ${omit}`
  }

  if (aspect.type === "text") {
    return `Free text. ${omit}`
  }

  if (aspect.type === "number") {
    const min = aspectNumberSetting(aspect, "min") ?? 0
    const max = aspectNumberSetting(aspect, "max")
    return max === undefined
      ? `Number >= ${min}. ${omit}`
      : `Number between ${min} and ${max}. ${omit}`
  }

  if (aspect.type === "raw") {
    const dims = aspectRawDims(aspect)
    return dims === undefined
      ? `JSON array of numbers, e.g. [0.1, 0.2]. ${omit}`
      : `JSON array of exactly ${dims} numbers. ${omit}`
  }

  if (aspect.type === "datetime") {
    const control = datetimeControl(aspect)
    switch (control) {
      case "timestamp":
        return `Unix timestamp in seconds. ${omit}`
      case "date-time":
        return `Date and time as YYYY/MM/DD HH:MM:SS. ${omit}`
      case "date": {
        const modes = new Set(aspectGranularities(aspect))
        if (modes.has("year")) {
          const { minYear, maxYear } = aspectDatetimeYearBounds(aspect)
          if (minYear !== null && maxYear !== null) {
            return `Year between ${minYear} and ${maxYear}. ${omit}`
          }
          if (minYear !== null) {
            return `Year >= ${minYear}. ${omit}`
          }
          if (maxYear !== null) {
            return `Year <= ${maxYear}. ${omit}`
          }
          return `Year as YYYY. ${omit}`
        }
        if (modes.has("month")) {
          return `Month and day as MM/DD. ${omit}`
        }
        return `Day of month as DD. ${omit}`
      }
      case "weekday":
        return `Weekday name (Sunday to Saturday). ${omit}`
      case "hour":
        return `Time as HH:MM. ${omit}`
    }
  }

  return omit
}

/**
 * Zod schema for one aspect's form string, driven by its resolver settings.
 *
 * An empty string is always valid so the aspect can stay sparse.
 */
export function aspectValueSchema(aspect: StoredAspect): z.ZodType<string> {
  return z.string().superRefine((value, ctx) => {
    const trimmed = value.trim()
    if (trimmed === "") {
      return
    }

    if (aspect.type === "enum" || aspect.type === "dict") {
      const options = aspectOptionValues(aspect)
      if (options.length > 0 && !options.includes(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: `Must be one of: ${options.join(", ")}`,
        })
      }
      return
    }

    if (aspect.type === "number") {
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: "custom", message: "Must be a number" })
        return
      }
      const min = aspectNumberSetting(aspect, "min") ?? 0
      const max = aspectNumberSetting(aspect, "max")
      if (parsed < min || (max !== undefined && parsed > max)) {
        ctx.addIssue({
          code: "custom",
          message: max === undefined
            ? `Must be >= ${min}`
            : `Must be between ${min} and ${max}`,
        })
      }
      return
    }

    if (aspect.type === "raw") {
      try {
        const parsed = JSON.parse(trimmed)
        const dims = aspectRawDims(aspect)
        if (
          !Array.isArray(parsed) ||
          parsed.some((entry) => typeof entry !== "number")
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Must be a JSON array of numbers",
          })
          return
        }
        if (dims !== undefined && parsed.length !== dims) {
          ctx.addIssue({
            code: "custom",
            message: `Must have exactly ${dims} dimensions`,
          })
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Must be a JSON array of numbers",
        })
      }
      return
    }

    if (aspect.type === "datetime") {
      if (!datetimePattern(aspect).test(trimmed)) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid datetime for this aspect",
        })
      }
    }
  })
}

/**
 * Validates every aspect value against the matching stored aspect settings.
 *
 * Aspects present in the form but missing from `schema` fall back to
 * `z.string()` so drafts remain editable while an index is loading.
 */
export function aspectValuesSchema(schema: StoredAspect[]) {
  const byName = new Map(schema.map((aspect) => [aspect.name, aspect]))
  return z.array(
    z.object({
      name: z.string(),
      value: z.string(),
    }).passthrough().superRefine((row, ctx) => {
      const aspect = byName.get(row.name)
      if (!aspect) {
        return
      }
      const result = aspectValueSchema(aspect).safeParse(row.value)
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["value"],
          })
        }
      }
    }),
  )
}
