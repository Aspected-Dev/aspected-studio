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
- Recharts (via shadcn chart) for the Playground contribution bars
- Motion for re-rank animations
- Vitest + Testing Library

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

Studio starts disconnected. Add a server from the sidebar or the welcome screen,
save it if you want it in the list, then click Connect. A local Docker server is
`http://localhost:8080` and uses the Vite `/api` proxy. The sidebar has
Settings, Get Help, and Support below the main nav, then the connections list
(host, version, and uptime after `/status` succeeds). For a remote instance,
enter its origin and enable CORS on the server
(`ASPECTED_SERVER_CORS_ENABLED=true` or `server.corsEnabled`). If the server
uses a static API token, paste it in the connection dialog. Studio sends
`Authorization: Bearer <token>`. Saved connections stay in this browser.
Refreshing Studio does not reconnect automatically.

Create an index, upload documents to train it, then search. Schema is set at
create time and is read-only afterwards. Each mutating or search call shows the
equivalent curl command.

## Search Playground

`/indexes/:name/playground` is the weight-tuning screen. The Search page stays
the raw API form; the Playground exists to answer "what happens to my ranking if
I turn this aspect up".

Compose a sparse query with one control per aspect, then drag the log-scale
weight sliders. Every search runs with `withExplanation: true`, so Studio can
divide the request weight back out of each per-aspect distance and re-score the
results already on screen. Ranking updates on the frame, no server round trip
and no re-embedding of the query text. A real search follows on a 300ms debounce
while Auto-run is on.

A badge next to the ranking says where the numbers came from:

| Badge   | Meaning                                                          |
| ------- | ---------------------------------------------------------------- |
| Live    | These are the distances the server returned                      |
| Preview | Re-scored locally at weights the server has not been asked about |
| Stale   | The query changed, so the recovered grades no longer apply       |

Every metric stacks per-aspect contributions that sum to the total distance, so
a shorter bar always means a closer match.

Local re-scoring is exact for Manhattan, Euclidean, and DotProduct, because each
of those accumulates per dimension and an aspect's slice sums into the total.
Cosine normalises across every dimension at once, so it is computed as a
weighted mean of the per-aspect distances. That is exact whenever an aspect's
query and document vectors share a norm, which holds for the radial resolvers
(`enum`, `number`, `datetime`, `dict`) and is close for `text`. The Preview
badge reports the measured deviation on Cosine indexes, so the approximation is
never hidden.

Two limits worth knowing. Only the `k` documents already fetched are re-scored,
so a document that would enter the top `k` under new weights cannot appear until
the real search lands. And an aspect sent at weight `0` gets no distance back
from the server, so raising it again marks the preview stale rather than
guessing.

### Compare (A/B)

The Compare tab pins the last real search as config A, then lets you keep
tweaking into B. B is whatever the Ranking tab is already showing, including
local weight previews, so there is no second request path.

Pinning freezes the form values, result rows, and weights from that search.
Restore A writes those values back onto the form. Clear drops the pin.

The difference is shown three ways:

| View                          | What it answers                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlap@depth                 | How many of the shared top-`depth` documents appear in both lists (`depth` is `min(k_A, k_B)`)                                                           |
| RBO (p 0.9)                   | Rank-biased overlap. Top ranks weigh more than lower ones, so a swap at rank 1 hurts more than a swap at rank 40. Identical prefixes score exactly `1`   |
| Bump chart and movement table | A's ids down the left axis, B's down the right, lines connecting the same document. Entered and dropped documents show as a single dot on their own side |

Kendall tau is deliberately not used: it treats every pairwise swap equally,
which is the wrong question for a top-k ranking.

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
import { Button } from "@/components/ui/button"
```

## Definition of Done

Before considering a change finished:

1. Exported functions, hooks, types, and classes have TSDoc
2. Tests are updated for behavior changes and `deno task test` passes
3. README is updated if setup, tasks, or user-facing workflows changed
4. `deno task fmt`, `deno task lint`, and `deno task check` are clean
