import { type ComponentPropsWithoutRef, useState } from "react"
import { CircleHelpIcon, LifeBuoyIcon, SettingsIcon } from "lucide-react"
import { DocsHelpMenu } from "@/components/docs-help-menu.tsx"
import { SettingsDialog } from "@/components/settings-dialog.tsx"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx"

/**
 * Utility links below the main Studio navigation (dashboard-01 NavSecondary
 * pattern): Settings, Get help, and Support.
 */
export function NavSecondary({
  ...props
}: ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { isMobile } = useSidebar()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <>
      <SidebarGroup {...props}>
        <SidebarGroupLabel>General</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DocsHelpMenu
                side={isMobile ? "bottom" : "right"}
                align="end"
                trigger={<SidebarMenuButton tooltip="Get help" />}
              >
                <CircleHelpIcon />
                <span>Get help</span>
              </DocsHelpMenu>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Support"
                render={<a href="#" />}
              >
                <LifeBuoyIcon />
                <span>Support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
