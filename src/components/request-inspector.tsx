import { useState } from "react"
import { CodeIcon } from "lucide-react"
import { DocsHelpIcon, DocsTextLink } from "@/components/docs-help.tsx"
import { JsonEditor } from "@/components/json-editor.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import { buildCurlCommand } from "@/lib/aspected/curl.ts"
import type { RecordedRequest } from "@/lib/aspected/client.ts"
import { DOCS_HASH } from "@/lib/docs.ts"

/** Props for {@link RequestInspector}. */
export type RequestInspectorProps = {
  request: RecordedRequest | null
  /**
   * Editor height budget. `compact` caps the body preview at 240px for dense
   * pages like the Playground. Defaults to `default` (560px).
   */
  density?: "default" | "compact"
}

const BODY_MAX_HEIGHT = {
  default: 560,
  compact: 240,
} as const

/**
 * Shows the last API call as a REST strip with a read-only JSON body.
 *
 * Curl lives behind the Code sheet so the page is not cluttered with a second
 * dump of the same payload. Copy actions live on the read-only Monaco editors.
 */
export function RequestInspector({
  request,
  density = "default",
}: RequestInspectorProps) {
  const [codeOpen, setCodeOpen] = useState(false)
  const bodyMaxHeight = BODY_MAX_HEIGHT[density]
  const bodyJson = request?.body === undefined
    ? null
    : JSON.stringify(request.body, null, 2)

  const curl = request
    ? buildCurlCommand({
      method: request.method,
      url: request.url.startsWith("/")
        ? `${window.location.origin}${request.url}`
        : request.url,
      headers: request.headers,
      body: request.body,
    })
    : ""

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="shrink-0">Request</CardTitle>
          {request
            ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="font-mono uppercase pt-1.25 h-6 rounded-md"
                  >
                    {request.method}
                  </Badge>
                  <span className="min-w-0 truncate font-mono text-sm leading-none mt-0.5">
                    {request.path}
                  </span>
                  <DocsHelpIcon
                    page="tutorial"
                    hash={DOCS_HASH.tutorialSummary}
                    label="REST API"
                    blurb="Open the Aspected REST tutorial summary."
                    size="icon-sm"
                  />
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCodeOpen(true)}
                  >
                    <CodeIcon />
                    <span className="mt-px">Code</span>
                  </Button>
                </div>
              </div>
            )
            : null}
        </CardHeader>
        <CardContent>
          {request === null
            ? (
              <p className="text-sm text-muted-foreground">
                Run a request to inspect it.
              </p>
            )
            : bodyJson === null
            ? <p className="text-sm text-muted-foreground">No body.</p>
            : (
              <JsonEditor
                value={bodyJson}
                readOnly
                maxHeight={bodyMaxHeight}
              />
            )}
        </CardContent>
      </Card>

      <Sheet open={codeOpen} onOpenChange={setCodeOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>Code</SheetTitle>
            <SheetDescription>
              curl for this request. Copy it into a terminal or paste it into
              docs.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {request
              ? (
                <JsonEditor
                  value={curl}
                  language="shell"
                  readOnly
                  maxHeight={480}
                />
              )
              : null}
          </div>
          <SheetFooter>
            <DocsTextLink page="tutorial" hash={DOCS_HASH.tutorialSummary}>
              REST API docs
            </DocsTextLink>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
