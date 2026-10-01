import { useEffect } from "react"
import type React from "react"
import { useLocation } from "react-router"
import {
  BookOpenIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LayersIcon,
  NetworkIcon,
  RocketIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { docsTargetForLocation } from "@/lib/app-nav.ts"
import { DOCS_MENU, DOCS_PAGES, type DocsPage, openDocs } from "@/lib/docs.ts"

const DOCS_PAGE_ICONS: Partial<Record<DocsPage, React.ReactNode>> = {
  gettingStarted: <RocketIcon />,
  tutorial: <GraduationCapIcon />,
  resolvers: <LayersIcon />,
  hnsw: <NetworkIcon />,
  accessControl: <KeyRoundIcon />,
  security: <ShieldIcon />,
  configuration: <SettingsIcon />,
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=true], .monaco-editor, [data-testid=json-editor]",
    ),
  )
}

/**
 * Opens the docs page for the current Studio route when `?` is pressed
 * outside editable fields.
 */
export function usePageDocsShortcut() {
  const { pathname } = useLocation()
  const { status } = useConnection()
  const pageDocs = docsTargetForLocation(pathname, {
    connected: Boolean(status),
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      event.preventDefault()
      openDocs(pageDocs.page, pageDocs.hash)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pageDocs.hash, pageDocs.page])
}

type DocsHelpMenuProps = {
  /** Element merged into the dropdown trigger (e.g. SidebarMenuButton). */
  trigger: React.ReactElement
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  children?: React.ReactNode
}

/**
 * Documentation catalog dropdown used by the sidebar Get help control.
 */
export function DocsHelpMenu({
  trigger,
  side = "right",
  align = "end",
  children,
}: DocsHelpMenuProps) {
  const { pathname } = useLocation()
  const { status } = useConnection()
  const pageDocs = docsTargetForLocation(pathname, {
    connected: Boolean(status),
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        className="w-max min-w-40 whitespace-nowrap"
      >
        <DropdownMenuItem
          onClick={() => openDocs(pageDocs.page, pageDocs.hash)}
        >
          <CircleHelpIcon />
          This page
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {DOCS_MENU.map((item) => (
          <DropdownMenuItem
            key={item.page}
            onClick={() => openDocs(item.page)}
          >
            {DOCS_PAGE_ICONS[item.page]}
            {DOCS_PAGES[item.page].title}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openDocs("home")}>
          <BookOpenIcon />
          Documentation home
          <ExternalLinkIcon className="ml-auto text-muted-foreground" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
