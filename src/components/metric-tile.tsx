import { type ReactNode } from "react"
import { CircleHelpIcon } from "lucide-react"
import { AnimatedNumber } from "@/components/animated-number.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { cn } from "@/lib/utils.ts"

/** Props for {@link MetricHelp}. */
export type MetricHelpProps = {
  /** Metric name, used for the accessible label. */
  label: string
  /** What the number is, how it is computed, and how to read it. */
  text: string
}

/**
 * Hover-only help for a metric.
 *
 * There is nothing to navigate to, so this is a plain button rather than a
 * docs link. Focus shows the same tip as hover, which keeps the explanation
 * reachable from the keyboard.
 */
export function MetricHelp({ label, text }: MetricHelpProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
                "text-muted-foreground",
              )}
              aria-label={`About ${label}`}
            />
          }
        >
          <CircleHelpIcon />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Props for {@link MetricTile}. */
export type MetricTileProps = {
  label: string
  value: number
  digits: number
  suffix?: string
  /** Sub-line under the figure, e.g. the raw counts behind a ratio. */
  detail: ReactNode
  help: string
  /**
   * Change against a baseline. Rendered beside the figure with its sign, and
   * omitted entirely when there is nothing to compare against.
   */
  delta?: number | null
}

/**
 * One summary figure with an animated value and a help tooltip.
 *
 * Shared by the Compare tab and the Scorecard so every score on screen carries
 * the same explanation affordance.
 */
export function MetricTile({
  label,
  value,
  digits,
  suffix,
  detail,
  help,
  delta = null,
}: MetricTileProps) {
  const showDelta = delta !== null && Number.isFinite(delta) &&
    Math.abs(delta) >= 10 ** -digits / 2

  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <div className="flex min-w-0 items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <MetricHelp label={label} text={help} />
      </div>
      <p className="flex items-baseline gap-2 font-mono text-lg">
        <span>
          <AnimatedNumber value={value} digits={digits} />
          {suffix ?? ""}
        </span>
        {showDelta
          ? (
            <span
              className={cn(
                "text-xs",
                delta > 0 ? "text-pass" : "text-destructive",
              )}
            >
              {delta > 0 ? "+" : "-"}
              {Math.abs(delta).toFixed(digits)}
              {suffix ?? ""}
            </span>
          )
          : null}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
