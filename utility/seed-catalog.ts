/**
 * Seeds the `catalog` demo index: 100 consumer electronics documents across
 * six aspects, sized for weight tuning and scorecard runs.
 *
 * The text aspect is what lets a query be semantically right and numerically
 * wrong: the situation weights exist to resolve.
 *
 * ```bash
 * deno task seed:catalog
 * ASPECTED_URL=http://box:8080 deno task seed:catalog
 * ```
 */

const baseUrl = (Deno.env.get("ASPECTED_URL") ?? "http://localhost:8080")
  .replace(/\/+$/, "")
const apiToken = Deno.env.get("ASPECTED_TOKEN") ?? ""

/** Index this script owns. Re-running replaces it, documents and all. */
const INDEX = "catalog"

/** Text model shipped with Aspected. */
const TEXT_MODEL = "nomic-embed-text-v1.5.f16.gguf"

const CATEGORIES = [
  "laptop",
  "monitor",
  "phone",
  "tablet",
  "headphones",
  "keyboard",
  "mouse",
  "camera",
  "printer",
  "speaker",
]

const BRANDS = ["aurora", "nimbus", "vertex", "lumen", "quanta"]

/**
 * The catalog, as `id | title | category | brand | price | rating | YYYY/MM`.
 *
 * Ids are readable on purpose: a golden set names document ids, so opaque
 * uuids would make an expected list impossible to review in a diff. Each
 * category spans price tiers so that "budget" and "premium" queries both have
 * a plausible wrong answer to rank above the right one.
 */
