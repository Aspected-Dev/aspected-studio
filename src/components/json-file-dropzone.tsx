import {
  type DragEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react"
import { FileJsonIcon } from "lucide-react"
import { cn } from "@/lib/utils.ts"

/** True when the drag payload includes files (not text or HTML alone). */
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files")
}

/** True when the file looks like JSON by MIME type or `.json` extension. */
export function isJsonFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return file.type === "application/json" ||
    file.type === "text/json" ||
    name.endsWith(".json")
}

/**
 * Puts a file onto a file input so the control shows the chosen name, matching
 * a manual pick from the file explorer.
 */
export function assignFileToInput(
  input: HTMLInputElement | null,
  file: File,
): void {
  if (!input) {
    return
  }
  if (typeof DataTransfer !== "undefined") {
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    return
  }
  // jsdom has no DataTransfer; still expose a FileList-shaped value for tests.
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file] as unknown as FileList,
  })
}

export type JsonFileDropzoneProps = {
  /**
   * Region that stays visible above the dashed overlay (for example a sheet
   * title and description). File drags over this region still activate the
   * overlay on `children`.
   */
  header?: ReactNode
  /** Idle content under the overlay (file picker, editor, footer, and so on). */
  children: ReactNode
  /** Called with the first dropped JSON file. */
  onFile: (file: File) => void
  /**
   * Called when a dropped file is not JSON. Defaults to a no-op so the host
   * can toast or ignore.
   */
  onReject?: (file: File) => void
  /** Copy shown inside the dashed overlay while a file is held over. */
  label?: string
  /** Optional secondary line under `label`. */
  hint?: string
  className?: string
}

/**
 * Drop target for JSON files with clear hover feedback.
 *
 * Dragging a file anywhere over the surface (including `header`) shows a
 * dashed overlay on `children` only, so titles and subtitles stay readable.
 * The overlay uses the same inset on every side so it sits just under the
 * header without a larger top gap.
 */
export function JsonFileDropzone({
  header,
  children,
  onFile,
  onReject,
  label = "Drop JSON file",
  hint = "Release to load it into the editor",
  className,
}: JsonFileDropzoneProps) {
  const depthRef = useRef(0)
  const [active, setActive] = useState(false)

  const clear = useCallback(() => {
    depthRef.current = 0
    setActive(false)
  }, [])

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    depthRef.current += 1
    setActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    depthRef.current = Math.max(0, depthRef.current - 1)
    if (depthRef.current === 0) {
      setActive(false)
    }
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    clear()
    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }
    if (!isJsonFile(file)) {
      onReject?.(file)
      return
    }
    onFile(file)
  }

  return (
    <div
      data-slot="json-file-dropzone"
      data-active={active ? "true" : undefined}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {header}
      <div className="relative mx-4 mb-4 min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col gap-4">
          {children}
        </div>
        {active
          ? (
            <div
              data-slot="json-file-dropzone-overlay"
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3",
                "rounded-xl border-2 border-dashed border-primary",
                "bg-popover/92 shadow-[inset_0_0_0_1px] shadow-primary/15",
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileJsonIcon className="size-6" strokeWidth={1.75} />
              </div>
              <div className="grid gap-1 px-6 text-center">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {hint
                  ? (
                    <p className="text-xs text-muted-foreground">
                      {hint}
                    </p>
                  )
                  : null}
              </div>
            </div>
          )
          : null}
      </div>
    </div>
  )
}
