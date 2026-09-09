import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { TunedConfig } from "@/lib/aspected/tuned-config.ts"
import {
  serializeTunedConfig,
  tunedConfigFilename,
} from "@/lib/aspected/tuned-config.ts"

/** Props for {@link AutoTuneHistory}. */
export type AutoTuneHistoryProps = {
  configs: TunedConfig[]
  onApply: (config: TunedConfig) => void
  onDelete: (id: string) => void
}

/**
 * Saved tuned configs for this index.
 */
export function AutoTuneHistory({
  configs,
  onApply,
  onDelete,
}: AutoTuneHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved configs</CardTitle>
        <CardDescription>
          Re-apply a past champion onto the weight map, or export JSON for your
          repo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        {configs.length === 0
          ? (
            <p className="text-sm text-muted-foreground">
              No saved configs for this index yet.
            </p>
          )
          : (
            <ul className="grid gap-3">
              {configs.map((config) => (
                <li
                  key={config.id}
                  className="grid min-w-0 gap-2 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="grid min-w-0 gap-1">
                      <p className="text-sm font-medium">{config.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {config.goldenSetName} · {config.primaryMetric}{" "}
                        {config.trainPrimary.toFixed(3)}
                        {config.holdoutPrimary !== null
                          ? ` · holdout ${config.holdoutPrimary.toFixed(3)}`
                          : ""}
                        {" · "}
                        {new Date(config.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onApply(config)}
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => downloadConfig(config)}
                      >
                        Export
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(config.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <ul className="grid gap-0.5 font-mono text-xs text-muted-foreground">
                    {Object.entries(config.weights)
                      .filter(([, weight]) => weight !== 1)
                      .map(([name, weight]) => (
                        <li key={name}>
                          {name}: {weight}
                        </li>
                      ))}
                    <li>fetchK: {config.fetchK}</li>
                  </ul>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  )
}

function downloadConfig(config: TunedConfig) {
  const blob = new Blob([serializeTunedConfig(config)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = tunedConfigFilename(config)
  anchor.click()
  URL.revokeObjectURL(url)
}
