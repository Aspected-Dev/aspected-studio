import { afterEach, describe, expect, it, vi } from "vitest";
import { AspectedApiError, AspectedClient } from "./client.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AspectedClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls the Vite proxy and sends a Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        version: "0.3.0",
        uptime: "0w 0d 0h 1m 2s",
        config: {
          corsEnabled: false,
          httpsEnabled: false,
          tokenAuthEnabled: true,
        },
        time: 1.2,
        status: "OK",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new AspectedClient({
      baseUrl: "http://localhost:8080",
      apiToken: "secret",
    });
    const status = await client.getStatus();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/status");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret",
    );
    expect(status.version).toBe("0.3.0");
    expect(status.config.tokenAuthEnabled).toBe(true);
  });

  it("uses an absolute URL for a custom origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        total: 0,
        page: 1,
        limit: 100,
        data: [],
        status: "OK",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new AspectedClient({
      baseUrl: "https://aspected.example:9090",
      apiToken: "",
    });
    await client.listIndexes();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://aspected.example:9090/indexes?page=1&limit=100");
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("throws AspectedApiError from an error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Index not found" }, 404),
      ),
    );

    const client = new AspectedClient({
      baseUrl: "http://localhost:8080",
      apiToken: "",
    });

    await expect(client.getIndex("missing")).rejects.toMatchObject(
      {
        name: "AspectedApiError",
        message: "Index not found",
        status: 404,
      } satisfies Partial<AspectedApiError>,
    );
  });

  it("wraps a network failure as AspectedApiError with status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const client = new AspectedClient({
      baseUrl: "http://localhost:8080",
      apiToken: "",
    });

    await expect(client.listIndexes()).rejects.toMatchObject(
      {
        name: "AspectedApiError",
        message: "Failed to fetch",
        status: 0,
      } satisfies Partial<AspectedApiError>,
    );
  });

  it("calls onNetworkError when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const onNetworkError = vi.fn();
    const client = new AspectedClient(
      { baseUrl: "http://localhost:8080", apiToken: "" },
      { onNetworkError },
    );

    await expect(client.listIndexes()).rejects.toThrow();
    expect(onNetworkError).toHaveBeenCalledOnce();
  });

  it("does NOT call onNetworkError for HTTP error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Index not found" }, 404),
      ),
    );
    const onNetworkError = vi.fn();
    const client = new AspectedClient(
      { baseUrl: "http://localhost:8080", apiToken: "" },
      { onNetworkError },
    );

    await expect(client.getIndex("missing")).rejects.toMatchObject({
      status: 404,
    });
    expect(onNetworkError).not.toHaveBeenCalled();
  });
});
