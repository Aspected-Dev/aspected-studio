# Aspected Studio

Web UI for browsing and working with **Aspected**, a vector database. The MVP is
a Vite + React app managed with Deno. Studio also ships inside every official
Aspected Docker image (disabled by default). Desktop packaging (`deno desktop`)
comes later.

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

To use the Studio UI that ships with Aspected Docker images, enable it at
runtime (see [Connections](docs/connections.md)). Local development still uses
`deno task dev` as above.

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

For a larger Auto-tune readiness corpus (TMDB 5000):

```bash
deno task seed:movies
deno task check:movies
```

Requires `utility/tmdb_5000_movies.csv` and `utility/tmdb_5000_credits.csv`.
Import `utility/movies-golden-set.json` and `utility/movies-planted-set.json`
from `/indexes/movies/scorecard`. Walkthrough:
[`docs/tutorials/07-movies-auto-tune.md`](docs/tutorials/07-movies-auto-tune.md).

To check that tutorial 5's numbers without a browser:

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
| Seed movies         | `deno task seed:movies`      | TMDB 5000 `movies` index            |
| Check movies        | `deno task check:movies`     | Offline (and `--live`) golden check |
| Verify tutorial 5   | `deno task verify:tutorials` | Grade the demo set headless         |
| Build               | `deno task build`            | Production assets in `dist/`        |
| Build (desktop)     | `deno task build:desktop`    | Unsigned local `deno desktop` app   |
| Preview             | `deno task preview`          | Serve production build              |
| Test                | `deno task test`             | Vitest once                         |
| Test watch          | `deno task test:watch`       | Vitest watch mode                   |
| Lint                | `deno task lint`             | `deno lint`                         |
| Format              | `deno task fmt`              | `deno fmt`                          |
| Typecheck           | `deno task check`            | `src/main.tsx` + `utility/`         |
| CI locally          | `deno task ci`               | fmt check, lint, check, test, build |

`deno task preview` and production builds do not include the Vite proxy. Point
Studio at a server with CORS enabled when Studio is not same-origin. Bundled
Studio under `/studio/` shares the API origin.

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

## Releasing

Studio versions are independent from Aspected. To cut a release:

1. Move bullets from `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) into a
   new `## [X.Y.Z] - YYYY-MM-DD` section (product-facing notes, not raw
   commits).
2. Bump `"version"` in [`package.json`](package.json) **and**
   [`deno.json`](deno.json) to the same `X.Y.Z`.
3. Merge to the default branch, then tag and push `vX.Y.Z` (must match both
   version fields).
4. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs
   `deno task ci` (production `dist/` uses base path `/studio/`), packages
   `aspected-studio-dist-X.Y.Z.tar.gz`, builds unsigned desktop installers
   (macOS `.dmg`, Windows `.msi`, Linux `.AppImage` and `.deb`), and creates a
   GitHub Release whose notes come from the matching CHANGELOG section (plus
   tarball and installer lists; auto-generated commit notes only if that section
   is missing).
5. In the sibling `aspects.dev` repo, download that release tarball into the
   image build (no Docker Hub static image, no SSH to this repo during the
   Aspected Docker bake).

Desktop installers are unsigned. macOS Gatekeeper and Windows SmartScreen may
warn until code signing is added later. Smoke a host build with
`deno task build && deno task build:desktop` (Linux writes a working AppImage
under `release/`). Desktop builds force `STUDIO_BASE_PATH=/` so the packaged app
is not prefixed with `/studio/`.

Override the web base for a one-off build:

```bash
STUDIO_BASE_PATH=/ deno task build
```

Windows MSI note: Deno Desktop does not expose an MSI wizard finish dialog
option. The install completes without a confirmation screen. Staging uses the
display name so the installed executable is not the versioned release filename.

## Definition of Done

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
