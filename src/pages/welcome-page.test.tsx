import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomePage } from "./welcome-page.tsx";
import { docsUrl } from "@/lib/docs.ts";

const openNew = vi.fn();

vi.mock("@/components/connection-dialog.tsx", () => ({
  useConnectionDialog: () => ({
    openNew,
    openEdit: vi.fn(),
  }),
}));

describe("WelcomePage", () => {
  afterEach(() => {
    cleanup();
    openNew.mockReset();
  });

  it("prompts the user to add a connection", async () => {
    const user = userEvent.setup();
    render(<WelcomePage />);
    expect(
      screen.getByRole("heading", { name: "Welcome to Aspected Studio" }),
    ).toBeInTheDocument();
    const addButton = screen.getByRole("button", {
      name: "Add new connection",
    });
    expect(addButton.querySelector("svg")).toBeInTheDocument();
    await user.click(addButton);
    expect(openNew).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Getting started/ }))
      .toHaveAttribute("href", docsUrl("gettingStarted"));
    expect(screen.getByRole("link", { name: /tutorial/ }))
      .toHaveAttribute("href", docsUrl("tutorial"));
  });
});
