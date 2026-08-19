import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { DocsHelpIcon, DocsTextLink, PageDocsButton } from "./docs-help.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { DOCS_HASH, DOCS_PAGES, docsUrl } from "@/lib/docs.ts";

function wrap(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("docs help controls", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens a docs page from the help icon", () => {
    wrap(
      <DocsHelpIcon
        page="hnsw"
        hash="m"
        label="HNSW M"
        blurb="Neighbours per insert."
      />,
    );
    const link = screen.getByRole("link", { name: "Open docs: HNSW M" });
    expect(link).toHaveAttribute("href", docsUrl("hnsw", "m"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shrinks to a compact control inside a badge", () => {
    wrap(
      <Badge>
        16 dimensions
        <DocsHelpIcon page="hnsw" label="Index dimensions" />
      </Badge>,
    );
    const link = screen.getByRole("link", {
      name: "Open docs: Index dimensions",
    });
    expect(link).toHaveAttribute("data-docs-help", "");
    expect(link.className).toContain("in-data-[slot=badge]:size-4");
    expect(link.closest("[data-slot=badge]")?.className).toContain(
      "has-[[data-docs-help]]:pr-0.5",
    );
  });

  it("renders an inline docs text link", () => {
    wrap(
      <DocsTextLink page="gettingStarted">Getting started</DocsTextLink>,
    );
    expect(screen.getByRole("link", { name: /Getting started/ }))
      .toHaveAttribute("href", docsUrl("gettingStarted"));
  });

  it("renders a page Docs button", () => {
    wrap(<PageDocsButton page="resolvers" />);
    const link = screen.getByRole("button", { name: "Docs" });
    expect(link).toHaveAttribute("href", docsUrl("resolvers"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a catalog blurb on the page Docs button", async () => {
    const user = userEvent.setup();
    wrap(<PageDocsButton page="resolvers" />);
    await user.hover(screen.getByRole("button", { name: "Docs" }));
    expect(await screen.findByText(DOCS_PAGES.resolvers.blurb)).toBeVisible();
  });

  it("shows the HNSW catalog blurb on the HNSW docs button", async () => {
    const user = userEvent.setup();
    wrap(<PageDocsButton page="hnsw" label="HNSW docs" />);
    await user.hover(screen.getByRole("button", { name: "HNSW docs" }));
    expect(await screen.findByText(DOCS_PAGES.hnsw.blurb)).toBeVisible();
  });

  it("can target a heading hash", () => {
    wrap(
      <PageDocsButton
        page="tutorial"
        hash={DOCS_HASH.tutorialTrain}
        label="Train docs"
      />,
    );
    expect(screen.getByRole("button", { name: "Train docs" })).toHaveAttribute(
      "href",
      docsUrl("tutorial", DOCS_HASH.tutorialTrain),
    );
  });
});
