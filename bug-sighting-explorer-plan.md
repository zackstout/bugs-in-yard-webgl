# Bug Sighting Explorer --- Product and Technical Plan

## 1. Project Goal

Build a web application for exploring a personal collection of insect
and other bug sightings through a semi-3D, spatial interface.

The primary experience should not feel like a conventional photo gallery
with a 3D effect layered on top. Instead, the spatial visualization
should be a core navigation mechanism. Images of observed bugs should
exist as objects in a navigable field, with grouping, position, depth,
and scale communicating relationships between observations.

The intended aesthetic is closer to a **digital natural-history specimen
cabinet** than a WebGL technology demo. Photography and the specimens
themselves should remain the visual focus.

The application should support hundreds of high-quality photographs
without requiring users to download full-resolution images during
initial load.

------------------------------------------------------------------------

## 2. Recommended Technology

### Frontend

-   Vue 3
-   TypeScript
-   Three.js for WebGL rendering
-   Vue Router for canonical URLs and navigation

### Responsibilities

Vue should manage:

-   Routing
-   Search
-   Filters
-   Metadata
-   Taxonomy information
-   Accessibility
-   Conventional page layouts
-   Application state

Three.js should manage:

-   Spatial visualization
-   Camera movement
-   Image planes
-   Picking / hit testing
-   Layout transitions
-   Depth effects
-   Animation

Do not make the entire application dependent on the WebGL canvas.

------------------------------------------------------------------------

## 3. Core Experience

The visualization should have three conceptual levels:

1.  **Atlas**
2.  **Group**
3.  **Specimen**

These do not necessarily need to be separate pages. Camera movement and
progressive disclosure can transition between them.

### Atlas Level

At the furthest zoom level, display the overall collection as spatial
clusters.

Example:

``` text
                    Butterflies
                  ·   ·  ●   ·
               ·

       Beetles                 Bees
      · · ● · ·              · ● ·
          ·                     · ·

                     Flies
                     · ·
                    · ● ·
```

Each point ultimately represents an observation/photo.

Possible major groupings include:

-   Beetles
-   Butterflies and moths
-   Bees and wasps
-   Flies
-   True bugs
-   Dragonflies and damselflies
-   Grasshoppers and crickets
-   Other arthropods

### Group Level

As the user approaches a cluster:

-   Individual photographs become recognizable.
-   The cluster spreads apart.
-   Subgroups may become visible.
-   Labels can appear.
-   Higher-resolution textures can load.

Example:

``` text
Beetles

        Lady beetles
         ● · · ●

 Ground beetles        Scarabs
   · ● · ·              ● ·
      ·                 · ·
```

### Specimen Level

Selecting an observation should focus attention on a single photograph.

Display metadata such as:

-   Common name
-   Scientific name
-   Observation date
-   Approximate location
-   Taxonomic hierarchy
-   Notes
-   Tags
-   Identification confidence, if relevant

The photograph should become the primary visual element.

------------------------------------------------------------------------

## 4. Semantic Zoom

Zoom should represent changes in information state rather than merely
moving the camera along the Z axis.

Conceptually:

``` text
DISTANCE

far
│
│   Orders / major groups
│
├── thumbnails appear
│
│   Families / subgroups
│
├── species names appear
│
│   Individual observations
│
├── selected image expands
│
│   Observation metadata
│
near
```

The transitions should remain visually continuous even though different
information becomes available at different zoom thresholds.

This prevents the scene from becoming cluttered with hundreds of labels.

------------------------------------------------------------------------

## 5. Spatial Layout System

Do not permanently hard-code arbitrary XYZ coordinates into
observations.

Create a layout engine that takes observations plus a visualization mode
and produces spatial positions.

Example interface:

``` ts
layout(observations, {
  mode: 'taxonomy'
})
```

Possible result:

``` ts
type LayoutResult = Record<string, {
  x: number
  y: number
  z: number
  scale: number
}>
```

