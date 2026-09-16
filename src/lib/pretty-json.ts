/**
 * Compact one-line JSON for table cell previews.
 *
 * Returns `null` when `value` is `null` or `undefined` so callers can render
 * an empty cell.
 */
export function compactJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return JSON.stringify(value)
}

/**
 * Pretty-printed JSON for inspect panels and editors.
 *
 * Returns an empty string when `value` is `null` or `undefined`.
 */
export function prettyJson(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }
  return JSON.stringify(value, null, 2)
}
