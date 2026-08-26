import { toast } from "sonner"
import { DocsTextLink } from "@/components/docs-help.tsx"
import { Button } from "@/components/ui/button.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import { buildCurlCommand } from "@/lib/aspected/curl.ts"
import type { RecordedRequest } from "@/lib/aspected/client.ts"
import { DOCS_HASH } from "@/lib/docs.ts"

type RequestInspectorProps = {
  request: RecordedRequest | null
}

/**
 * Shows the last API call as JSON plus a copyable curl command.
 */
export function RequestInspector({ request }: RequestInspectorProps) {
  if (!request) {
    return (
      <p className="text-sm text-muted-foreground">
        Submit a request to see the equivalent curl command.
      </p>
    )
  }

  const curl = buildCurlCommand({
    method: request.method,
    url: request.url.startsWith("/")
      ? `${window.location.origin}${request.url}`
      : request.url,
    headers: request.headers,
    body: request.body,
  })

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-sm">
          {request.method} {request.path}
        </p>
        <div className="flex flex-wrap gap-2">
          <DocsTextLink page="tutorial" hash={DOCS_HASH.tutorialSummary}>
            REST API
          </DocsTextLink>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(curl)
              toast.success("Copied curl")
            }}
          >
            Copy curl
          </Button>
        </div>
      </div>
      {request.body !== undefined
        ? (
          <JsonEditor
            value={JSON.stringify(request.body, null, 2)}
            readOnly
          />
        )
        : null}
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
        {curl}
      </pre>
    </div>
  )
}
