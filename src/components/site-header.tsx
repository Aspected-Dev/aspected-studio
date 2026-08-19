import React, { useEffect } from "react";
import { useLocation } from "react-router";
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
} from "lucide-react";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { useConnection } from "@/hooks/use-connection.tsx";
import { docsTargetForLocation } from "@/lib/app-nav.ts";
import { DOCS_MENU, DOCS_PAGES, openDocs } from "@/lib/docs.ts";

const DOCS_PAGE_ICONS: Partial<
  Record<import("@/lib/docs.ts").DocsPage, React.ReactNode>
> = {
  gettingStarted: <RocketIcon />,
  tutorial: <GraduationCapIcon />,
  resolvers: <LayersIcon />,
  hnsw: <NetworkIcon />,
  accessControl: <KeyRoundIcon />,
  security: <ShieldIcon />,
  configuration: <SettingsIcon />,
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=true], .monaco-editor, [data-testid=json-editor]",
    ),
  );
}

/**
 * Inset header with the sidebar trigger, breadcrumbs, and docs help.
 */
export function SiteHeader() {
  const { pathname } = useLocation();
  const { status } = useConnection();
  const pageDocs = docsTargetForLocation(pathname, {
    connected: Boolean(status),
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      openDocs(pageDocs.page, pageDocs.hash);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageDocs.hash, pageDocs.page]);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <AppBreadcrumbs />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="Documentation"
              />
            }
          >
            <CircleHelpIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
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
      </div>
    </header>
  );
}