const TABLE = `
laptop-aurora-pro-16    | Aurora Pro 16 laptop, 32 GB RAM, 1 TB SSD, for video editing        | laptop     | aurora | 2899 | 4.8 | 2025/03
laptop-aurora-pro-14    | Aurora Pro 14 laptop for software development, 16 GB RAM           | laptop     | aurora | 1899 | 4.7 | 2025/01
laptop-aurora-air-13    | Aurora Air 13 ultralight laptop for travel and note taking         | laptop     | aurora | 1199 | 4.5 | 2024/06
laptop-nimbus-studio-15 | Nimbus Studio 15 laptop with colour accurate screen for design work | laptop     | nimbus | 2199 | 4.6 | 2024/10
laptop-nimbus-play-15   | Nimbus Play 15 gaming laptop, 144 Hz screen, discrete graphics      | laptop     | nimbus | 1499 | 4.3 | 2024/08
laptop-nimbus-play-17   | Nimbus Play 17 gaming laptop, 240 Hz screen, liquid metal cooling   | laptop     | nimbus | 2499 | 4.4 | 2025/05
laptop-vertex-work-14   | Vertex Work 14 business laptop with docking station                 | laptop     | vertex | 1349 | 4.1 | 2023/11
laptop-vertex-work-15   | Vertex Work 15 business laptop, spill resistant keyboard            | laptop     | vertex | 1149 | 4.0 | 2023/04
laptop-vertex-book-14   | Vertex Book 14 budget laptop for school and email                   | laptop     | vertex |  649 | 3.7 | 2023/08
laptop-lumen-slate-13   | Lumen Slate 13 fanless laptop with OLED screen                      | laptop     | lumen  | 1599 | 4.4 | 2025/02
laptop-lumen-flex-14    | Lumen Flex 14 convertible laptop with pen support                   | laptop     | lumen  | 1099 | 4.2 | 2024/03
laptop-quanta-value-15  | Quanta Value 15 budget laptop for browsing and office work          | laptop     | quanta |  529 | 3.4 | 2022/09
laptop-quanta-play-15   | Quanta Play 15 budget gaming laptop, 120 Hz screen                  | laptop     | quanta |  899 | 3.9 | 2024/11
laptop-quanta-forge-16  | Quanta Forge 16 workstation laptop for 3D rendering                 | laptop     | quanta | 2999 | 4.5 | 2025/07
monitor-lumen-4k-27     | Lumen 27 inch 4K monitor for photo editing                          | monitor    | lumen  |  699 | 4.6 | 2024/05
monitor-lumen-4k-32     | Lumen 32 inch 4K monitor with USB-C hub                             | monitor    | lumen  |  949 | 4.5 | 2024/09
monitor-lumen-5k-27     | Lumen 27 inch 5K monitor, colour calibrated for design work         | monitor    | lumen  | 1399 | 4.7 | 2025/04
monitor-aurora-qhd-27   | Aurora 27 inch QHD monitor, 165 Hz for gaming                       | monitor    | aurora |  429 | 4.3 | 2024/02
monitor-aurora-uw-34    | Aurora 34 inch ultrawide monitor for spreadsheets                   | monitor    | aurora |  879 | 4.4 | 2024/07
monitor-aurora-oled-27  | Aurora 27 inch OLED gaming monitor, 240 Hz                          | monitor    | aurora | 1099 | 4.6 | 2025/06
monitor-nimbus-fhd-24   | Nimbus 24 inch Full HD office monitor                               | monitor    | nimbus |  159 | 3.8 | 2022/11
monitor-nimbus-fhd-27   | Nimbus 27 inch Full HD monitor with height adjustable stand         | monitor    | nimbus |  209 | 3.9 | 2023/03
monitor-vertex-qhd-32   | Vertex 32 inch QHD monitor for a home office                        | monitor    | vertex |  389 | 4.0 | 2023/09
monitor-vertex-uw-38    | Vertex 38 inch ultrawide monitor for video timelines                | monitor    | vertex | 1249 | 4.5 | 2025/01
monitor-quanta-fhd-22   | Quanta 22 inch budget monitor for basic office use                  | monitor    | quanta |  109 | 3.3 | 2022/05
monitor-quanta-qhd-27   | Quanta 27 inch QHD monitor, 100 Hz, budget price                    | monitor    | quanta |  239 | 3.7 | 2024/04
phone-aurora-one-pro    | Aurora One Pro phone, triple camera with telephoto lens             | phone      | aurora | 1249 | 4.8 | 2026/02
phone-aurora-one        | Aurora One phone with dual camera and OLED screen                   | phone      | aurora |  899 | 4.6 | 2026/02
phone-aurora-mini       | Aurora Mini compact phone that fits one hand                        | phone      | aurora |  749 | 4.4 | 2025/03
phone-nimbus-shot-pro   | Nimbus Shot Pro camera phone for low light photography              | phone      | nimbus | 1099 | 4.7 | 2025/10
phone-nimbus-shot       | Nimbus Shot phone with big battery and fast charging                | phone      | nimbus |  649 | 4.2 | 2025/04
phone-vertex-core       | Vertex Core phone for calls and messaging                           | phone      | vertex |  329 | 3.8 | 2024/06
phone-vertex-core-plus  | Vertex Core Plus phone with large screen for reading                | phone      | vertex |  449 | 4.0 | 2025/01
phone-lumen-edge        | Lumen Edge phone with curved OLED screen                            | phone      | lumen  |  999 | 4.5 | 2025/08
phone-lumen-play        | Lumen Play gaming phone, 165 Hz screen, shoulder triggers           | phone      | lumen  |  859 | 4.3 | 2025/11
phone-quanta-basic      | Quanta Basic budget phone for first time users                      | phone      | quanta |  149 | 3.2 | 2023/07
phone-quanta-lite       | Quanta Lite budget phone with three day battery                     | phone      | quanta |  199 | 3.5 | 2024/09
phone-quanta-rugged     | Quanta Rugged waterproof phone for construction sites               | phone      | quanta |  379 | 4.1 | 2024/12
tablet-aurora-slate-13  | Aurora Slate 13 tablet with keyboard cover for note taking          | tablet     | aurora | 1199 | 4.7 | 2025/09
tablet-aurora-slate-11  | Aurora Slate 11 tablet with pen support for sketching               | tablet     | aurora |  849 | 4.6 | 2025/05
tablet-nimbus-draw-12   | Nimbus Draw 12 drawing tablet with a pressure sensitive pen         | tablet     | nimbus |  729 | 4.4 | 2024/10
tablet-nimbus-read-8    | Nimbus Read 8 small tablet for reading ebooks                       | tablet     | nimbus |  279 | 4.0 | 2023/11
tablet-vertex-tab-10    | Vertex Tab 10 tablet for video calls and streaming                  | tablet     | vertex |  349 | 3.9 | 2024/03
tablet-vertex-tab-12    | Vertex Tab 12 tablet with detachable keyboard for office work       | tablet     | vertex |  599 | 4.1 | 2025/02
tablet-lumen-view-11    | Lumen View 11 tablet with OLED screen for films                     | tablet     | lumen  |  649 | 4.3 | 2025/06
tablet-lumen-view-14    | Lumen View 14 large tablet for reading sheet music                  | tablet     | lumen  |  899 | 4.2 | 2026/01
tablet-quanta-kids-8    | Quanta Kids 8 budget tablet with rubber case for children           | tablet     | quanta |  129 | 3.4 | 2023/05
tablet-quanta-tab-10    | Quanta Tab 10 budget tablet for children and homework               | tablet     | quanta |  179 | 3.6 | 2024/08
headphones-lumen-quiet-pro | Lumen Quiet Pro noise cancelling headphones for flights          | headphones | lumen  |  399 | 4.8 | 2025/07
headphones-lumen-quiet     | Lumen Quiet noise cancelling headphones, 40 hour battery         | headphones | lumen  |  249 | 4.5 | 2024/09
headphones-lumen-buds-pro  | Lumen Buds Pro noise cancelling earbuds for commuting            | headphones | lumen  |  229 | 4.6 | 2025/10
headphones-aurora-studio   | Aurora Studio over ear headphones for mixing music               | headphones | aurora |  349 | 4.7 | 2024/11
headphones-aurora-buds     | Aurora Buds wireless earbuds for running                         | headphones | aurora |  159 | 4.2 | 2025/03
headphones-nimbus-sport    | Nimbus Sport sweatproof earbuds for the gym                      | headphones | nimbus |   99 | 4.0 | 2024/05
headphones-nimbus-quiet-air | Nimbus Quiet Air noise cancelling headphones, lightweight       | headphones | nimbus |  199 | 4.3 | 2025/01
headphones-vertex-office   | Vertex Office headset with a boom microphone for calls           | headphones | vertex |  129 | 4.1 | 2023/10
headphones-vertex-play     | Vertex Play gaming headset with surround sound                   | headphones | vertex |  149 | 4.0 | 2024/07
headphones-quanta-wired    | Quanta Wired headphones, budget price, no battery                | headphones | quanta |   29 | 3.3 | 2022/08
headphones-quanta-buds     | Quanta Buds budget wireless earbuds                              | headphones | quanta |   49 | 3.4 | 2023/12
headphones-quanta-over-ear | Quanta Over Ear headphones for listening at home                 | headphones | quanta |   69 | 3.6 | 2024/02
keyboard-vertex-mech-tkl | Vertex Mech TKL compact mechanical keyboard, tactile switches      | keyboard   | vertex |  139 | 4.6 | 2024/06
keyboard-vertex-mech-full | Vertex Mech Full size mechanical keyboard with a numpad           | keyboard   | vertex |  159 | 4.5 | 2024/06
keyboard-vertex-mech-60  | Vertex Mech 60 percent mechanical keyboard for small desks         | keyboard   | vertex |  119 | 4.4 | 2025/02
keyboard-aurora-type     | Aurora Type low profile wireless keyboard for laptops              | keyboard   | aurora |   99 | 4.3 | 2024/10
keyboard-aurora-split    | Aurora Split ergonomic keyboard to reduce wrist strain             | keyboard   | aurora |  229 | 4.5 | 2025/04
keyboard-nimbus-play-rgb | Nimbus Play RGB gaming keyboard, linear switches                   | keyboard   | nimbus |  129 | 4.2 | 2024/09
keyboard-nimbus-slim     | Nimbus Slim quiet keyboard for shared offices                      | keyboard   | nimbus |   59 | 3.9 | 2023/06
keyboard-lumen-craft-75  | Lumen Craft 75 hot swappable mechanical keyboard                   | keyboard   | lumen  |  189 | 4.7 | 2025/08
keyboard-quanta-basic    | Quanta Basic wired keyboard, budget price                          | keyboard   | quanta |   19 | 3.2 | 2022/04
keyboard-quanta-combo    | Quanta Combo wireless keyboard and mouse set                       | keyboard   | quanta |   39 | 3.5 | 2023/09
mouse-aurora-travel     | Aurora Travel compact wireless mouse for laptop bags                | mouse      | aurora |   59 | 4.3 | 2024/08
mouse-aurora-precision  | Aurora Precision wireless mouse for photo editing                   | mouse      | aurora |   99 | 4.6 | 2025/03
mouse-nimbus-play-light | Nimbus Play Light gaming mouse, 58 grams                            | mouse      | nimbus |   79 | 4.5 | 2025/01
mouse-nimbus-play-pro   | Nimbus Play Pro wireless gaming mouse, 8000 Hz polling              | mouse      | nimbus |  149 | 4.7 | 2025/09
mouse-vertex-vertical   | Vertex Vertical ergonomic mouse to reduce wrist strain              | mouse      | vertex |   69 | 4.2 | 2024/04
mouse-vertex-trackball  | Vertex Trackball mouse for small desks                              | mouse      | vertex |   89 | 4.0 | 2023/10
mouse-lumen-silent      | Lumen Silent mouse with quiet clicks for shared offices             | mouse      | lumen  |   39 | 4.1 | 2024/11
mouse-lumen-travel-fold | Lumen Travel Fold flat mouse for travel                             | mouse      | lumen  |   49 | 3.8 | 2025/05
mouse-quanta-wired      | Quanta Wired mouse, budget price                                    | mouse      | quanta |    9 | 3.1 | 2022/03
mouse-quanta-wireless   | Quanta Wireless mouse, budget price, AA battery                     | mouse      | quanta |   15 | 3.3 | 2023/02
camera-lumen-r7         | Lumen R7 mirrorless camera body for wildlife photography            | camera     | lumen  | 1899 | 4.8 | 2025/06
camera-lumen-r5         | Lumen R5 mirrorless camera body for portraits                       | camera     | lumen  | 1399 | 4.7 | 2024/09
camera-lumen-compact-x  | Lumen Compact X pocket camera for street photography                | camera     | lumen  |  749 | 4.5 | 2025/02
camera-aurora-vlog-v2   | Aurora Vlog V2 camera with a flip screen for video blogging         | camera     | aurora |  899 | 4.4 | 2025/04
camera-aurora-action-6  | Aurora Action 6 waterproof action camera for cycling                | camera     | aurora |  349 | 4.3 | 2024/07
camera-nimbus-dslr-90   | Nimbus DSLR 90 camera kit with an 18-55 mm lens for beginners       | camera     | nimbus |  649 | 4.1 | 2023/08
camera-vertex-doorbell  | Vertex Doorbell security camera with night vision                   | camera     | vertex |  119 | 3.9 | 2024/12
camera-quanta-webcam-hd | Quanta HD webcam for video calls                                    | camera     | quanta |   39 | 3.5 | 2023/04
printer-vertex-laser    | Vertex Office laser printer for high volume documents               | printer    | vertex |  349 | 4.2 | 2024/05
printer-vertex-mfp      | Vertex Office all in one laser printer with a scanner               | printer    | vertex |  479 | 4.3 | 2025/01
printer-lumen-photo-a3  | Lumen Photo A3 inkjet printer for gallery prints                    | printer    | lumen  |  899 | 4.6 | 2025/07
printer-nimbus-inkjet   | Nimbus Home inkjet printer for school homework                      | printer    | nimbus |   89 | 3.4 | 2023/03
printer-nimbus-label    | Nimbus Label printer for shipping labels                            | printer    | nimbus |  129 | 4.0 | 2024/10
printer-quanta-mono     | Quanta Mono laser printer, budget price                             | printer    | quanta |  119 | 3.6 | 2022/10
speaker-aurora-move     | Aurora Move portable bluetooth speaker, waterproof                  | speaker    | aurora |  149 | 4.5 | 2025/05
speaker-aurora-room     | Aurora Room smart speaker with a voice assistant                    | speaker    | aurora |  199 | 4.3 | 2024/11
speaker-lumen-studio    | Lumen Studio monitor speakers for music production, pair            | speaker    | lumen  |  499 | 4.7 | 2025/03
speaker-nimbus-bar-5    | Nimbus Bar 5 soundbar for the television                             | speaker    | nimbus |  279 | 4.2 | 2024/08
speaker-quanta-mini     | Quanta Mini bluetooth speaker, budget price                          | speaker    | quanta |   29 | 3.3 | 2023/06
speaker-quanta-desk     | Quanta Desk USB speakers for a computer                              | speaker    | quanta |   25 | 3.2 | 2022/07
`

