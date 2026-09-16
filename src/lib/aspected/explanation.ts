import type { SearchResultRow } from "@/lib/aspected/types.ts"

type Explanation = NonNullable<SearchResultRow["explanation"]>

/**
 * Explanation entries that contributed to the score.
 *
 * Unused / sparse-omitted aspects arrive without `distance` and are dropped
 * so inspect views stay focused on what actually ranked the result.
 */
export function usedExplanation(
  explanation: SearchResultRow["explanation"],
): Explanation {
  return (explanation ?? []).filter((entry) => entry.distance !== undefined)
}
