# Contributing

How we build Studio, and where documentation belongs.

## Stack (and why)

| Choice                       | Role                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| Deno                         | Package manager, tasks, lint, fmt, typecheck. Single toolchain. |
| Vite + React 19 + TypeScript | Web MVP UI                                                      |
| React Router 7               | App routes                                                      |
| Zod v4                       | Runtime validation (not Zod v3 patterns)                        |
| TanStack Table v9            | Document and score tables                                       |
| Monaco                       | JSON and shell editors, themed to shadcn tokens                 |
| shadcn/ui + Tailwind CSS v4  | Primitives and styling                                          |
| Recharts (shadcn chart)      | Playground bars and scorecard sweep                             |
| Motion                       | Re-rank animations                                              |
| Vitest + Testing Library     | Unit and component tests                                        |

Hard no for MVP: npm/yarn/pnpm as the package manager, ESLint, Prettier,
`package-lock.json`, Storybook, Playwright.

Deno `npm:` specifiers are fine. Add shadcn components with:

```bash
deno run -A npm:shadcn@latest add button
```

Import from `@/components/ui/...`.

## Code guidelines

- Functional React components and TypeScript only
- Prefer existing shadcn primitives over hand-rolled duplicates
- Aspect query inputs live in `AspectValueField`
  (`src/components/aspect-value-field.tsx`); extend that component when a
  resolver needs a new control
- Tailwind v4 utilities; no new CSS frameworks
- TSDoc on **exported** functions, hooks, types, and classes; skip tiny private
  helpers
- Co-locate tests as `*.test.ts` / `*.test.tsx`
- Prefer testing pure logic and mappers; keep component tests light
- Destructive UI: confirm with `AlertDialog` and `variant="destructive"`, then
  toast success (match documents / golden set delete)
- Voice in UI copy, docs, commits, and comments: direct; no em dashes, en
  dashes, or `--` as punctuation

More UI detail: `.cursor/rules/react-ui.mdc`. Testing:
`.cursor/rules/testing.mdc`.

## README vs docs

| Change                                               | Update                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Setup, tasks, env vars, Definition of Done checklist | [README](../README.md)                                            |
| Feature behavior, workflows, metrics, demos          | Matching page under [`docs/`](README.md)                          |
| Button-by-button walkthroughs                        | [`docs/tutorials/`](tutorials/README.md)                          |
| Cross-cutting design decision                        | [Architecture](architecture.md) and/or the feature page           |
| New major screen or surface                          | New docs page or section, linked from [docs/README.md](README.md) |
| Agent / contributor policy                           | [AGENTS.md](../AGENTS.md) and `.cursor/rules`                     |

Do not dump feature manuals back into the README. Do not leave `docs/` stale
when the product changes.

Product docs for Aspected (MkDocs from `aspects.dev`) are a separate tree. See
the README section on local product docs (`deno task dev:docs`).

## Definition of Done

Before considering a change finished:

1. Exported APIs have TSDoc
2. Tests cover behavior changes; `deno task test` passes
3. `docs/` updated when user-facing behavior, workflows, or design decisions
   change; README updated when setup, tasks, or the entry checklist change
4. `deno task fmt`, `deno task lint`, and `deno task check` are clean

Agents: follow [AGENTS.md](../AGENTS.md) and `.cursor/rules` (especially
`00-core.mdc` and `documentation.mdc`).

## Local verification

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task ci   # fmt check + lint + check + test + build
```

Git hooks: `git config core.hooksPath .githooks` (pre-commit runs fmt into the
index and `deno task lint`). This workspace disables Prettier; keep the Deno
extension enabled so format-on-save does not fight `deno fmt`.