Three.js should animate objects from their current layout to the new
layout.

This separates data organization from rendering and allows multiple ways
of exploring the same collection.

------------------------------------------------------------------------

## 6. Visualization Modes

### 6.1 Taxonomy

Primary recommended mode.

Group observations according to biological relationships.

Example:

``` text
Insecta
├── Coleoptera
│   ├── Carabidae
│   └── Coccinellidae
├── Lepidoptera
└── Odonata
```

Taxonomy can be represented through spatial proximity and empty space
rather than literal boxes.

### 6.2 Chronological

Arrange observations by observation date.

This could reveal seasonal patterns.

Example:

``` text
APR      MAY       JUN       JUL       AUG

 ·        ·      · · ·      · ·        ·
          ·       ·         · · ·
```

### 6.3 Geographic

Cluster observations according to location.

A future version could transition from the spatial visualization into a
conventional map.

### 6.4 Visual Similarity

Future enhancement.

Generate image embeddings offline and reduce them into two or three
dimensions using a technique such as UMAP.

Visually similar insects would naturally appear close together.

This could produce an interesting exploratory visualization independent
of taxonomy.

------------------------------------------------------------------------

## 7. Rendering Strategy

The bug photographs should generally remain 2D images rendered within 3D
space.

Use textured planes rather than attempting to create 3D insect models.

Possible effects:

-   Image planes subtly orient toward the camera.
-   Nearby and distant images have different parallax.
-   Selected images move forward.
-   Cluster depth varies slightly.
-   Distant specimens can become subtly blurred or faded.
-   Cards can tilt slightly in response to pointer movement.
-   Labels fade in according to zoom level.

Effects should be restrained. The photography should remain the dominant
visual element.

------------------------------------------------------------------------

## 8. Conventional Website Layer

The WebGL visualization should not be the only way to access the
collection.

Recommended routes:

``` text
/
    Spatial collection

/bugs
    Conventional searchable grid

/bugs/:slug
    Individual observation

/groups/:taxon
    Taxonomic group

/about
    Information about the collection
```

Benefits:

-   Accessibility
-   Search engine indexing
-   Shareable URLs
-   Browser navigation
-   Mobile fallback
-   Graceful degradation
-   Easier linking to individual observations

A specimen URL should also be able to initialize the WebGL experience
focused on that observation.

Example:

``` text
/bugs/twelve-spotted-skimmer-2026-07-08
```

------------------------------------------------------------------------

## 9. Observation Data Model

A starting TypeScript model could look like:

``` ts
interface BugObservation {
  id: string
  slug: string

  commonName?: string
  scientificName?: string

  taxonomy: {
    kingdom?: string
    phylum?: string
    class?: string
    order?: string
    family?: string
    genus?: string
    species?: string
  }

  observedAt: string

  location?: {
    name: string
    lat?: number
    lng?: number
  }

  image: {
    tiny: string
    medium: string
    large: string
    original?: string
    width: number
    height: number
  }

  tags: string[]
  notes?: string
}
```

The precise persistence layer can be chosen later. The rendering system
should consume normalized observation data rather than depending
directly on a particular CMS or database.

------------------------------------------------------------------------

# 10. Image Optimization Architecture

Image optimization is critical because the collection may contain
hundreds of high-resolution photographs.

Never load original photographs into the WebGL scene during initial page
load.

Each original should generate multiple optimized derivatives.

Example:

``` text
Original
6000×4000
15–30 MB
   │
   ├── tiny
   │   ~160–320 px
   │
   ├── medium
   │   ~640–800 px
   │
   ├── large
   │   ~1200–2000 px
   │
   └── original
       full resolution
```

A practical initial set would be:

``` text
256 px
768 px
1600 px
original
```

Use modern compressed formats such as AVIF and/or WebP for generated
assets where appropriate.

Example asset structure:

``` text
bug-123/
├── 256.avif
├── 768.avif
├── 1600.avif
└── original.jpg
```

