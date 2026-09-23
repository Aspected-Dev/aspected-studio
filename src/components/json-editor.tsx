import { useEffect, useRef, useState } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "@/components/theme-provider.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx"
import { jsonEditorFitHeight } from "@/lib/json-editor-height.ts"
import { configureMonaco, monaco } from "@/lib/monaco.ts"
import {
  aspectedMonacoTheme,
  defineAspectedThemes,
} from "@/lib/monaco-theme.ts"
import { cn } from "@/lib/utils.ts"

configureMonaco()

const READ_ONLY_MIN_HEIGHT = 40
const EDITABLE_MIN_HEIGHT = 160
const DEFAULT_MAX_HEIGHT = 560

/** Languages the Studio Monaco wrapper supports. */
export type JsonEditorLanguage = "json" | "shell"

/** Props for the theme-aware Monaco editor. */
export type JsonEditorProps = {
  /** Text shown in the editor. */
  value: string
  /** Called when the user edits. Ignored when `readOnly` is true. */
  onChange?: (value: string) => void
  /** When true, the editor cannot be edited and shows a copy control. */
  readOnly?: boolean
  /** Monaco language mode. Defaults to JSON. */
  language?: JsonEditorLanguage
  /** Optional class names for the editor wrapper. */
  className?: string
  /**
   * When true, the editor height tracks the content. Defaults to true.
   * Set false to use a fixed `height`.
   */
  fitContent?: boolean
  /** Fixed CSS height when `fitContent` is false. */
  height?: string
  /** Minimum pixel height when fitting content. */
  minHeight?: number
  /** Maximum pixel height when fitting content. Overflow scrolls. */
  maxHeight?: number
}

/**
 * Theme-aware Monaco editor for JSON and shell snippets.
 *
 * Uses Studio's `aspected-light` / `aspected-dark` themes so the editor chrome
 * matches shadcn cards instead of stock VS Code colors. Read-only instances
 * show a copy button in the top-right corner.
 *
 * Default `fitContent` sizes the editor to its text. For a flex parent that
 * should claim remaining height, set `fitContent={false}`, `height="100%"`,
 * and `className="min-h-0 flex-1"`.
 */
export function JsonEditor({
  value,
  onChange,
  readOnly = false,
  language = "json",
  className,
  fitContent = true,
  height = "240px",
  minHeight,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const min = minHeight ??
    (readOnly ? READ_ONLY_MIN_HEIGHT : EDITABLE_MIN_HEIGHT)
  const [fittedHeight, setFittedHeight] = useState(() =>
    jsonEditorFitHeight(value, { min, max: maxHeight })
  )
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
    : theme
  const monacoTheme = aspectedMonacoTheme(resolved)

  useEffect(() => {
    if (!fitContent) {
      return
    }
    setFittedHeight(jsonEditorFitHeight(value, { min, max: maxHeight }))
  }, [fitContent, maxHeight, min, value])

  useEffect(() => {
    defineAspectedThemes(monaco)
    monaco.editor.setTheme(monacoTheme)
  }, [monacoTheme])

  const onMount: OnMount = (editor) => {
    defineAspectedThemes(monaco)
    monaco.editor.setTheme(monacoTheme)

    const layoutToContainer = () => {
      const container = containerRef.current
      if (!container) {
        return
      }
      const width = container.clientWidth
      if (!width) {
        return
      }
      if (fitContent) {
        const next = Math.min(
          maxHeight,
          Math.max(min, editor.getContentHeight()),
        )
        setFittedHeight((current) => current === next ? current : next)
        editor.layout({ width, height: next })
        return
      }
      const next = container.clientHeight
      if (next > 0) {
        editor.layout({ width, height: next })
      }
    }

    layoutToContainer()
    editor.onDidContentSizeChange(layoutToContainer)
    const observer = new ResizeObserver(layoutToContainer)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    editor.onDidDispose(() => observer.disconnect())
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card",
        "[&_.monaco-editor]:max-w-full [&_.overflow-guard]:max-w-full",
        !fitContent && "h-full min-h-0",
        className,
      )}
    >
      {readOnly
        ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    className="absolute top-2 right-2 z-10 border border-border/80 bg-card/90 shadow-sm backdrop-blur-sm"
                    aria-label="Copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(value)
                      toast.success("Copied")
                    }}
                  />
                }
              >
                <CopyIcon />
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
        : null}
      <Editor
        width="100%"
        height={fitContent ? fittedHeight : height}
        language={language}
        theme={monacoTheme}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={onMount}
        options={{
          readOnly,
          domReadOnly: readOnly,
          minimap: { enabled: false },
          glyphMargin: false,
          fontSize: 13,
          lineHeight: 19,
          // Leave room for the copy control on read-only editors.
          padding: { top: 8, bottom: 8 },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          wrappingIndent: "indent",
          automaticLayout: true,
          tabSize: 2,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: !fitContent || fittedHeight >= maxHeight
              ? "auto"
              : "hidden",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </div>
  )
}
