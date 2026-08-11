# Agent instructions

Aspected Studio is a Deno-managed Vite + React UI for the Aspected vector
database. Web MVP first; desktop and Docker packaging later.

## Before you code

1. Read [`README.md`](README.md) for setup, tasks, and Definition of Done
2. Follow project rules in [`.cursor/rules/`](.cursor/rules/)

## Hard constraints

- Use **Deno** (`deno task`, `deno add`, `deno install`). Do not use npm, yarn,
  or pnpm as the package manager
- Prefer **shadcn/ui**. Do not add Storybook
- Do not create a `docs/` tree unless the user explicitly asks
- Do not edit `dist/` or reintroduce ESLint, Prettier, or `package-lock.json`

## After code changes

1. Keep TSDoc on **exported** APIs
2. Update or add Vitest coverage for behavior changes
3. Run `deno task test` (and `deno task check` / lint / fmt as needed)
4. Update README when setup or workflows change

shadcn CLI via Deno:

```bash
deno run -A npm:shadcn@latest add <component>
```