type CatalogDoc = {
  id: string
  doc: {
    title: string
    category: string
    brand: string
    price: number
    rating: number
    released: string
  }
}

/** Parses {@link TABLE} into upload rows, failing loudly on a bad cell. */
function parseTable(): CatalogDoc[] {
  const rows: CatalogDoc[] = []
  const seen = new Set<string>()

  for (const line of TABLE.trim().split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim())
    if (cells.length !== 7) {
      throw new Error(`Expected 7 cells, got ${cells.length}: ${line}`)
    }

    const [id, title, category, brand, price, rating, released] = cells
    if (seen.has(id)) {
      throw new Error(`Duplicate id: ${id}`)
    }
    if (!CATEGORIES.includes(category)) {
      throw new Error(`Unknown category on ${id}: ${category}`)
    }
    if (!BRANDS.includes(brand)) {
      throw new Error(`Unknown brand on ${id}: ${brand}`)
    }
    seen.add(id)

    rows.push({
      id,
      doc: {
        title,
        category,
        brand,
        price: Number(price),
        rating: Number(rating),
        released: `${released}/01 00:00:00`,
      },
    })
  }

  return rows
}

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {}
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const docs = parseTable()
console.log(`Seeding ${docs.length} documents into ${INDEX} at ${baseUrl}`)

