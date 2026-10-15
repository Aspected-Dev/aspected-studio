import { Link } from "react-router"
import { FileQuestionIcon } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"

/**
 * Catch-all route when the URL does not match any Studio page.
 */
export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <FileQuestionIcon
        className="size-10 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground">
          That route does not exist in Aspected Studio.
        </p>
      </div>
      <Button nativeButton={false} render={<Link to="/" />}>
        Back to indexes
      </Button>
    </div>
  )
}
