# Bug Sighting Explorer — Plan Summary

## Goal

Build a web app to explore a personal insect photo collection through a spatial, semi-3D interface. The experience should feel like a **digital natural-history specimen cabinet** — not a photo gallery with 3D effects bolted on. Photography is the focus. Spatial position communicates meaning.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Vue 3 + TypeScript |
| 3D Rendering | Three.js (WebGL) |
| Routing | Vue Router |

**Vue** handles routing, search, filters, metadata, taxonomy, accessibility, and application state.
**Three.js** handles the spatial scene, camera, image planes, picking, transitions, and animation.

The entire application must not depend on the WebGL canvas. Every observation must be reachable through a conventional URL.

---

## Three Navigation Levels

1. **Atlas** — zoomed out, collection shown as spatial clusters by major group (beetles, butterflies, bees, etc.)
2. **Group** — zoomed in on a cluster, individual photos become visible, subgroups appear, labels show
3. **Specimen** — a single observation selected, high-res image loads, full metadata displayed

Transitions between levels use camera movement and progressive disclosure, not separate page loads.

---

## Semantic Zoom

Zoom controls **information density**, not just camera distance:

```
far      → major groups / clusters
         → thumbnails appear
         → family/subgroup labels appear
         → species names appear
near     → selected image expands, metadata shows
```

---

## Spatial Layout Engine *(target design — not built until Phase 5)*

In the final system, do not hard-code XYZ positions. Use a layout engine:

```ts
layout(observations, { mode: 'taxonomy' })
// returns { id: { x, y, z, scale } }
```

Three.js animates objects from one layout to another. This separates data organization from rendering.

**Layout modes:**
- **Taxonomy** (primary) — spatial proximity reflects biological relationships
- **Chronological** — arranged by observation date, reveals seasonal patterns
- **Geographic** — clustered by location (future: transition to map view)
- **Visual Similarity** — UMAP image embeddings (future enhancement)

**Phase 1 uses manual hardcoded positions.** The layout engine is extracted in Phase 5 after at least two layouts have been built and the right abstraction is visible.

---

## Rendering

- Bug photos are **2D textured planes in 3D space** — no 3D insect models
- Subtle effects: billboard orientation, parallax, depth blur, card tilt on hover
- Effects must remain restrained — photography stays visually dominant

---

## Conventional Website Layer

Routes:

```
/               Spatial WebGL collection
/bugs           Searchable grid (fallback)
/bugs/:slug     Individual observation
/groups/:taxon  Taxonomic group
/about          About the collection
```

A specimen URL can also initialize the WebGL view focused on that observation.

---

## Data Model

```ts
interface BugObservation {
  id: string
  slug: string
  commonName?: string
  scientificName?: string
  taxonomy: { order?, family?, genus?, species?, ... }
  observedAt: string
  location?: { name, lat?, lng? }
  image: { tiny, medium, large, original?, width, height }
  tags: string[]
  notes?: string
}
```

The renderer consumes normalized observation data — not a specific CMS or database directly.

---

## Image System

### Derivatives per photo

| Size | Use |
|---|---|
| 256 px | Atlas/overview |
| 768 px | Group/close view |
| 1600 px | Selected specimen |
| Original | Deep zoom tiles only |

Generate derivatives at build/ingest time. Use AVIF or WebP. Never load originals during normal browsing.

### Progressive texture loading

- Textures load based on projected screen size, distance, and selection state
- Promote resolution as the camera approaches; crossfade between levels
- Evict textures for distant/unviewed observations

### BugTextureManager

A dedicated subsystem responsible for:
- Requesting and prioritizing textures
- Selecting appropriate resolution
- Caching decoded textures
- Promoting / downgrading resolution
- Enforcing GPU memory budget
- Canceling obsolete requests
- Disposing GPU resources (`texture.dispose()`)

Rendering components do not implement image loading logic independently.

### GPU memory note

A 2048×2048 AVIF may be small on the wire but ~16 MB on the GPU. Limit texture sizes aggressively in overview and group views. Mobile is out of scope for the WebGL view — no mobile GPU budget is needed.

---

## Architecture

```
Vue 3 + TypeScript
├── Application UI (router, search, filters, metadata, accessibility)
├── Observation Data
├── Layout Engine (taxonomy, chronological, geographic, similarity)
├── Image System
│   ├── BugTextureManager
│   ├── Texture cache + priority queue
│   └── Deep-zoom tiles
└── Three.js Scene
    ├── Camera controller
    ├── Image planes
    ├── Picking
    ├── Transitions + labels
    └── Effects
```

