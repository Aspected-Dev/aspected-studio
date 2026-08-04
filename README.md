# Aspected Studio

React + TypeScript + Vite + shadcn/ui desktop UI for the Aspected vector
database. Dependencies are managed with Deno (`deno install`, `deno.lock`).

## Setup

```bash
deno install
```

## Development

```bash
deno task dev
```

## Build

```bash
deno task build
deno task preview
```

## Lint, format, and typecheck

```bash
deno task lint
deno task fmt
deno task check
```

## Adding shadcn components

The `shadcn` package stays in dependencies for `@import "shadcn/tailwind.css"`.
To add components, run the CLI via Deno (no global npm install needed):

```bash
deno run -A npm:shadcn@latest add button
```

Components are placed under `src/components`. Import them like:

```tsx
import { Button } from "@/components/ui/button"
```
