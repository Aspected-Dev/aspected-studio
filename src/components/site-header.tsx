import { AppBreadcrumbs } from "@/components/app-breadcrumbs.tsx"
import { usePageDocsShortcut } from "@/components/docs-help-menu.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { SidebarTrigger } from "@/components/ui/sidebar.tsx"

/**
 * Inset header with the sidebar trigger and breadcrumbs.
 * Page docs shortcut (`?`) stays here; Get help lives in the sidebar.
 */
export function SiteHeader() {
  usePageDocsShortcut()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <AppBreadcrumbs />
      </div>
    </header>
  )
}
