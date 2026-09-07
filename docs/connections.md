# Connections

Studio starts **disconnected**. Add a server from the sidebar or the welcome
screen, save it if you want it in the list, then click **Connect**. Refreshing
the browser does not reconnect automatically.

## Local Docker

Typical Aspected container:

```bash
docker run --name aspected --rm -p 8080:8080 aspected:latest
```

In Studio, use `http://localhost:8080`. `deno task dev` proxies same-origin
`/api` to that origin. Override the proxy target with `ASPECTED_URL` if the
server listens elsewhere.

Saved connections stay in this browser’s `localStorage`.

## Remote servers

Enter the server origin and enable CORS on Aspected
(`ASPECTED_SERVER_CORS_ENABLED=true` or `server.corsEnabled`). Production builds
and `deno task preview` do **not** include the Vite proxy, so CORS or a reverse
proxy in front of `/api` is required.

If the server uses a static API token, paste it in the connection dialog. Studio
sends `Authorization: Bearer <token>`.

## Sidebar chrome

Below the main nav:

- **Settings**: appearance and shortcuts
- **Get help**: catalog of Aspected product docs (not this `/docs` tree)
- **Support**: external support link
- Connection list: host, version, and uptime after `/status` succeeds

## Status and errors

Connection health comes from the server’s `/status` (and related calls via
`AspectedClient`). User-facing failures go through shared toast helpers so API
errors stay readable.

## Related

- Index workflows after you connect: [Indexes](indexes.md)
- Setup and tasks: [README](../README.md)
