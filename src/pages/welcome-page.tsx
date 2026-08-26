import { PlusIcon } from "lucide-react"
import { InstantAnalysisIllustration } from "@/assets/instant-analysis.tsx"
import { useConnectionDialog } from "@/components/connection-dialog.tsx"
import { DocsTextLink } from "@/components/docs-help.tsx"
import { Button } from "@/components/ui/button.tsx"

/**
 * Centered landing screen shown until the user connects to a server.
 */
export function WelcomePage() {
  const { openNew } = useConnectionDialog()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
      <InstantAnalysisIllustration className="max-w-sm text-primary" />
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Aspected Studio
        </h1>
        <p className="text-muted-foreground">
          Connect to an Aspected server, or add one to the saved list, to browse
          indexes. The default Docker port is 8080.
        </p>
        <p className="text-sm text-muted-foreground">
          <DocsTextLink page="gettingStarted">Getting started</DocsTextLink>
          {" "}
          and the <DocsTextLink page="tutorial">tutorial</DocsTextLink>{" "}
          cover running the server and creating a first index.
        </p>
      </div>
      <Button type="button" onClick={openNew}>
        <PlusIcon data-icon="inline-start" />
        Add new connection
      </Button>
    </div>
  )
}
