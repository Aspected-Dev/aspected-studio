import type { CSSProperties } from "react";
import { Outlet } from "react-router";
import { AppSidebar } from "@/components/app-sidebar.tsx";
import { ConnectionDialogProvider } from "@/components/connection-dialog.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { useConnection } from "@/hooks/use-connection.tsx";
import { WelcomePage } from "@/pages/welcome-page.tsx";

/**
 * Shared chrome: inset sidebar with saved connections, breadcrumbs, and
 * either the welcome screen or the current Studio page.
 */
export function AppShell() {
  const { status } = useConnection();

  return (
    <ConnectionDialogProvider>
      <SidebarProvider
        style={{
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties}
      >
        <AppSidebar variant="inset" />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <SiteHeader />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="@container/main flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
                {status ? <Outlet /> : <WelcomePage />}
              </div>
            </div>
          </div>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </ConnectionDialogProvider>
  );
}
