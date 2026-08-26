import { createBrowserRouter, RouterProvider } from "react-router"
import { AppShell } from "@/components/app-shell.tsx"
import { IndexLayout } from "@/components/index-layout.tsx"
import { ConnectionProvider } from "@/hooks/use-connection.tsx"
import { CreateIndexPage } from "@/pages/create-index-page.tsx"
import { IndexDocsPage } from "@/pages/index-docs-page.tsx"
import { IndexSchemaPage } from "@/pages/index-schema-page.tsx"
import { IndexSearchPage } from "@/pages/index-search-page.tsx"
import { IndexesPage } from "@/pages/indexes-page.tsx"

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
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
        ],
      },
    ],
  },
])

/** Studio root: connection provider plus React Router 7 routes. */
export function App() {
  return (
    <ConnectionProvider>
      <RouterProvider router={router} />
    </ConnectionProvider>
  )
}

export default App
