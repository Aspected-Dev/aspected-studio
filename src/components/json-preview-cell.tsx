import type { HTMLAttributes, MouseEventHandler } from "react"
import { compactJson } from "@/lib/pretty-json.ts"
import { cn } from "@/lib/utils.ts"

const WIDTH_CLASS = {
  default: "w-36 sm:w-52",
  wide: "w-40 sm:w-64",
} as const

/** Props for {@link JsonPreviewCell}. */
export type JsonPreviewCellProps = {
  /** Value shown as compact truncated JSON. */
  value: unknown
  /** Column width preset. Defaults to `default`. */
  width?: keyof typeof WIDTH_CLASS
  /** Optional click handler (Playground cell inspect). */
  onClick?: MouseEventHandler<HTMLSpanElement>
} & Omit<HTMLAttributes<HTMLSpanElement>, "children" | "title" | "onClick">

/**
 * Truncated mono preview of JSON for data-table cells.
 *
 * Empty when `value` is nullish. Sets `title` to the compact string for a
 * native hover peek. Does not open an inspect sheet on its own.
 */
export function JsonPreviewCell({
  value,
  width = "default",
  className,
  onClick,
  ...props
}: JsonPreviewCellProps) {
  const text = compactJson(value)
  if (text === null) {
    return null
  }

  return (
    <span
      {...props}
      className={cn(
        "inline-block truncate font-mono text-xs",
        WIDTH_CLASS[width],
        onClick ? "cursor-pointer" : null,
        className,
      )}
      title={text}
      onClick={onClick}
    >
      {text}
    </span>
  )
}
