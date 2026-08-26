/** Approximate Monaco line height at font size 13. */
const LINE_HEIGHT = 19

/** Top and bottom padding inside the editor. */
const VERTICAL_PADDING = 16

/** Fits the editor to JSON text, clamped between min and max pixels. */
export type JsonEditorFitHeightOptions = {
  /** Smallest height in pixels. */
  min: number
  /** Largest height in pixels. Beyond this, the editor scrolls. */
  max: number
}

/**
 * Pixel height that fits `value` without leftover empty rows.
 * Used before Monaco reports `getContentHeight`.
 */
export function jsonEditorFitHeight(
  value: string,
  options: JsonEditorFitHeightOptions,
): number {
  const lines = Math.max(1, value.split("\n").length)
  const next = lines * LINE_HEIGHT + VERTICAL_PADDING
  return Math.min(options.max, Math.max(options.min, next))
}