// Drop first so a re-run is a clean rebuild rather than a merge onto an index
// whose schema may have moved on.
await call("DELETE", `/indexes/${INDEX}`).catch(() => null)

await call("PUT", `/indexes/${INDEX}`, {
  idSize: 36,
  distanceType: "Cosine",
  schema: [
    {
      name: "title",
      type: "text",
      path: "$.title",
      settings: { model: TEXT_MODEL },
    },
    {
      name: "category",
      type: "enum",
      path: "$.category",
      settings: { values: CATEGORIES, maxValuesPerRadial: 5 },
    },
    {
      name: "brand",
      type: "enum",
      path: "$.brand",
      settings: { values: BRANDS, maxValuesPerRadial: 5 },
    },
    {
      name: "price",
      type: "number",
      path: "$.price",
      settings: { min: 0, max: 3000 },
    },
    {
      name: "rating",
      type: "number",
      path: "$.rating",
      settings: { min: 0, max: 5 },
    },
    {
      name: "released",
      type: "datetime",
      path: "$.released",
      settings: { granularity: "month", minYear: 2022, maxYear: 2026 },
    },
  ],
})

// Text embedding dominates upload time, so batch rather than sending 100
// separate requests.
const BATCH = 20
for (let start = 0; start < docs.length; start += BATCH) {
  const batch = docs.slice(start, start + BATCH)
  await call("POST", `/indexes/${INDEX}/docs`, {
    data: batch,
    policy: { duplicate: "Replace", missing: "Ignore" },
  })
  console.log(`  uploaded ${start + batch.length}/${docs.length}`)
}

console.log(`Done. Open /indexes/${INDEX}/playground`)