**Key separation:**

```
Observation Data → Layout Engine → Three.js Renderer
Image Assets → BugTextureManager → Three.js Renderer
```

---

## Revised MVP — Interaction Proof Only

The only question the first version must answer is:

> **Does navigating a spatial field of bug photographs feel compelling?**

Everything else is deferred until that is confirmed.

### What to build

- One Vue component containing a Three.js canvas
- ~20 observations loaded from a hardcoded JSON file (no pipeline, no CMS)
- Images loaded at one size only — whatever is on disk (no texture manager)
- XYZ positions set manually per observation (no layout engine)
- Camera pan and zoom via mouse/trackpad
- Hover: image enlarges slightly, name appears
- Click: camera animates toward observation, larger image loads
- Escape / click away: camera returns to overview

### What is explicitly not in this version

- Layout engine of any kind
- BugTextureManager or texture cache
- Semantic zoom thresholds or label system
- Vue Router integration
- Conventional website routes
- Image processing pipeline
- Multiple layout modes
- Any mobile consideration

**This version should be buildable in a day or two. If it is not, it is still too large.**

---

## Phases

### Phase 1 — Interaction Proof *(build this first)*

**Goal:** Confirm the spatial navigation concept feels good before building anything else.

**Deliverables:**
- Vue 3 + Vite project scaffolded
- Three.js canvas mounted in a Vue component
- ~20 hardcoded bug observations (JSON file, manual positions)
- Single image size per observation (full-size or resized by hand, no pipeline)
- Camera pan + zoom
- Hover highlight + name label
- Click to focus + enlarge
- Escape to return

**Done when:** You can spend 10 minutes navigating the prototype and it feels like something worth continuing.

---

### Phase 2 — Real Data and Image Pipeline

**Goal:** Replace hardcoded data with real observations and establish a repeatable image processing step.

**Deliverables:**
- Decide data source (iNaturalist export, manual JSON, other)
- Write a build script (Node + Sharp) to generate 256 / 768 / 1600 px AVIF derivatives
- Load real observations from a structured JSON file
- Confirm taxonomy fields are present and consistent enough to group by

**Prerequisite for:** every subsequent phase. Nothing can be profiled or validated without real photos.

---

### Phase 3 — Semantic Navigation

**Goal:** Make the spatial hierarchy understandable and navigable.

**Deliverables:**
- Atlas / Group / Specimen zoom thresholds implemented
- Labels fade in and out based on camera distance
- Animated transitions between zoom levels
- Vue Router integration: URL updates when an observation is selected
- Back / Escape navigates one semantic level up

**Also resolve here:** the Vue / Three.js event bridge pattern. Decide it once and document it. Do not let it be renegotiated later.

---

### Phase 4 — Texture System

**Goal:** Handle hundreds of observations without performance or memory problems.

**Deliverables:**
- BugTextureManager implemented
- Lazy loading: load textures based on camera proximity and selection state
- Resolution promotion: upgrade from 256 → 768 → 1600 as camera approaches
- Cache eviction: dispose GPU resources for distant observations
- Test with the full real collection

**Do not build this until Phase 2 is done.** You cannot profile memory or load times without real images.

---

### Phase 5 — Layout Engine

**Goal:** Support multiple ways of exploring the collection.

**Deliverables:**
- Taxonomy layout built inline (positions computed from taxonomy fields, not set by hand)
- Chronological layout built inline
- Animated transitions between layouts
- Layout engine interface extracted only after both layouts exist and the shared shape is visible

**Do not design the layout engine interface in advance.** Build each layout inline first, then extract the abstraction. This is the first phase where positions are computed rather than hardcoded.

---

### Phase 6 — Conventional Website Layer

**Goal:** Make the collection accessible without WebGL.

**Deliverables:**
- `/bugs` — searchable grid
- `/bugs/:slug` — individual observation page
- `/groups/:taxon` — taxonomic group page
- A specimen URL initializes the WebGL view focused on that observation

**This is not a fast phase.** Each page needs design, layout, and content. Plan accordingly.

---

### Phase 7 — Advanced Features *(if needed)*

Consider only after profiling demonstrates a real need:

- Texture atlases
- Instanced rendering
- Deep zoom / image tile pyramid
- Visual similarity embeddings (UMAP)
- Geographic map integration

---

## Concerns and Open Questions

*Documented skeptically — these are not blockers, but they need answers before or during Phase 1.*

---

### 1. ~~The MVP is still large~~ — *Resolved*

The MVP has been cut to an interaction proof only. Phase 1 is now a single Vue component with hardcoded data, manual positions, and no systems. See the Revised MVP section.

