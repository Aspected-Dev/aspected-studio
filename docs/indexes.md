# Indexes

After connecting, create an index, upload documents, then search. Schema is
chosen at create time and is **read-only** afterwards.

## Create

`/indexes/new` builds a `PUT /indexes/{name}` body: `idSize`, optional
`distanceType` (Cosine is omitted so the server keeps its default), `schema`
aspects, optional HNSW knobs.

Aspect types Studio knows: `enum`, `text`, `number`, `datetime`, `raw`, `dict`.
Each aspect has a JSON `path` (default `$.{name}`), optional `multiplier`, and
type-specific `settings` (validated with Zod in `src/lib/aspected/types.ts`).

Form drafts live in `src/lib/aspected/create-index-form.ts`. Prefer `DocsField`
and existing shadcn controls so create UI matches the rest of Studio.

## Schema

`/indexes/:name` shows the stored schema and HNSW settings. There is no in-app
schema migrate path in the MVP: recreate the index if the layout must change.

## Documents

`/indexes/:name/docs` lists documents, uploads one or many via
`POST /indexes/{name}/docs`, and deletes by uploading an id with no `doc`. Ids
are client-supplied. Duplicate and missing policies are set on the upload
dialog.

Destructive deletes use a confirm `AlertDialog` with `variant="destructive"` and
a success toast. Match that pattern for other destructive actions.

## Search

`/indexes/:name/search` is the raw sparse search form: query fields per aspect,
optional weights, `k`, flags such as `withDocs`. It is the API-shaped surface.

Weight tuning belongs on the [Playground](playground.md). Quality measurement
belongs on the [Scorecard](scorecard.md).

## Request Inspector

Each mutating or search call shows a Request card: method, path, and JSON body.
**Code** opens a side sheet with copyable curl so the page stays focused on the
payload.

For concurrent scorecard searches, see
[Architecture: Request Inspector](architecture.md#request-inspector-and-concurrent-runs).

## Demo index

`deno task seed:catalog` builds a 100-document `catalog` index for demos and
manual scorecard testing. See
[Catalog scorecard](tutorials/05-catalog-scorecard-demo.md).

## Related

- Connecting: [Connections](connections.md)
- Screen map: [Overview](overview.md)
