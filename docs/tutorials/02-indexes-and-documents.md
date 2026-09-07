# Tutorial 2: Indexes and documents

**Time:** about 15 minutes\
**Goal:** Read a schema, inspect documents, upload one row by hand, watch the
Request Inspector, then delete with confirmation.

**Prerequisites:** [Tutorial 1](01-connect-and-seed.md) (`catalog` index
exists).

## Step 1: Schema page

1. Open **catalog** from Indexes, or go to `/indexes/catalog`
2. You are on **Schema** (sidebar: under the index name)

| Aspect     | Type     | What a query on it means                   |
| ---------- | -------- | ------------------------------------------ |
| `title`    | text     | Semantic similarity to the product blurb   |
| `category` | enum     | Steer toward a product family              |
| `brand`    | enum     | Steer toward a brand                       |
| `price`    | number   | Closeness to a target price                |
| `rating`   | number   | Closeness to a target rating               |
| `released` | datetime | Closeness in time (month granularity here) |

Schema is fixed at create time. Wrong layout means recreate the index (the seed
script does that for `catalog`).

Click the **Docs** help control if you want Aspected product docs for resolvers
(that opens `aspects.dev` material, not this repo’s `/docs`).

## Step 2: Documents list

1. In the sidebar under **catalog**, click **Documents**\
   (URL: `/indexes/catalog/docs`)
2. Browse the table. Ids look like `laptop-aurora-pro-16`, not opaque UUIDs.

Readable ids matter later: golden cases name document ids in their expected
lists.

## Step 3: Add a document by hand

1. Click **Add document**
2. Enter an id you will remember, e.g. `tutorial-probe-1`
3. Fill JSON for `doc` so it matches the schema fields, for example:

```json
{
  "title": "Tutorial probe laptop for Studio walkthrough",
  "category": "laptop",
  "brand": "quanta",
  "price": 500,
  "rating": 3.5,
  "released": "2024/01/01 00:00:00"
}
```

4. Leave policies at defaults unless you are testing them (**Replace** on
   duplicate is the usual choice while learning)
5. Click **Save** (or the dialog’s primary submit)

You should get a success toast about created/updated counts. The table should
include `tutorial-probe-1`.

Upload is `POST /indexes/{name}/docs`. The server embeds `title` (and resolves
other aspects) at write time.

## Step 4: Read the Request Inspector

Scroll to the **Request** card (or open it if collapsed on your layout).

You should see something like:

- Method: `POST`
- Path: `/indexes/catalog/docs`
- Body: the JSON Studio just sent

Open **Code** if you want a curl one-liner for the same call.

## Step 5: Bulk JSON (optional)

1. Click **Bulk JSON**
2. Paste an array-shaped upload body (Studio validates against the upload
   schema), or skip if you are happy with one row
3. Click **Upload**

Prefer **Add document** while learning; bulk is for migrations and seeds.

## Step 6: Delete with confirmation

1. Find `tutorial-probe-1` in the table
2. Use the row’s delete action
3. An **AlertDialog** asks you to confirm. Read the copy: it names the id and
   says it cannot be undone
4. Click **Delete** (destructive styled button)

Toast confirms removal. The row is gone.

## Checkpoint

You can open Schema and Documents, upload a row, and reconcile it with the
Request Inspector.

Next: [Tutorial 3: Search](03-search.md).
