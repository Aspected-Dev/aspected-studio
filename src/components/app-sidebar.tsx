import type { ComponentProps } from "react"
import { Link, useLocation } from "react-router"
import {
  BracesIcon,
  CirclePlusIcon,
  DatabaseIcon,
  FileTextIcon,
  LayoutListIcon,
  SearchIcon,
} from "lucide-react"
import { ConnectionFooter } from "@/components/connection-footer.tsx"
import { NavSecondary } from "@/components/nav-secondary.tsx"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar.tsx"
import { useConnection } from "@/hooks/use-connection.tsx"
import { indexPath, parseStudioLocation } from "@/lib/app-nav.ts"

/**
 * Dashboard-style sidebar: Studio screens when connected, then utility links
 * and saved connections in the content area.
 */
export function AppSidebar(
  props: ComponentProps<typeof Sidebar>,
) {
  const { pathname } = useLocation()
  const location = parseStudioLocation(pathname)
  const indexName = location.kind === "index" ? location.name : undefined
  const { status } = useConnection()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link to="/" />}
            >
              <DatabaseIcon className="size-5!" />
              <span className="text-base font-semibold">Aspected Studio</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {status
          ? (
            <SidebarGroup>
              <SidebarGroupContent className="flex flex-col gap-2">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Create index"
                      isActive={location.kind === "create"}
                      className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                      render={<Link to="/indexes/new" />}
                    >
                      <CirclePlusIcon />
                      <span>Create index</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Indexes"
                      isActive={location.kind === "indexes"}
                      render={<Link to="/" />}
                    >
                      <LayoutListIcon />
                      <span>Indexes</span>
                    </SidebarMenuButton>
                    {indexName
                      ? (
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <span
                              className="flex h-7 min-w-0 -translate-x-px items-center px-2 text-xs font-medium text-sidebar-foreground/70"
                              title={indexName}
                            >
                              <span className="truncate">{indexName}</span>
                            </span>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              isActive={location.kind === "index" &&
                                location.page === "schema"}
                              render={<Link to={indexPath(indexName)} />}
                            >
                              <BracesIcon />
                              <span>Schema</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              isActive={location.kind === "index" &&
                                location.page === "docs"}
                              render={
                                <Link to={indexPath(indexName, "docs")} />
                              }
                            >
                              <FileTextIcon />
                              <span>Documents</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              isActive={location.kind === "index" &&
                                location.page === "search"}
                              render={
                                <Link to={indexPath(indexName, "search")} />
                              }
                            >
                              <SearchIcon />
                              <span>Search</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      )
                      : null}
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
          : null}
        <NavSecondary />
        <ConnectionFooter />
      </SidebarContent>
    </Sidebar>
  )
}
