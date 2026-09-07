# Agent instructions

Aspected Studio is a Deno-managed Vite + React UI for the Aspected vector
database. Web MVP first; desktop and Docker packaging later.

## Before you code

1. Read [`README.md`](README.md) for setup, tasks, and Definition of Done
2. Skim [`docs/README.md`](docs/README.md) for the Studio docs map (features,
   architecture, tutorials)
3. Follow project rules in [`.cursor/rules/`](.cursor/rules/)

## Hard constraints

- Use **Deno** (`deno task`, `deno add`, `deno install`). Do not use npm, yarn,
  or pnpm as the package manager
- Prefer **shadcn/ui**. Do not add Storybook
- Do not edit `dist/` or reintroduce ESLint, Prettier, or `package-lock.json`
- Long-form Studio docs live in [`docs/`](docs/README.md). Do not dump feature
  manuals back into the README

## After code changes

1. Keep TSDoc on **exported** APIs
2. Update or add Vitest coverage for behavior changes
3. Run `deno task test` (and `deno task check` / lint / fmt as needed)
4. Update [`docs/`](docs/README.md) when user-facing behavior, workflows,
   tutorials, or design decisions change; update README when setup, tasks, or
   the entry checklist change; link new major pages from `docs/README.md`

shadcn CLI via Deno:

```bash
deno run -A npm:shadcn@latest add <component>
```

Contributor detail: [`docs/contributing.md`](docs/contributing.md).
