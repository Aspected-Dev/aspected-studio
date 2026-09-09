import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import type { TunedConfig } from "@/lib/aspected/tuned-config.ts"

/** Props for {@link TunedConfigLoader}. */
export type TunedConfigLoaderProps = {
  configs: TunedConfig[]
  onLoad: (config: TunedConfig) => void
  disabled?: boolean
}

/**
 * Compact select that applies a saved tuned config's weights.
 */
export function TunedConfigLoader({
  configs,
  onLoad,
  disabled,
}: TunedConfigLoaderProps) {
  if (configs.length === 0) {
    return null
  }

  return (
    <Select
      value={null}
      items={Object.fromEntries(
        configs.map((item) => [item.id, item.name]),
      )}
      onValueChange={(next) => {
        if (typeof next !== "string") {
          return
        }
        const found = configs.find((item) => item.id === next)
        if (found) {
          onLoad(found)
        }
      }}
    >
      <SelectTrigger
        className="w-52"
        aria-label="Load tuned config"
        disabled={disabled}
      >
        <SelectValue placeholder="Load tuned config" />
      </SelectTrigger>
      <SelectContent>
        {configs.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