The original should generally live in object storage/CDN and should
almost never be requested during ordinary collection browsing.

------------------------------------------------------------------------

## 11. Progressive Texture Loading

Texture resolution should depend on the visual importance of an
observation.

Recommended behavior:

``` text
COLLECTION VIEW
256 px

        ↓ zoom

GROUP VIEW
256 / 768 px

        ↓ select

SPECIMEN VIEW
1600 px

        ↓ deep zoom

DETAIL VIEW
high-resolution tiles
```

A photograph occupying only 30 pixels on screen does not need a
1600-pixel texture.

Texture resolution should therefore be driven by projected screen size,
distance, selection state, and available memory.

------------------------------------------------------------------------

## 12. Loading Priorities

Do not preload every image.

Prioritize roughly in this order:

1.  Currently selected observation
2.  Currently visible observations
3.  Observations close to the camera
4.  Observations likely to become visible next
5.  Everything else

A texture manager could expose an API conceptually similar to:

``` ts
textureManager.request({
  id: bug.id,
  size: 'medium',
  priority: 80
})
```

Priorities can be recalculated as the camera moves.

The manager should handle network requests independently from rendering
logic.

------------------------------------------------------------------------

## 13. Texture Promotion

As an observation becomes visually larger, promote it to a
higher-resolution texture.

Example:

``` text
256 px
   ↓
camera approaches
   ↓
768 px loads
   ↓
crossfade
   ↓
1600 px loads if necessary
```

Crossfading between texture levels over a short interval can hide
texture replacement.

Do not immediately discard the lower-resolution image when promotion
occurs if it is useful as a fallback.

------------------------------------------------------------------------

## 14. GPU Memory Considerations

Compressed download size and GPU memory consumption are different
concerns.

For example, a 2048 × 2048 image may download as a relatively small AVIF
file but expand significantly once decoded and uploaded to the GPU.

Approximate uncompressed RGBA memory:

``` text
2048 × 2048 × 4 bytes
≈ 16 MB
```

Therefore, dozens or hundreds of large textures can exhaust GPU memory
even if network transfer appears reasonable.

Texture dimensions should be aggressively limited in overview and group
views.

------------------------------------------------------------------------

## 15. Texture Cache and Eviction

The application should both lazy-load and lazy-unload textures.

Create a dedicated texture cache with an explicit memory budget.

Conceptually:

``` text
GPU texture budget

Selected             KEEP
Visible              KEEP
Nearby               KEEP
Recently viewed      KEEP TEMPORARILY
Old + distant        EVICT
```

An LRU-style cache is appropriate.

When a texture is evicted from Three.js, dispose of GPU resources
correctly.

Example:

``` ts
texture.dispose()
```

The exact memory budget may need to vary by device.

Mobile devices should use more aggressive limits than desktop devices.

------------------------------------------------------------------------

## 16. BugTextureManager

Image lifecycle management should be treated as a first-class subsystem.

Possible responsibilities:

``` text
BugTextureManager
│
├── request texture
├── prioritize requests
├── select appropriate resolution
├── cache decoded textures
├── promote texture resolution
├── downgrade texture resolution
├── evict distant textures
├── enforce memory budget
├── cancel obsolete requests
└── dispose GPU resources
```

Rendering components should not independently implement image loading
logic.

This will become increasingly important as the collection grows.

------------------------------------------------------------------------

## 17. Texture Atlases

For distant/overview rendering, consider generating one or more texture
atlases containing small thumbnails.

Conceptually:

``` text
┌─────────────────────────────┐
│ img │ img │ img │ img │ img │
├─────┼─────┼─────┼─────┼─────┤
│ img │ img │ img │ img │ img │
├─────┼─────┼─────┼─────┼─────┤
│ ...                         │
└─────────────────────────────┘
```

Each specimen references a UV region within the atlas.

Potential architecture:

``` text
thumbnail atlas
      ↓
overview

individual 768px texture
      ↓
close/group view

individual 1600px texture
      ↓
selected specimen
```

Benefits can include:

-   Fewer texture bindings
-   Fewer network requests
-   Efficient rendering of many thumbnails
-   Better suitability for instanced rendering

Texture atlases are an optimization and do not need to be part of the
first prototype.

------------------------------------------------------------------------

## 18. Instanced Rendering

If performance eventually becomes a problem, consider rendering image
cards with instancing.

Instead of hundreds of independent geometries:

``` text
one rectangle geometry
        ↓
hundreds of instances
```

Per-instance data could include:

-   Position
-   Rotation
-   Scale
-   UV region
-   Opacity
-   Selection/highlight state

A combination of instanced rendering and texture atlases could
efficiently support hundreds or thousands of observations.

Do not implement this prematurely. Start with conventional meshes and
profile actual performance first.

------------------------------------------------------------------------

## 19. Deep Zoom

A key feature could be allowing users to inspect extremely fine details
such as:

-   Compound eyes
-   Wing venation
-   Scales
-   Hairs
-   Antennae
-   Color patterns
-   Identification markings

Do not accomplish this by uploading a huge 20--50 megapixel image as one
WebGL texture.

Instead, use an image pyramid / tiled-image system.

Conceptually:

``` text
Level 0
      [whole image]

Level 1
   [ ][ ]
   [ ][ ]

Level 2
 [ ][ ][ ][ ]
 [ ][ ][ ][ ]
 [ ][ ][ ][ ]
 [ ][ ][ ][ ]
```

Only tiles intersecting the current viewport need to load.

This is conceptually similar to how online maps and high-resolution
museum viewers work.

Deep zoom should be treated as a separate rendering mode/system from the
primary WebGL collection visualization.

------------------------------------------------------------------------

## 20. Image Processing Pipeline

Recommended pipeline:

``` text
                 ORIGINAL PHOTO
                       │
                image processing
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
      256px          768px          1600px
        │              │              │
        ↓              ↓              ↓
    overview       group/near       specimen
        │
        └── optional thumbnail atlas

                       +

                image tile pyramid
                       ↓
                   deep zoom
```

Image variants and tiles should ideally be generated ahead of time
during ingestion/build rather than dynamically resized in the browser.

------------------------------------------------------------------------

## 21. Suggested Application Architecture

``` text
Vue 3 + TypeScript
│
├── Application UI
│   ├── Router
│   ├── Search
│   ├── Filters
│   ├── Specimen metadata
│   ├── Taxonomy navigation
│   └── Accessibility
│
├── Observation Data
│
├── Layout Engine
│   ├── Taxonomy layout
│   ├── Chronological layout
│   ├── Geographic layout
│   └── Similarity layout (future)
│
├── Image System
│   ├── BugTextureManager
│   ├── Texture cache
│   ├── Priority queue
│   ├── Resolution selection
│   └── Deep-zoom tiles
│
└── Three.js Scene
    ├── Camera controller
    ├── Image planes
    ├── Picking
    ├── Transitions
    ├── Labels
    └── Effects
```

The layout engine, image system, and renderer should remain separate
modules.

------------------------------------------------------------------------

# 22. MVP Scope

The first version should intentionally be much smaller than the complete
vision.

Implement:

-   Vue 3 + TypeScript shell
-   Three.js scene
-   Observation data model
-   Basic taxonomy grouping
-   Image planes
-   Camera navigation
-   Hover highlighting
-   Click-to-focus
-   Back/Escape navigation
-   Semantic zoom
-   256 / 768 / 1600 image variants
-   Lazy texture loading
-   Basic texture cache
-   Conventional specimen URLs
-   Taxonomy and chronological layout modes

Example interaction:

``` text
                 ALL BUGS

       beetles              moths
       · · ·                 · ·
      · · · ·                 ·

               dragonflies
                · · · ·
                  ·

                        bees
                        · ·
```

