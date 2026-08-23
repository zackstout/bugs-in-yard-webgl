# Multi-photo observations

## Problem

iNaturalist allows multiple photos per observation. The CSV export (`data/observations.csv`) only provides a single `image_url` column — the primary photo. All additional photos are silently dropped before the build script runs.

## Solution

Augment the build script to call the iNaturalist API after CSV parsing, fetching the full photo list for each observation. A persistent cache file prevents redundant API calls on subsequent builds.

---

## Step 1 — Cache file (`data/photos-cache.json`)

A new file, committed to git, mapping observation ID to all medium-size photo URLs:

```json
{
  "12345678": ["https://.../medium.jpg", "https://.../medium.jpg"],
  "99999999": ["https://.../medium.jpg"]
}
```

- **Missing key** — never fetched; triggers an API call on the next build
- **Empty array `[]`** — fetched and confirmed to have no photos; will not be re-fetched
- **Commit to git** so builds are reproducible without hitting the API

---

## Step 2 — Batching strategy

Use the iNaturalist observations API:

```
GET https://api.inaturalist.org/v1/observations?id=ID1,ID2,...&per_page=100
```

- Batch size: 100 IDs per request
- Delay: 1 second between batches (stays under the 100 req/min rate limit)
- First run: ~6 requests for 525 observations (~6 seconds total)
- Subsequent runs: 0 API calls if no new observations were added to the CSV

---

## Step 3 — `build-observations.ts` changes

- Make `main()` async
- Add a `--no-fetch` flag to skip API calls (useful for CI or fast iteration)
- Load the cache at startup
- After CSV filtering, collect IDs not present as keys in the cache
- Fetch uncached IDs in batches; for each result extract `result.photos[].url` and replace `/square` with `/medium`
- Write the updated cache back to disk before building the observations array
- Fall back to the CSV `image_url` if `--no-fetch` is passed or the cache has no entry for an ID
- Output `imageFile` as `string[]` instead of `string`

### Incremental fetch behavior

| Scenario | Behavior |
|---|---|
| First build (no cache) | Fetches all ~525 observations in ~6 batches |
| Subsequent build, no new observations | Zero API calls |
| New observations added to CSV | Only new IDs are fetched |
| `--no-fetch` flag passed | Cache is read but never updated; API is never called |
| API returns no result for an ID | Empty array `[]` written to cache; not re-fetched |

---

## Step 4 — `src/types/Observation.ts`

```ts
// Before
imageFile: string

// After
imageFile: string[]
```

An empty array replaces the empty-string sentinel for observations with no photos.

---

## Step 5 — `TaxonomyTree.vue` (3 sites)

**Species side-panel image grid** — flatten all photos across all observations:
```ts
// Before
v-for="obs in selectedSpecies.obs.filter(o => o.imageFile)"
:src="obs.imageFile"

// After
v-for="(src, i) in selectedSpecies.obs.flatMap(o => o.imageFile)"
:key="i"
:src="src"
```

**Child card thumbnail collector** — collect photos across observations per species:
```ts
// Before
images: sp.obs.filter(o => o.imageFile).map(o => o.imageFile).slice(0, 3)

// After
images: sp.obs.flatMap(o => o.imageFile).slice(0, 3)
```

**`grabImages` helper** — iterate the array instead of pushing a single string:
```ts
// Before
if (o.imageFile) into.push(o.imageFile)

// After
for (const url of o.imageFile) {
  if (into.length >= max) return
  into.push(url)
}
```

---

## Step 6 — `BugScene.vue`

The 3D scene needs only one texture per mesh. Use the first photo:

```ts
// Before
new THREE.TextureLoader().load(obs.imageFile, ...)

// After
new THREE.TextureLoader().load(obs.imageFile[0] ?? '', ...)
```

The existing fallback texture (`makeFallbackTexture`) already covers the case where no URL is available.

---

## Dependencies

No new npm packages required. Uses `fetch` (native in Node 18+) and `fs`/`JSON` already imported in the build script.
