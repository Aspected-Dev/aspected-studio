# Aspected Studio

Web UI for browsing and working with **Aspected**, a vector database. The MVP is
a Vite + React app managed with Deno. Desktop packaging (`deno desktop`) and
shipping alongside the Aspected Docker image come after the web MVP.

Agents: start with [`AGENTS.md`](AGENTS.md) and follow `.cursor/rules`.

## Stack

- Deno (package manager, tasks, lint, fmt, typecheck)
- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS v4
- Vitest + Testing Library

## Setup

```bash
deno install
git config core.hooksPath .githooks
```

The git hooks path is local to this repo. Pre-commit runs format and lint only.

## Tasks

| Task          | Command                 | Purpose                             |
| ------------- | ----------------------- | ----------------------------------- |
| Dev (browser) | `deno task dev`         | Vite HMR at localhost               |
| Dev (desktop) | `deno task dev:desktop` | `deno desktop --hmr .`              |
| Build         | `deno task build`       | Production assets in `dist/`        |
| Preview       | `deno task preview`     | Serve production build              |
| Test          | `deno task test`        | Vitest once                         |
| Test watch    | `deno task test:watch`  | Vitest watch mode                   |
| Lint          | `deno task lint`        | `deno lint`                         |
| Format        | `deno task fmt`         | `deno fmt`                          |
| Typecheck     | `deno task check`       | `deno check`                        |
| CI locally    | `deno task ci`          | fmt check, lint, check, test, build |

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
