# Studio documentation

Long-form docs for **Aspected Studio**, the web UI for the Aspected vector
database. The [README](../README.md) is the developer entry point (setup, tasks,
Definition of Done). This folder is where features, architecture, tutorials, and
demos live.

Product documentation for Aspected itself (resolvers, HNSW, the HTTP API) is not
here. That site ships from the sibling `aspects.dev` repo and is what
`deno task dev:docs` runs. In-app help icons link there.

## Start here (tutorials)

Hands-on walkthroughs. Tutorials 1–3 stay lean; 4–5 go deep on how to
**interpret** Compare and Scorecard metrics while tuning weights:

| # | Tutorial                                                         | Time       |
| - | ---------------------------------------------------------------- | ---------- |
| 1 | [Connect and seed the catalog](tutorials/01-connect-and-seed.md) | ~10 min    |
| 2 | [Indexes and documents](tutorials/02-indexes-and-documents.md)   | ~15 min    |
| 3 | [Search](tutorials/03-search.md)                                 | ~10 min    |
| 4 | [Playground](tutorials/04-playground.md)                         | ~25 min    |
| 5 | [Catalog scorecard](tutorials/05-catalog-scorecard-demo.md) | ~40–50 min |

Index of tutorials: [tutorials/README.md](tutorials/README.md).

## Reference

| Page                            | What it covers                                          |
| ------------------------------- | ------------------------------------------------------- |
| [Overview](overview.md)         | What Studio is, MVP scope, screen map                   |
| [Architecture](architecture.md) | Design decisions behind preview, scorecard, storage     |
| [Connections](connections.md)   | Servers, proxy, CORS, tokens, localStorage              |
| [Indexes](indexes.md)           | Create, schema, documents, search, Request Inspector    |
| [Playground](playground.md)     | Ranking, Live/Preview/Stale, Compare A/B                |
| [Scorecard](scorecard.md)       | Golden sets, metrics, Scorecard page and Playground tab |
| [Contributing](contributing.md) | Stack, code guidelines, when to update which docs       |

## Keeping docs current

When a change alters user-facing behavior, a workflow, or a design decision
documented here, update the matching page (and the tutorial if steps changed).
Check that this index still links to new pages. Setup and task changes belong in
the README. See [Contributing](contributing.md#readme-vs-docs).
