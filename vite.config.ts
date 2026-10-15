import path from "node:path"
import process from "node:process"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
const aspectedUrl = process.env.ASPECTED_URL ?? "http://localhost:8080"

// Propagate VITE_DOCS_LOCAL so the define below is always set at build time.
// When not provided, default to false so the production build always uses the
// live docs origin.
const docsLocal = process.env.VITE_DOCS_LOCAL === "true" ? "true" : "false"

/**
 * Production `deno task build` ships under `/studio/` for the Aspected server.
 * Dev, preview, and desktop builds stay at `/` unless STUDIO_BASE_PATH is set.
 * Desktop packaging sets STUDIO_BASE_PATH=/ explicitly.
 */
function resolveStudioBase(command: "build" | "serve"): string {
  const fromEnv = process.env.STUDIO_BASE_PATH
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv.endsWith("/") ? fromEnv : `${fromEnv}/`
  }
  return command === "build" ? "/studio/" : "/"
}

export default defineConfig(({ command }) => {
  const studioBase = resolveStudioBase(command)
  const bundled = studioBase !== "/"

  return {
    base: studioBase,
    plugins: [react(), tailwindcss()],
    define: {
      // Replace import.meta.env.VITE_DOCS_LOCAL at build time so the bundle
      // does not contain a runtime env lookup that would always resolve to
      // undefined outside Vite.
      "import.meta.env.VITE_DOCS_LOCAL": JSON.stringify(docsLocal),
      // True when the production build uses a non-root base (same-origin
      // Studio served by the Aspected process under /studio/).
      "import.meta.env.VITE_STUDIO_BUNDLED": JSON.stringify(bundled),
    },
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: aspectedUrl,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ""),
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./src/test/setup.ts"],
      // RTL + userEvent suites routinely exceed Vitest's 5s default when the
      // full suite runs in parallel on a busy machine. Also set via deno.json
      // (`--testTimeout=15000`) so the CLI always wins.
      testTimeout: 15_000,
      maxWorkers: "50%",
    },
  }
})
