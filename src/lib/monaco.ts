import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import { defineAspectedThemes } from "@/lib/monaco-theme.ts"

let configured = false

/**
 * Bundles Monaco from `node_modules` instead of loading the CDN copy, and
 * registers Studio's shadcn-colored themes.
 */
export function configureMonaco(): void {
  if (configured) {
    return
  }

  configured = true

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "json") {
        return new Worker(
          new URL(
            "monaco-editor/language/json/json.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        )
      }

      return new Worker(
        new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
        { type: "module" },
      )
    },
  }

  loader.config({ monaco })
  defineAspectedThemes(monaco)
}

/** Monaco API used by editors that need to refresh the Studio theme. */
export { monaco }
