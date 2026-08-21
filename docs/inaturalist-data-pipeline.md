# iNaturalist Data Pipeline

## Purpose

This document describes how to fetch observations from a specific iNaturalist account and enrich each with full taxonomy data. The output is a normalized `observations.json` file that the app consumes at runtime. The app never calls the iNaturalist API directly.

This work belongs to **Phase 2 — Real Data and Image Pipeline**.

---

## iNaturalist API Overview

Base URL: `https://api.inaturalist.org/v1/`

No authentication is required for read-only access to public observations. The API returns JSON. Rate limits apply — keep requests to a reasonable pace (1–2 per second is safe).

---

## Step 1 — Fetch Observations for a User

**Endpoint:** `GET /observations`

**Key parameters:**

| Parameter      | Value                          | Notes                                      |
| -------------- | ------------------------------ | ------------------------------------------ |
| `user_login`   | `your_username`                | The account username, not numeric ID       |
| `quality_grade` | `research`                   | Omit to include casual and needs-ID grades |
| `per_page`     | `200`                          | Maximum allowed per request                |
| `page`         | `1`, `2`, …                   | Paginate until results are exhausted       |
| `order`        | `desc`                         | Newest first                               |
| `order_by`     | `observed_on`                  |                                            |

**Example request:**

```
GET https://api.inaturalist.org/v1/observations?user_login=your_username&quality_grade=research&per_page=200&page=1
```

**Response structure (abbreviated):**

```json
{
  "total_results": 312,
  "page": 1,
  "per_page": 200,
  "results": [
    {
      "id": 123456789,
      "observed_on": "2024-07-14",
      "place_guess": "My Backyard, Springfield, IL",
      "latitude": "39.7817",
      "longitude": "-89.6501",
      "taxon": {
        "id": 47158,
        "name": "Coleoptera",
        "preferred_common_name": "Beetles",
        "rank": "order",
        "ancestor_ids": [48460, 1, 47120, 372739, 47158]
      },
      "photos": [
        {
          "id": 987654,
          "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/987654/square.jpg"
        }
      ],
      "description": "Found on milkweed",
      "tags": []
    }
  ]
}
```

**Pagination logic:**

```
total_pages = ceil(total_results / per_page)
Fetch pages 1 through total_pages sequentially.
Collect all results into one array.
```

---

## Step 2 — Extract Taxonomy from Each Observation

Each observation includes a `taxon` object. This contains the matched taxon, but not always the full lineage in labeled fields.

**Two approaches — choose one:**

### Option A: Use the embedded `ancestor_ids` + a single taxa lookup

Each taxon has an `ancestor_ids` array (e.g., `[48460, 1, 47120, 372739, 47158]`). These are iNaturalist taxon IDs ordered from root to the matched taxon.

Fetch the full list of ancestors in one call:

```
GET https://api.inaturalist.org/v1/taxa?id=48460,1,47120,372739,47158&per_page=30
```

This returns all ancestor taxa with their `rank` and `name`. Map them by rank to build the full lineage:

```ts
{
  kingdom: "Animalia",
  phylum: "Arthropoda",
  class: "Insecta",
  order: "Coleoptera",
  family: "Coccinellidae",
  genus: "Harmonia",
  species: "Harmonia axyridis"
}
```

**Advantage:** One extra API call per unique taxon (not per observation). Cache results by taxon ID to avoid repeat fetches.

### Option B: Request observations with `include=ancestors` (if supported)

Some iNaturalist API endpoints support including ancestor data inline. Check the current API documentation — this may reduce the number of separate calls needed.

---

## Step 3 — Resolve Photo URLs

iNaturalist photo URLs follow a predictable pattern:

```
https://inaturalist-open-data.s3.amazonaws.com/photos/{photo_id}/{size}.jpg
```

Valid sizes: `square` (75px), `small` (240px), `medium` (500px), `large` (1024px), `original`

In the build script, record the photo ID and construct the URL for each needed derivative. Do not store the full URL — store the photo ID and reconstruct URLs as needed.

---

## Step 4 — Normalize to `BugObservation`

Map each fetched observation to the app's data model:

```ts
interface BugObservation {
  id: string               // iNaturalist observation ID as string
  slug: string             // generated from scientific name + observation ID
  commonName?: string      // taxon.preferred_common_name
  scientificName?: string  // taxon.name (at species rank if available)
  taxonomy: {
    order?: string
    family?: string
    genus?: string
    species?: string
    // add others as needed
  }
  observedAt: string       // observed_on field (ISO date string)
  location?: {
    name: string           // place_guess
    lat?: number
    lng?: number
  }
  image: {
    tiny: string           // 256px derivative path (generated locally)
    medium: string         // 768px derivative path
    large: string          // 1600px derivative path
    width: number
    height: number
  }
  tags: string[]
  notes?: string           // description field
}
```

---

## Step 5 — Download Original Photos

After normalizing, download the `original` or `large` photo from iNaturalist for each observation. Store locally in `public/images/original/`.

The image processing step (Sharp) generates `256px`, `768px`, and `1600px` AVIF derivatives from each original. This is a separate step, documented in the image pipeline doc.

---

## Build Script Structure

```
scripts/
  fetch-observations.ts    ← calls iNaturalist API, writes raw JSON
  normalize.ts             ← maps raw JSON to BugObservation[]
  download-images.ts       ← downloads originals from iNaturalist
  generate-derivatives.ts  ← runs Sharp to produce AVIF derivatives
  build-data.ts            ← orchestrates all steps, writes observations.json
```

Run order:

```
fetch-observations → normalize → download-images → generate-derivatives → writes observations.json
```

After running, `observations.json` and all image derivatives are static files. The app loads only `observations.json` at startup.

---

## Caching and Re-runs

- Save raw API responses to `scripts/cache/raw-observations.json`. Skip the fetch step if the cache is fresh enough.
- Cache taxon lookups in `scripts/cache/taxa.json` keyed by taxon ID. Avoid re-fetching taxa already resolved.
- Only download images that are not already present in `public/images/original/`.

Re-running the full build script updates the collection without re-fetching everything from scratch.

---

## Handling Partial or Missing Taxonomy

Observations not yet identified to species will have partial taxonomy. The data model marks all taxonomy fields optional, so this is already handled.

Rules:
- If `taxon` is null (no ID at all), set all taxonomy fields to undefined. Still include the observation.
- Use the deepest available rank. An observation identified only to family still has `order` and `family` populated.
- Log a warning for any observation missing `order` — it may not group correctly in the taxonomy layout.

---

## iNaturalist API Rate Limit

- Do not send more than 1 request per second without authentication.
- With an API token (free to generate), limits increase. Add a token as an environment variable if the collection is large.
- The build script runs offline and infrequently — pace requests conservatively.

---

## Summary

1. Fetch all observations for the account using paginated `GET /observations` calls.
2. For each unique taxon, fetch ancestor data via `GET /taxa` and resolve the full lineage.
3. Normalize each observation to `BugObservation`.
4. Download originals from iNaturalist.
5. Generate AVIF derivatives with Sharp.
6. Write `observations.json`.

The app consumes `observations.json` at startup. The iNaturalist API is not called at runtime.
