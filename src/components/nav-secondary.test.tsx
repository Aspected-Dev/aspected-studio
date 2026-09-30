import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryRouter, RouterProvider } from "react-router"
import { DocsHelpMenu } from "./docs-help-menu.tsx"
import { SettingsDialog } from "./settings-dialog.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Button } from "@/components/ui/button.tsx"
import { SidebarProvider } from "@/components/ui/sidebar.tsx"
import { DOCS_MENU, DOCS_PAGES } from "@/lib/docs.ts"

const { connection } = vi.hoisted(() => ({
  connection: {
    status: { version: "0.4.1", uptime: "1s", config: {} },
  },
}))

vi.mock("@/hooks/use-connection.tsx", () => ({
  useConnection: () => connection,
}))

function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

function renderWithProviders(ui: ReactNode) {
  const router = createMemoryRouter([
    { path: "/", element: ui },
  ])
  return render(
    <ThemeProvider defaultTheme="system" storageKey="test-theme">
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

describe("DocsHelpMenu", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    stubMatchMedia()
  })

  it("lists This page, catalog entries, and Documentation home", async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 })
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    renderWithProviders(
      <DocsHelpMenu trigger={<Button type="button">Get Help</Button>}>
        Get Help
      </DocsHelpMenu>,
    )

    await user.click(screen.getByRole("button", { name: "Get Help" }))
    expect(
      await screen.findByRole("menuitem", { name: /This page/ }),
    ).toBeVisible()
    for (const item of DOCS_MENU) {
      expect(
        screen.getByRole("menuitem", { name: DOCS_PAGES[item.page].title }),
      ).toBeVisible()
    }
    expect(
      screen.getByRole("menuitem", { name: /Documentation home/ }),
    ).toBeVisible()

    await user.click(screen.getByRole("menuitem", { name: /This page/ }))
    expect(openSpy).toHaveBeenCalled()
  })
})
describe("SettingsDialog", () => {
  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove("light", "dark")
  })

  beforeEach(() => {
    stubMatchMedia()
  })

  it("sets the theme when an appearance option is chosen", async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <SettingsDialog open onOpenChange={() => {}} />,
    )

    expect(screen.getByTestId("settings-dialog")).toBeInTheDocument()

    const dark = screen.getByRole("radio", { name: "Dark" })
    await user.click(dark)
    expect(dark).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "false",
    )

    const system = screen.getByRole("radio", { name: "System" })
    await user.click(system)
    expect(system).toHaveAttribute("aria-checked", "true")
    expect(dark).toHaveAttribute("aria-checked", "false")
  })
})

describe("NavSecondary chrome via SidebarProvider", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    stubMatchMedia()
  })

  it("renders Settings, Get help, and Support", async () => {
    const { NavSecondary } = await import("./nav-secondary.tsx")
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <ThemeProvider>
            <SidebarProvider>
              <NavSecondary />
            </SidebarProvider>
          </ThemeProvider>
        ),
      },
    ])
    render(<RouterProvider router={router} />)

    expect(screen.getByText("General")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Get help" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "#",
    )
  })
})
