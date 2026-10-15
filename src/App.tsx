import { createBrowserRouter, RouterProvider } from "react-router"
import { AppShell } from "@/components/app-shell.tsx"
import { IndexLayout } from "@/components/index-layout.tsx"
import { ConnectionProvider } from "@/hooks/use-connection.tsx"
import { StudioConfigProvider } from "@/hooks/use-studio-config.tsx"
import { CreateIndexPage } from "@/pages/create-index-page.tsx"
import { IndexAutoTunePage } from "@/pages/index-auto-tune-page.tsx"
import { IndexDocsPage } from "@/pages/index-docs-page.tsx"
import { IndexPlaygroundPage } from "@/pages/index-playground-page.tsx"
import { IndexSchemaPage } from "@/pages/index-schema-page.tsx"
import { IndexScorecardPage } from "@/pages/index-scorecard-page.tsx"
import { IndexSearchPage } from "@/pages/index-search-page.tsx"
import { IndexesPage } from "@/pages/indexes-page.tsx"
import { NotFoundPage } from "@/pages/not-found-page.tsx"
import { RouteErrorPage } from "@/pages/route-error-page.tsx"

/** Vite `base` with trailing slash stripped for React Router. */
function routerBasename(): string | undefined {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
  const base = env?.BASE_URL ?? "/"
  if (!base || base === "/") {
    return undefined
  }
  return base.endsWith("/") ? base.slice(0, -1) : base
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AppShell />,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <IndexesPage /> },
        { path: "indexes/new", element: <CreateIndexPage /> },
        {
          path: "indexes/:name",
          element: <IndexLayout />,
          children: [
            { index: true, element: <IndexSchemaPage /> },
            { path: "docs", element: <IndexDocsPage /> },
            { path: "search", element: <IndexSearchPage /> },
            { path: "playground", element: <IndexPlaygroundPage /> },
            { path: "scorecard", element: <IndexScorecardPage /> },
            { path: "auto-tune", element: <IndexAutoTunePage /> },
          ],
        },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: routerBasename() },
)

/** Studio root: connection provider plus React Router 7 routes. */
export function App() {
  return (
    <StudioConfigProvider>
      <ConnectionProvider>
        <RouterProvider router={router} />
      </ConnectionProvider>
    </StudioConfigProvider>
  )
}

export default App
