/** Inputs used to render an equivalent curl command. */
export type CurlRequest = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

/**
 * Builds a copyable curl command for a JSON HTTP request.
 */
export function buildCurlCommand(request: CurlRequest): string {
  const parts = ["curl"];

  if (request.method.toUpperCase() !== "GET") {
    parts.push("-X", request.method.toUpperCase());
  }

  parts.push(shellQuote(request.url));

  const headers = request.headers ?? {};
  for (const [name, value] of Object.entries(headers)) {
    parts.push("-H", shellQuote(`${name}: ${value}`));
  }

  if (request.body !== undefined) {
    if (
      !Object.keys(headers).some((name) =>
        name.toLowerCase() === "content-type"
      )
    ) {
      parts.push("-H", shellQuote("Content-Type: application/json"));
    }
    parts.push("-d", shellQuote(JSON.stringify(request.body, null, 2)));
  }

  return parts.join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