---

### 2. ~~The layout engine abstraction may be premature~~ — *Resolved*

Phase 5 now explicitly defers the layout engine interface. Both layouts are built inline first; the abstraction is extracted after. The Spatial Layout Engine section at the top is now labeled as target design, not current scope.

---

### 3. The Vue / Three.js boundary — *Decision recorded*

**Decision:** Use a Pinia store as the single bridge between the two systems. Neither side calls the other directly.

- **Vue → Three.js:** Vue (including Vue Router) writes to the store. The Three.js composable watches relevant store state and responds in the animation loop — it never receives direct function calls from Vue components.
- **Three.js → Vue:** The Three.js composable writes back to the store (e.g., `selectedId`, `cameraLevel`). Vue components and Vue Router react to those store changes via watchers.

```
User clicks image plane
  → Three.js sets store.selectedId
    → Vue Router watch fires, pushes /bugs/:slug
      → URL updates

User navigates to /bugs/:slug directly
  → Vue Router sets store.selectedId
    → Three.js animation loop reads store.selectedId, animates camera
```

This means Vue reactivity and the Three.js frame loop are decoupled — each reads the store at its own pace. There is no direct coupling between them.

**Apply this pattern from Phase 3 onward.** Do not invent a different bridge mid-project.

---

### 4. ~~Where does the data actually come from?~~ — *Resolved*

Data source is iNaturalist CSV export (see concern #7). Hosting is static files alongside the app — no CDN until profiling shows a need. See concern #7 for full details.

---

### 5. ~~The conventional website layer doubles the work~~ — *Resolved*

Phase 6 now treats the conventional layer as a distinct, explicitly large phase rather than a minor addition. It is not part of the MVP or any early phase.

---

### 6. Uneven collections — *Decision recorded*

**Decision:** Cluster spread is proportional to observation count, but on a logarithmic scale. All groups have a minimum size floor so nothing disappears entirely.

- A group with 1 observation gets a small but visible footprint.
- A group with 150 observations is larger, but not 150× larger — roughly 2–3× larger due to the log scale.
- This is honest (common groups look bigger) without making rare groups invisible.

Linear scaling would be misleading in both directions: it would make common groups dominate the screen while rare groups vanish to single points. Log scaling matches natural perception — the difference between 1 and 10 feels about as significant as the difference between 10 and 100.

**Apply this when building the taxonomy layout in Phase 5.** Phase 1 uses manual positions so it is not relevant yet.

---

### 7. Taxonomy data source — *Decision recorded*

**Decision:** Source observations from an iNaturalist CSV export.

iNaturalist exports include structured taxonomy fields (kingdom, phylum, class, order, family, genus, species), common name, scientific name, observation date, and coordinates. This is exactly what the data model requires and it is free.

The Phase 2 build script reads the iNaturalist CSV and produces a normalized `observations.json` that the app consumes. The app never calls the iNaturalist API at runtime.

**Consequences:**
- Taxonomy is as reliable as iNaturalist's community ID — good enough for layout grouping.
- Observations not yet identified to species will have partial taxonomy fields. The data model already marks these optional, so this is handled.
- The collection is updated by re-exporting from iNaturalist and re-running the build script. There is no live sync.
- Hosting question (concern #4): static files served from the same host as the app. No CDN required until the collection is large enough to warrant it. Start simple.

---

### 8. Mobile scope — *Decision recorded*

**Decision:** The WebGL spatial experience is desktop-only. Mobile is explicitly out of scope for the Three.js view.

The interaction model (hover, camera pan/zoom via mouse, precise clicking on small image planes) does not translate to touch without a separate design. That design is not worth doing before the desktop experience is validated.

Mobile users are served by the conventional website layer (Phase 6): the searchable grid at `/bugs` and individual observation pages at `/bugs/:slug` are fully usable on any device.

**Remove the GPU budget note for mobile** from the Image System section — it implies mobile is in scope for WebGL, which it is not. If mobile WebGL is added later, it gets its own design pass at that time.

---

## Design Principles

- **Photography first** — insects and photos are visually dominant
- **Spatial position communicates meaning** — not arbitrary decoration
- **Progressive disclosure** — labels and metadata appear as you approach
- **Semantic zoom** — distance controls information density
- **Fast initial load** — fetch only what the current view needs
- **Explicit GPU memory management** — dispose unused textures
- **WebGL is enhancement, not the whole site** — every observation is accessible conventionally
- **Optimize based on measurements** — start simple, profile before adding complexity
