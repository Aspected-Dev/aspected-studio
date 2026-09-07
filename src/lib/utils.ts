import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges class name inputs with `clsx`, then resolves Tailwind conflicts with
 * `tailwind-merge`.
 *
 * @param inputs - Class name values accepted by `clsx`.
 * @returns A single class string safe to use in JSX.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A count with its noun, pluralised by adding `s` unless `plural` is given.
 *
 * @example
 * countLabel(1, "case") // "1 case"
 * countLabel(3, "case") // "3 cases"
 */
export function countLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Writes text to the clipboard. Callers should toast success or map failures.
 */
export async function copyToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}