Hover:

``` text
thumbnail enlarges slightly
species/name appears
```

Click:

``` text
camera smoothly focuses observation
higher-resolution image loads
metadata appears
```

Back/Escape:

``` text
camera returns one semantic level
```

------------------------------------------------------------------------

## 23. Features to Defer

Do not initially build:

-   Complex custom shaders
-   Physics simulation
-   Full geographic map integration
-   Image similarity embeddings
-   AI identification
-   Elaborate taxonomy boundaries
-   Instanced rendering
-   Texture atlases unless profiling shows a need
-   Full deep-zoom infrastructure unless high-resolution inspection is
    central to the first release

The initial prototype should answer one question:

> Does navigating a spatial field of bug photographs feel compelling and
> useful?

Camera behavior, layout quality, and image loading should receive more
attention than visual effects.

------------------------------------------------------------------------

## 24. Design Principles

### Photography first

The insects and photographs should be visually dominant.

### Spatial organization should communicate information

3D positioning should represent taxonomy, chronology, geography,
similarity, or another meaningful relationship rather than arbitrary
decoration.

### Progressive disclosure

Do not show every label and every piece of metadata simultaneously.

### Semantic zoom

Distance should control information density.

### Fast initial load

Only fetch the assets necessary for the user's current view.

### Progressive image quality

Use the smallest texture that looks good at the current projected screen
size.

### Explicit GPU memory management

Dispose of textures that are no longer valuable.

### WebGL is enhancement, not the entire website

Every observation should remain accessible through conventional URLs and
UI.

### Optimize based on measurements

Start with simple Three.js meshes. Introduce atlases, instancing, or
more sophisticated rendering only when profiling demonstrates a need.

------------------------------------------------------------------------

# 25. Recommended Implementation Order

## Phase 1 --- Static Spatial Prototype

1.  Create a Three.js scene inside Vue.
2.  Load approximately 20--50 sample observations.
3.  Render each photograph on a plane.
4.  Implement camera movement.
5.  Implement hover and click selection.
6.  Experiment extensively with spatial layout.

Goal: validate the interaction concept.

## Phase 2 --- Semantic Navigation

1.  Add atlas/group/specimen states.
2.  Add semantic zoom thresholds.
3.  Add labels.
4.  Add animated transitions.
5.  Synchronize selection with Vue Router.

Goal: make spatial navigation understandable.

## Phase 3 --- Image Pipeline

1.  Generate 256, 768, and 1600 pixel derivatives.
2.  Add lazy texture loading.
3.  Add request prioritization.
4.  Add texture promotion.
5.  Add cache eviction and disposal.
6.  Test with several hundred observations.

Goal: maintain fast load and stable memory usage.

## Phase 4 --- Multiple Layouts

1.  Taxonomy
2.  Chronological
3.  Geographic, if useful
4.  Animate transitions between layouts.

Goal: make the collection explorable as data.

## Phase 5 --- Advanced Features

Potential later additions:

-   Deep zoom
-   Thumbnail atlases
-   Instanced rendering
-   Visual-similarity embeddings
-   Map integration
-   Identification tooling
-   Collection statistics

------------------------------------------------------------------------

# 26. Key Architectural Decision

The most important technical separation is:

``` text
OBSERVATION DATA
       │
       ↓
LAYOUT ENGINE
       │
       ↓
spatial coordinates
       │
       ↓
THREE.JS RENDERER
```

with image loading handled independently:

``` text
IMAGE ASSETS
     │
     ↓
BUG TEXTURE MANAGER
     │
     ↓
appropriate texture resolution
     │
     ↓
THREE.JS RENDERER
```

This allows the spatial organization, rendering implementation, and
image optimization strategy to evolve independently.

The result should be a web application where a collection of bug
sightings can be **explored spatially**, while retaining the
performance, accessibility, and navigability of a conventional website.
