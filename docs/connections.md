# Connections

Studio starts **disconnected**. Add a server from the sidebar or the welcome
screen, save it if you want it in the list, then click **Connect**. Refreshing
the browser does not reconnect automatically.

## Local Docker

Typical Aspected container (API only; Studio is baked in but disabled by
default):

```bash
docker run --name aspected --rm -p 8080:8080 aspected:latest
```

In Studio (Vite dev), use `http://localhost:8080`. `deno task dev` proxies
same-origin `/api` to that origin. Override the proxy target with `ASPECTED_URL`
if the server listens elsewhere.

### Bundled Studio image

Every official Aspected image includes Studio assets at `/app/studio`. Studio is
**disabled by default**. Enable it and map both ports:

```bash
docker run --rm -p 8080:8080 -p 8081:8081 \
  -e ASPECTED_SERVER_STUDIO_ENABLED=true \
  aspected:latest
```

- Studio UI: `http://localhost:8081`
- API: `http://localhost:8080`

New connections default to `http://<host>:8080` (from `/config.json` `apiPort`).
The API enables CORS automatically when Studio is enabled.

If the server sets `ASPECTED_SERVER_STATIC_API_TOKEN`, paste that value into the
**API token** field. A 401 response focuses the token field and explains that
authentication is required.

Saved connections stay in this browser’s `localStorage`.

## Remote servers

Enter the server origin and enable CORS on Aspected
(`ASPECTED_SERVER_CORS_ENABLED=true` or `server.corsEnabled`). Production builds
and `deno task preview` do **not** include the Vite proxy, so CORS or a reverse
proxy is required. Bundled Studio already enables CORS when Studio is on.

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
- Releasing Studio: [README Releasing](../README.md#releasing)
