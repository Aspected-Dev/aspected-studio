import { DOCS_HASH } from "@/lib/docs.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AspectedApiError } from "./client.ts";
import { toastCaughtError, toUserFacingError } from "./user-error.ts";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

describe("toUserFacingError", () => {
  it("maps a known server 404 into a next step", () => {
    const error = toUserFacingError(
      new AspectedApiError("Index does not exist", 404),
      "Could not load indexes",
    );

    expect(error.title).toBe("Index not found");
    expect(error.description).toContain("Index does not exist");
    expect(error.description).toContain("Open Indexes");
  });

  it("maps a missing bearer token to Server settings", () => {
    const error = toUserFacingError(
      new AspectedApiError("Missing bearer token", 401),
      "Could not load indexes",
    );

    expect(error.title).toBe("Authentication required");
    expect(error.description).toContain("paste the API token");
    expect(error.docs).toEqual({
      page: "security",
      hash: DOCS_HASH.apiToken,
    });
  });

  it("maps the unlicensed index cap", () => {
    const error = toUserFacingError(
      new AspectedApiError("Maximum number of indexes reached (2/2)", 422),
      "Could not create index",
    );

    expect(error.title).toBe("Index limit reached");
    expect(error.description).toContain("Unlicensed servers allow 2 indexes");
  });

  it("maps a down proxy as unavailable", () => {
    const error = toUserFacingError(
      new AspectedApiError("Request failed with status 502", 502),
      "Could not load indexes",
    );

    expect(error.title).toBe("Aspected is unavailable");
    expect(error.description).toContain("Start Aspected");
  });

  it("maps a fetch failure to a connection hint", () => {
    const error = toUserFacingError(
      new AspectedApiError("Failed to fetch", 0),
      "Could not load indexes",
    );

    expect(error.title).toBe("Cannot reach Aspected");
    expect(error.description).toContain("Server URL");
    expect(error.docs).toEqual({ page: "gettingStarted" });
  });

  it("formats Zod issues without dumping internals as the title", () => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const error = toUserFacingError(parsed.error, "Could not create index");
    expect(error.title).toBe("Invalid input");
    expect(error.description).toContain("name");
    expect(error.description).toContain("Correct the highlighted fields");
  });

  it("explains invalid JSON", () => {
    const error = toUserFacingError(
      new SyntaxError("Unexpected token"),
      "Could not search",
    );

    expect(error.title).toBe("Invalid JSON");
    expect(error.description).toContain("commas");
  });

  it("keeps an unknown server message and adds a next step", () => {
    const error = toUserFacingError(
      new AspectedApiError(
        "Doc 'prod-001': upsert operations cannot have policies regarding missing documents.",
        400,
      ),
      "Could not save document",
    );

    expect(error.title).toBe("Could not save document");
    expect(error.description).toContain("upsert operations");
    expect(error.description).toContain("request inspector");
  });

  it("points dictionary license errors at the resolver docs", () => {
    const error = toUserFacingError(
      new AspectedApiError("Dictionary resolver requires a license", 403),
      "Could not create index",
    );
    expect(error.title).toBe("License required");
    expect(error.docs).toEqual({ page: "resolverDict" });
  });
});

describe("toastCaughtError", () => {
  afterEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("reuses one toast id for identical copy", () => {
    const caught = new AspectedApiError("Failed to fetch", 0);
    toastCaughtError(caught, "Could not load indexes");
    toastCaughtError(caught, "Could not load documents");

    expect(toast.error).toHaveBeenCalledTimes(2);
    const firstId = vi.mocked(toast.error).mock.calls[0]?.[1]?.id;
    const secondId = vi.mocked(toast.error).mock.calls[1]?.[1]?.id;
    expect(firstId).toEqual(secondId);
    expect(firstId).toBeTruthy();
  });
});
