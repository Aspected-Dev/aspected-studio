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
 * Writes text to the clipboard. Callers should toast success or map failures.
 */
export async function copyToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
}
