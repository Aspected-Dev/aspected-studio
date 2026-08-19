# Aspected Studio

Web UI for browsing and working with **Aspected**, a vector database. The MVP is
a Vite + React app managed with Deno. Desktop packaging (`deno desktop`) and
shipping alongside the Aspected Docker image come after the web MVP.

Agents: start with [`AGENTS.md`](AGENTS.md) and follow `.cursor/rules`.

## Stack

- Deno (package manager, tasks, lint, fmt, typecheck)
- Vite + React + TypeScript
- React Router 7
- Zod v4
- TanStack Table v9
- Monaco Editor for JSON
- shadcn/ui + Tailwind CSS v4
- Vitest + Testing Library

## Setup

```bash
deno install
git config core.hooksPath .githooks
```

The git hooks path is local to this repo. Pre-commit runs format and lint only.

## Run against Aspected

Start the Aspected HTTP server first, for example:

```bash
docker run --name aspected --rm -p 8080:8080 aspected:latest
```

Then start Studio:

```bash
deno task dev
```

`deno task dev` proxies same-origin `/api` to `http://localhost:8080`. Override
the proxy target with `ASPECTED_URL` if the server is on another local port.

Studio starts disconnected. Add a server from the sidebar or the welcome screen,
save it if you want it in the list, then click Connect. A local Docker server is
`http://localhost:8080` and uses the Vite `/api` proxy. The sidebar footer shows
the host, version, and uptime after `/status` succeeds. For a remote instance,
enter its origin and enable CORS on the server
(`ASPECTED_SERVER_CORS_ENABLED=true` or `server.corsEnabled`). If the server
uses a static API token, paste it in the connection dialog. Studio sends
`Authorization: Bearer <token>`. Saved connections stay in this browser.
Refreshing Studio does not reconnect automatically.

Create an index, upload documents to train it, then search. Schema is set at
create time and is read-only afterwards. Each mutating or search call shows the
equivalent curl command.

## Tasks

| Task          | Command                 | Purpose                             |
| ------------- | ----------------------- | ----------------------------------- |
| Dev (browser) | `deno task dev`         | Vite HMR at localhost               |
| Dev (docs)    | `deno task dev:docs`    | MkDocs dev server at localhost:8000 |
| Dev (all)     | `deno task dev:all`     | Vite + MkDocs together              |
| Dev (desktop) | `deno task dev:desktop` | `deno desktop --hmr .`              |
| Build         | `deno task build`       | Production assets in `dist/`        |
| Preview       | `deno task preview`     | Serve production build              |
| Test          | `deno task test`        | Vitest once                         |
| Test watch    | `deno task test:watch`  | Vitest watch mode                   |
| Lint          | `deno task lint`        | `deno lint`                         |
| Format        | `deno task fmt`         | `deno fmt`                          |
| Typecheck     | `deno task check`       | `deno check src/main.tsx`           |
| CI locally    | `deno task ci`          | fmt check, lint, check, test, build |

`deno task preview` and production builds do not include the Vite proxy. Use a
server with CORS enabled, or put Studio behind a reverse proxy to `/api`.

### Local docs dev server

`deno task dev:docs` runs `utility/docs-dev.sh`, which builds the MkDocs
Material Docker image and starts the dev server from the `aspects.dev` repo at
`http://localhost:8000`. It requires Docker. No changes to `aspects.dev` are
needed.

`deno task dev:all` starts Vite and MkDocs together (using `concurrently`) and
sets `VITE_DOCS_LOCAL=true`, which makes every in-app docs link point at
`localhost:8000` instead of `docs.aspected.com`. Stopping either process stops
both.

By default the script looks for `aspects.dev` as a sibling directory:

```
parent/
  aspected-studio/   ← this repo
  aspects.dev/       ← expected location
```

Override with `ASPECTED_DOCS_DIR` if the repos are not siblings:

```bash
ASPECTED_DOCS_DIR=/path/to/aspects.dev deno task dev:docs
```

You can also set `VITE_DOCS_LOCAL=true` manually to point any Vite dev session
at a separately running MkDocs server:

```bash
VITE_DOCS_LOCAL=true deno task dev
```

## Adding shadcn components

The `shadcn` package stays in dependencies for `@import "shadcn/tailwind.css"`.
Add components with Deno (not bare `npx`):

```bash
deno run -A npm:shadcn@latest add button
```

Import from `@/components/ui/...`:

```tsx
import { Button } from "@/components/ui/button";
```

## Definition of Done

Before considering a change finished:

1. Exported functions, hooks, types, and classes have TSDoc
2. Tests are updated for behavior changes and `deno task test` passes
3. README is updated if setup, tasks, or user-facing workflows changed
4. `deno task fmt`, `deno task lint`, and `deno task check` are clean
