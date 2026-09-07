# Tutorial 1: Connect and seed the catalog

**Time:** about 10 minutes\
**Goal:** Studio talking to a local Aspected server, with the `catalog` demo
index ready for later tutorials.

## Before you start

You need:

- Docker (or another way to run Aspected on port 8080)
- Deno installed
- This repo checked out

## Step 1: Start Aspected

In a terminal:

```bash
docker run --name aspected --rm -p 8080:8080 aspected:latest
```

Leave that running. Aspected is the database; Studio is only a client.

## Step 2: Install and run Studio

In the `aspected-studio` repo:

```bash
deno install
git config core.hooksPath .githooks
deno task dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Local
`deno task
dev` proxies `/api` to `http://localhost:8080`.

## Step 3: Add a connection

You should see the welcome screen: **Welcome to Aspected Studio**.

1. Click **Add new connection** (dialog title: **New connection**)
2. Fill in:
   - **Name:** anything memorable, e.g. `Local` (optional; placeholder follows
     the host)
   - **Server URL:** `http://localhost:8080`
   - **API token:** leave empty unless your server requires a static token
3. Click **Save and Connect** (or **Save** then connect later from the sidebar,
   or **Connect** without saving)

When it works, the welcome screen goes away and you land on **Indexes**. The
sidebar shows the connection once `/status` succeeds.

Connections live in this browser’s `localStorage`. Refresh does **not**
reconnect automatically; use the sidebar again.

If Connect fails:

- Confirm the Docker container is still running
- Confirm the URL is exactly `http://localhost:8080` (no trailing path)
- For a remote host, you need CORS on the server; local Docker via the Vite
  proxy should not need that

More detail: [Connections](../connections.md).

## Step 4: Seed the catalog index

In another terminal, from the repo root:

```bash
deno task seed:catalog
```

You should see upload progress for 100 documents, then:

```text
Done. Open /indexes/catalog/playground
```

Back in Studio, refresh the Indexes page (or navigate away and back). You should
see an index named **catalog**.

`catalog` has 100 products and six aspects so later weight and golden-set work
has something real to measure. Re-running the seed deletes and recreates
`catalog`.

Optional: `ASPECTED_URL=... deno task seed:catalog`.

## Step 5: Open the index

1. Click **catalog** in the Indexes table (or open `/indexes/catalog`)
2. You land on **Schema**

Confirm six aspects: `title`, `category`, `brand`, `price`, `rating`,
`released`. Distance type should be Cosine.

**Checkpoint:** Connected, `catalog` exists, schema looks right. Continue with
[Tutorial 2](02-indexes-and-documents.md).
