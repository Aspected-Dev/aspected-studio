import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"

let configured = false

/**
 * Bundles Monaco from `node_modules` instead of loading the CDN copy.
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
}
