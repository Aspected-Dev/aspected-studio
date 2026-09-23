import { Input } from "@/components/ui/input.tsx"
import { Slider } from "@/components/ui/slider.tsx"
import {
  SLIDER_STEPS,
  sliderToWeight,
  weightToSlider,
} from "@/lib/aspected/playground.ts"

/** Props for {@link AspectWeightSlider}. */
export type AspectWeightSliderProps = {
  /** Aspect name used in accessible labels. */
  aspectName: string
  /** Current weight. */
  value: number
  /** Called when the slider or number input changes. */
  onChange: (next: number) => void
  /** Optional id for the number input. */
  id?: string
}

/**
 * Log-scale weight slider with a narrow number input, shared by Search and
 * Playground.
 */
export function AspectWeightSlider({
  aspectName,
  value,
  onChange,
  id,
}: AspectWeightSliderProps) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">Weight</span>
      <div className="flex items-center gap-3">
        <Slider
          className="flex-1"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={[weightToSlider(value)]}
          onValueChange={(next) =>
            onChange(sliderToWeight(Array.isArray(next) ? next[0] : next))}
          aria-label={`Weight slider for ${aspectName}`}
        />
        <Input
          id={id}
          type="number"
          step="0.1"
          min="0"
          className="w-20"
          value={value}
          onChange={(event) => {
            const parsed = Number(event.target.value)
            onChange(Number.isFinite(parsed) ? parsed : 0)
          }}
          aria-label={`Weight for ${aspectName}`}
        />
      </div>
    </div>
  )
}
