# Aspected Studio

Web UI for browsing and working with **Aspected**, a vector database. The MVP is
a Vite + React app managed with Deno. Desktop packaging (`deno desktop`) and
shipping alongside the Aspected Docker image come after the web MVP.

- **Developers / agents:** start with [`AGENTS.md`](AGENTS.md) and
  [`.cursor/rules`](.cursor/rules/)
- **Product docs for Studio:** [`docs/`](docs/README.md) (features,
  architecture, tutorials)
- **Product docs for Aspected:** sibling [`aspects.dev`](../aspects.dev) site
  (what `deno task dev:docs` runs; linked from in-app help)

## Setup

```bash
deno install
git config core.hooksPath .githooks
```

The git hooks path is local to this repo. Pre-commit runs `deno fmt` (using this
repo's `deno.json`) and `deno task lint` only.

This workspace disables Prettier in `.vscode/settings.json`. Keep the Deno
extension enabled, or format-on-save can fight `deno fmt` again.

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

Studio starts disconnected. Add a server (welcome screen or sidebar), then
Connect. Local Docker uses `http://localhost:8080`. Details: CORS, tokens,
remote hosts, and `localStorage` behavior are in
[`docs/connections.md`](docs/connections.md).

First-time walkthrough:
[`docs/tutorials/01-connect-and-seed.md`](docs/tutorials/01-connect-and-seed.md).

### Demo data

```bash
deno task seed:catalog
```

Builds a 100-document `catalog` index for Playground and Scorecard demos. Import
`utility/catalog-golden-set.json` from `/indexes/catalog/scorecard`.

Full talk track:
[`docs/tutorials/05-catalog-scorecard-demo.md`](docs/tutorials/05-catalog-scorecard-demo.md).

To check that tutorial's numbers without a browser:

```bash
deno task verify:tutorials
```

Grades the same golden set at all weights 1, price 8, and price 8 with category
6, then prints the chips and metric tiles for each. It asserts nothing and exits
non-zero only when the server is unreachable or a case fails, so the comparison
against the cheat sheet stays a human read.

## Tasks

| Task                | Command                      | Purpose                             |
| ------------------- | ---------------------------- | ----------------------------------- |
| Dev (browser)       | `deno task dev`              | Vite HMR at localhost               |
| Dev (Aspected docs) | `deno task dev:docs`         | MkDocs from `aspects.dev` at :8000  |
| Dev (all)           | `deno task dev:all`          | Vite + MkDocs together              |
| Dev (desktop)       | `deno task dev:desktop`      | `deno desktop --hmr .`              |
| Seed demo           | `deno task seed:catalog`     | 100 document `catalog` index        |
| Verify tutorial 5   | `deno task verify:tutorials` | Grade the demo set headless         |
| Build               | `deno task build`            | Production assets in `dist/`        |
| Preview             | `deno task preview`          | Serve production build              |
| Test                | `deno task test`             | Vitest once                         |
| Test watch          | `deno task test:watch`       | Vitest watch mode                   |
| Lint                | `deno task lint`             | `deno lint`                         |
| Format              | `deno task fmt`              | `deno fmt`                          |
| Typecheck           | `deno task check`            | `src/main.tsx` + `utility/`         |
| CI locally          | `deno task ci`               | fmt check, lint, check, test, build |

`deno task preview` and production builds do not include the Vite proxy. Use a
server with CORS enabled, or put Studio behind a reverse proxy to `/api`.

### Local Aspected product docs (`aspects.dev`)

These tasks run the **Aspected** MkDocs site from the sibling `aspects.dev`
repo. They are not the Studio markdown under [`docs/`](docs/README.md).

`deno task dev:docs` runs `utility/docs-dev.sh` (Docker + MkDocs Material) at
`http://localhost:8000`. `deno task dev:all` starts Vite and MkDocs together and
sets `VITE_DOCS_LOCAL=true` so in-app docs links point at localhost:8000.

Default layout:

```text
parent/
  aspected-studio/   ← this repo
  aspects.dev/       ← expected location
```

Override with `ASPECTED_DOCS_DIR` if needed:

```bash
ASPECTED_DOCS_DIR=/path/to/aspects.dev deno task dev:docs
```

Or point any Vite session at an already running MkDocs server:

```bash
VITE_DOCS_LOCAL=true deno task dev
```

## Adding shadcn components

```bash
deno run -A npm:shadcn@latest add button
```

Import from `@/components/ui/...`. Guidelines:
[`docs/contributing.md`](docs/contributing.md).

## Definition of Done

Before considering a change finished:

1. Exported functions, hooks, types, and classes have TSDoc
2. Tests are updated for behavior changes and `deno task test` passes
3. [`docs/`](docs/README.md) updated when user-facing behavior, workflows, or
   design decisions change; this README updated when setup, tasks, or the entry
   checklist change
4. `deno task fmt`, `deno task lint`, and `deno task check` are clean

Full contributor guide: [`docs/contributing.md`](docs/contributing.md).
