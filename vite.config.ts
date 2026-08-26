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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Replace import.meta.env.VITE_DOCS_LOCAL at build time so the bundle
    // does not contain a runtime env lookup that would always resolve to
    // undefined outside Vite.
    "import.meta.env.VITE_DOCS_LOCAL": JSON.stringify(docsLocal),
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
  },
})
