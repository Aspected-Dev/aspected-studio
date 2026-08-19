import { describe, expect, it } from "vitest";
import { formatUptime, liveUptime, parseUptimeSeconds } from "./uptime.ts";

describe("parseUptimeSeconds", () => {
  it("parses the Aspected /status format", () => {
    expect(parseUptimeSeconds("0w 0d 0h 1m 2s")).toBe(62);
    expect(parseUptimeSeconds("1w 2d 3h 4m 5s")).toBe(
      7 * 24 * 60 * 60 + 2 * 24 * 60 * 60 + 3 * 60 * 60 + 4 * 60 + 5,
    );
  });

  it("returns null for an unexpected snapshot", () => {
    expect(parseUptimeSeconds("1s")).toBeNull();
    expect(parseUptimeSeconds("")).toBeNull();
  });
});

describe("formatUptime", () => {
  it("matches the Aspected /status format", () => {
    expect(formatUptime(62)).toBe("0w 0d 0h 1m 2s");
    expect(formatUptime(7 * 24 * 60 * 60)).toBe("1w 0d 0h 0m 0s");
  });
});

describe("liveUptime", () => {
  it("adds elapsed seconds since the snapshot was received", () => {
    expect(liveUptime("0w 0d 0h 1m 2s", 1_000, 4_000)).toBe("0w 0d 0h 1m 5s");
  });

  it("does not run backwards if now is before receivedAt", () => {
    expect(liveUptime("0w 0d 0h 1m 2s", 5_000, 1_000)).toBe("0w 0d 0h 1m 2s");
  });

  it("leaves an unparseable snapshot unchanged", () => {
    expect(liveUptime("1s", 1_000, 4_000)).toBe("1s");
  });
});
