const UPTIME_PATTERN = /^(\d+)w (\d+)d (\d+)h (\d+)m (\d+)s$/;

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
const MINUTE_SECONDS = 60;

/**
 * Parses an Aspected `/status` uptime string into whole seconds.
 * Returns null when the snapshot is not `Nw Nd Nh Nm Ns`.
 */
export function parseUptimeSeconds(uptime: string): number | null {
  const match = UPTIME_PATTERN.exec(uptime);
  if (!match) {
    return null;
  }

  const weeks = Number(match[1]);
  const days = Number(match[2]);
  const hours = Number(match[3]);
  const minutes = Number(match[4]);
  const seconds = Number(match[5]);
  return weeks * WEEK_SECONDS + days * DAY_SECONDS + hours * HOUR_SECONDS +
    minutes * MINUTE_SECONDS + seconds;
}

/**
 * Formats whole seconds as Aspected `/status` uptime.
 */
export function formatUptime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const weeks = Math.floor(safe / WEEK_SECONDS);
  let rest = safe - weeks * WEEK_SECONDS;
  const days = Math.floor(rest / DAY_SECONDS);
  rest -= days * DAY_SECONDS;
  const hours = Math.floor(rest / HOUR_SECONDS);
  rest -= hours * HOUR_SECONDS;
  const minutes = Math.floor(rest / MINUTE_SECONDS);
  const seconds = rest - minutes * MINUTE_SECONDS;
  return `${weeks}w ${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Advances a `/status` uptime snapshot by elapsed wall time since it was
 * received. Unparseable snapshots are returned unchanged.
 */
export function liveUptime(
  snapshot: string,
  receivedAt: number,
  now: number,
): string {
  const base = parseUptimeSeconds(snapshot);
  if (base === null) {
    return snapshot;
  }

  const elapsed = Math.max(0, Math.floor((now - receivedAt) / 1000));
  return formatUptime(base + elapsed);
}
