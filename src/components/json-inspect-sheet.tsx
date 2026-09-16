import type { ReactNode } from "react"
import { JsonEditor } from "@/components/json-editor.tsx"
import { Field, FieldLabel } from "@/components/ui/field.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import { prettyJson } from "@/lib/pretty-json.ts"

const DEFAULT_MAX_HEIGHT = 480

/** Props for {@link JsonInspectSheet}. */
export type JsonInspectSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sheet heading, usually an id or aspect name. */
  title: string
  /** Optional one-line context under the title. */
  description?: string
  /** Optional structured summary or extra JSON sections. */
  children?: ReactNode
  /**
   * Value shown as pretty-printed read-only JSON. Omit when the sheet only
   * uses `children` for content.
   */
  value?: unknown
  /** Optional label above the JSON editor (for example Settings). */
  jsonLabel?: string
  /** Max height for the read-only editor. Defaults to 480. */
  maxHeight?: number
}

/**
 * Right-side sheet for inspecting structured data as pretty JSON.
 *
 * Optional `children` sit above the default editor. Omit `value` when all
 * content lives in `children`. Copy lives on each read-only Monaco editor.
 */
export function JsonInspectSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  value,
  jsonLabel,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: JsonInspectSheetProps) {
  const showJson = value !== undefined
  const json = showJson ? prettyJson(value) : ""

  const editor = json
    ? (
      <JsonEditor
        value={json}
        readOnly
        maxHeight={maxHeight}
      />
    )
    : <p className="text-sm text-muted-foreground">No JSON to show.</p>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="font-mono">{title}</SheetTitle>
          {description
            ? <SheetDescription>{description}</SheetDescription>
            : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {children}
          {showJson
            ? jsonLabel
              ? (
                <Field>
                  <FieldLabel>{jsonLabel}</FieldLabel>
                  {editor}
                </Field>
              )
              : editor
            : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
