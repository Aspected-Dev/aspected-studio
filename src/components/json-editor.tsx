import { useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "@/components/theme-provider.tsx";
import { jsonEditorFitHeight } from "@/lib/json-editor-height.ts";
import { configureMonaco } from "@/lib/monaco.ts";
import { cn } from "@/lib/utils.ts";

configureMonaco();

const READ_ONLY_MIN_HEIGHT = 40;
const EDITABLE_MIN_HEIGHT = 160;
const DEFAULT_MAX_HEIGHT = 560;

/** Props for the theme-aware JSON Monaco editor. */
export type JsonEditorProps = {
  /** JSON text shown in the editor. */
  value: string;
  /** Called when the user edits the JSON. Ignored when `readOnly` is true. */
  onChange?: (value: string) => void;
  /** When true, the editor cannot be edited. */
  readOnly?: boolean;
  /** Optional class names for the editor wrapper. */
  className?: string;
  /**
   * When true, the editor height tracks the JSON. Defaults to true.
   * Set false to use a fixed `height`.
   */
  fitContent?: boolean;
  /** Fixed CSS height when `fitContent` is false. */
  height?: string;
  /** Minimum pixel height when fitting content. */
  minHeight?: number;
  /** Maximum pixel height when fitting content. Overflow scrolls. */
  maxHeight?: number;
};

/**
 * Theme-aware Monaco editor locked to JSON.
 */
export function JsonEditor({
  value,
  onChange,
  readOnly = false,
  className,
  fitContent = true,
  height = "240px",
  minHeight,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const min = minHeight ??
    (readOnly ? READ_ONLY_MIN_HEIGHT : EDITABLE_MIN_HEIGHT);
  const [fittedHeight, setFittedHeight] = useState(() =>
    jsonEditorFitHeight(value, { min, max: maxHeight })
  );
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light")
    : theme;

  useEffect(() => {
    if (!fitContent) {
      return;
    }
    setFittedHeight(jsonEditorFitHeight(value, { min, max: maxHeight }));
  }, [fitContent, maxHeight, min, value]);

  const onMount: OnMount = (editor) => {
    const layoutToContainer = () => {
      const width = containerRef.current?.clientWidth;
      if (!width) {
        return;
      }
      if (fitContent) {
        const next = Math.min(
          maxHeight,
          Math.max(min, editor.getContentHeight()),
        );
        setFittedHeight((current) => current === next ? current : next);
        editor.layout({ width, height: next });
        return;
      }
      editor.layout({ width, height: editor.getLayoutInfo().height });
    };

    layoutToContainer();
    editor.onDidContentSizeChange(layoutToContainer);
    const observer = new ResizeObserver(layoutToContainer);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    editor.onDidDispose(() => observer.disconnect());
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-input",
        "[&_.monaco-editor]:max-w-full [&_.overflow-guard]:max-w-full",
        className,
      )}
    >
      <Editor
        width="100%"
        height={fitContent ? fittedHeight : height}
        language="json"
        theme={resolved === "dark" ? "vs-dark" : "light"}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={onMount}
        options={{
          readOnly,
          domReadOnly: readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 19,
          padding: { top: 8, bottom: 8 },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          wrappingIndent: "indent",
          automaticLayout: true,
          tabSize: 2,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: fitContent && fittedHeight >= maxHeight
              ? "auto"
              : "hidden",
            horizontal: "hidden",
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </div>
  );
}
