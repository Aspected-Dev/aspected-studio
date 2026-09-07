# Overview

Aspected Studio is a REST-backed web UI for **Aspected**, a multi-aspect vector
database. You connect to a server, create indexes, upload documents, search,
tune aspect weights in the Playground, and measure quality with golden sets on
the Scorecard.

Studio does not embed a database. Every mutating or search call goes to the
Aspected HTTP API. The UI’s job is to make that API inspectable and to turn
weight tuning from guesswork into measured work.

## MVP scope

Web first: Vite + React in the browser, managed with Deno.

Later (not in this MVP):

- Desktop packaging with `deno desktop`
- Shipping Studio beside the Aspected Docker image

## How Studio relates to Aspected

| Layer              | Role                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Aspected server    | Indexes, embeddings, HNSW search, per-aspect explanations        |
| Studio             | Connection management, forms, Playground re-rank, golden sets    |
| `aspects.dev` docs | Product reference for resolvers and the API (linked from the UI) |

Aspects are independent resolvers (`text`, `number`, `enum`, `datetime`, `raw`,
`dict`) whose distances combine with **weights**. Studio’s distinctive surface
is the Playground: every search requests `withExplanation: true` so the client
can re-score cached rows when a weight moves, without re-embedding the query.

## Screen map

| Route                       | Screen                                         |
| --------------------------- | ---------------------------------------------- |
| `/`                         | Index list (and welcome when disconnected)     |
| `/indexes/new`              | Create index                                   |
| `/indexes/:name`            | Schema (read-only after create)                |
| `/indexes/:name/docs`       | Documents: list, upload, delete                |
| `/indexes/:name/search`     | Raw sparse search form                         |
| `/indexes/:name/playground` | Weight tuning: Ranking, Compare, Scorecard tab |
| `/indexes/:name/scorecard`  | Golden sets: edit, run, import/export          |

Sidebar chrome also holds Settings, Get help (product docs catalog), Support,
and the connection list.

## Where to go next

- Wire a server: [Connections](connections.md)
- Indexes and the Request Inspector: [Indexes](indexes.md)
- Live weight previews: [Playground](playground.md)
- Measured quality: [Scorecard](scorecard.md)
- Why preview and scorecard work the way they do:
  [Architecture](architecture.md)
- Demo talk track:
  [Catalog scorecard](tutorials/05-catalog-scorecard-demo.md)
