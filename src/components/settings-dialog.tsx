import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { type Theme, useTheme } from "@/components/theme-provider.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { Label } from "@/components/ui/label.tsx"
import { cn } from "@/lib/utils.ts"
import { openDocs } from "@/lib/docs.ts"

const THEME_OPTIONS: {
  value: Theme
  label: string
  icon: typeof SunIcon
}[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
]

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Studio preferences dialog. Appearance theme persists via ThemeProvider.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance and shortcuts for Aspected Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label id="settings-theme-label">Appearance</Label>
            <div
              role="radiogroup"
              aria-labelledby="settings-theme-label"
              className="grid grid-cols-3 gap-2"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                const selected = theme === option.value
                return (
                  <Button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    variant={selected ? "default" : "outline"}
                    className={cn("h-auto flex-col gap-1.5 py-3")}
                    onClick={() => setTheme(option.value)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {option.label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Keyboard shortcuts</p>
            <ul className="grid gap-1 text-muted-foreground">
              <li>
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">
                  D
                </kbd>{" "}
                Toggle light and dark
              </li>
              <li>
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground">
                  ?
                </kbd>{" "}
                Docs for this page
              </li>
            </ul>
          </div>

          <Button
            type="button"
            variant="link"
            className="h-auto justify-start px-0"
            onClick={() => openDocs("home")}
          >
            Open documentation home
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
