import { isRouteErrorResponse, Link, useRouteError } from "react-router"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"

/**
 * Root router error boundary for unexpected route failures.
 */
export function RouteErrorPage() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong"
  const detail = isRouteErrorResponse(error)
    ? (typeof error.data === "string" ? error.data : null)
    : error instanceof Error
    ? error.message
    : null

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlertIcon
        className="size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {detail
          ? <p className="text-sm text-muted-foreground">{detail}</p>
          : (
            <p className="text-muted-foreground">
              Studio hit an unexpected error while loading this page.
            </p>
          )}
      </div>
      <Button nativeButton={false} render={<Link to="/" />}>
        Back to indexes
      </Button>
    </div>
  )
}
