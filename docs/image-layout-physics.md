# Image Layout and Physics

## The Problem

Images in the scene are 2D textured planes in 3D space. When positions are assigned naively — even with log-scaled cluster footprints — images within a dense group overlap. Overlap is visually noisy and actively misleads the user: two images that appear stacked suggest a single specimen, not two distinct observations.

Grid layouts solve overlap but feel artificial. Random scatter avoids overlap only by chance. What the scene needs is a layout that looks like specimens arranged on a cabinet tray — close together, clearly separated, and loosely organized by relationship.

A physics simulation run at **build time** is the right tool. It runs once, is not constrained by frame time, and produces stable, readable positions that the renderer just consumes.

---

## Why Physics / Force-Directed Layout

A force-directed simulation treats each image as a particle. Forces act between particles and between particles and anchor points. The simulation runs until the system reaches a low-energy equilibrium. The result is a layout that:

- Eliminates overlap by construction (separation force)
- Preserves taxonomic proximity (attraction to group center)
- Looks organic rather than mechanical (no grid lines, no rigid symmetry)
- Handles variable collection sizes without special cases

This is the same class of algorithm used by network graph tools (D3-force, Gephi) but applied here to spatial placement of image planes rather than graph nodes.

---

## Forces to Apply

Use a combination of three forces. Each is applied per simulation step. The simulation runs until velocity magnitude across all particles falls below a threshold (settled state).

### 1. Separation Force (repulsion)

Every pair of images that is closer than their combined half-widths plus a margin exerts a repulsive force on each other, proportional to overlap depth.

```
overlap = (halfWidth_A + halfWidth_B + margin) - distance(A, B)
if overlap > 0:
    force = overlap * separationStrength
    apply force along the A→B axis, equal and opposite
```

- `margin` is a small constant (e.g. 0.1 world units) to keep a readable gap between images.
- `separationStrength` is tuned so the simulation settles quickly without overshooting.
- Image sizes differ by zoom level. Use the **Group-level size** (768px derivative) as the reference size for layout — the level where individual photos become distinct.

### 2. Cluster Gravity (attraction to anchor)

Each image is attracted toward its taxonomy group's anchor point. This prevents the separation force from diffusing all images into a uniform field.

```
force = (anchorPosition - imagePosition) * gravityStrength
```

- The anchor point is the center of the group at the current effective rank (e.g., family centroid, genus centroid).
- `gravityStrength` is weaker than `separationStrength`. Gravity keeps the group coherent; separation resolves local conflicts.
- At the genus level, anchor toward the genus centroid. At the family level, anchor toward the family centroid. Each rank has its own anchor layer.

### 3. Damping

At each step, multiply each particle's velocity by a damping factor (e.g. 0.85). This removes energy from the system so it converges rather than oscillating indefinitely.

Without damping, particles overshoot, oscillate, and never settle.

---

## Simulation Structure

```ts
interface Particle {
  id: string
  position: Vector2         // XY only — Z is assigned separately
  velocity: Vector2
  halfWidth: number         // half of the image's display width at group zoom
  halfHeight: number
  anchorPosition: Vector2   // taxonomy group centroid at this rank
}

function runSimulation(particles: Particle[], steps = 300): void {
  for (let i = 0; i < steps; i++) {
    applyClusterGravity(particles)
    applySeparation(particles)
    integrate(particles)       // position += velocity
    applyDamping(particles)

    if (settled(particles)) break
  }
}
```

300 steps is a starting budget. Run until settled, cap at the budget. The cap is a safety net — a well-tuned simulation settles in 100–150 steps for typical group sizes.

---

## Z Coordinate

The simulation runs in 2D (XY). Z is assigned afterward as a function of taxonomy rank:

- Order level: Z = 0 (the base plane)
- Family level: Z = small positive offset (e.g. +0.5)
- Genus level: Z = larger offset (e.g. +1.0)
- Species level: Z = largest offset (e.g. +1.5)

This stratifies the taxonomy visually. Zooming in (moving the camera forward on Z) naturally surfaces deeper ranks as you approach. It also gives the scene genuine depth rather than a flat arrangement.

The Z offsets should be small relative to the camera's working range — enough to read as depth, not enough to create parallax confusion between ranks.

---

## Handling Variable Group Sizes

### Sparse groups (1–5 observations)

The simulation is trivially fast. With so few particles, separation resolves in a handful of steps. The result is a small, tight cluster that occupies a footprint proportional to the observation count (log-scaled, as defined in `plan.md` concern #6).

No special casing is needed. The simulation handles this naturally.

### Dense groups (50–200 observations)

The naive O(n²) separation check (all pairs) becomes expensive at large n. For typical insect collections, 200 observations per order is an upper bound, and O(n²) at 200 is 40,000 pair checks per step — fast enough at build time.

If the collection grows to thousands of observations in a single order, switch the separation force to a **Barnes-Hut spatial tree** (O(n log n)). Build time is not a concern until it exceeds a minute or two. Profile before optimizing.

### Uneven groups within a cluster

Some genera may have 1 observation, others 15. The log-scale footprint rule ensures that small genera are not invisible, but their few images will naturally settle closer to the genus anchor while large genera spread wider. This is correct behavior — density reflects abundance.

---

## Initialization

Start each particle at its taxonomy group's centroid plus a small random offset. Do not start all particles at the exact centroid — coincident starting positions produce degenerate force vectors (zero distance = undefined direction).

```ts
position = anchorPosition + randomOffset(radius = 0.1)
```

Use a **seeded random number generator** (not `Math.random()`) so the layout is deterministic across builds. The same collection always produces the same layout.

---

## Multi-Level Simulation

The taxonomy has multiple levels. Run a separate simulation pass for each effective rank level, bottom-up:

1. **Species level:** Simulate images within each genus. Anchor each image to its genus centroid.
2. **Genus level:** Treat each genus as a single point (its centroid after step 1). Simulate genera within each family. Anchor to family centroid.
3. **Family level:** Treat each family as a single point. Simulate families within each order. Anchor to order centroid.
4. **Atlas level:** Simulate order clusters. No anchor — allow them to spread freely within the available canvas.

After each pass, propagate the new centroids upward. The result is a hierarchically consistent layout: images within a genus are tight, genera within a family are grouped, families within an order are arranged coherently.

---

## Output Format

The simulation outputs a flat position map, keyed by observation ID:

```ts
interface LayoutResult {
  [observationId: string]: {
    x: number
    y: number
    z: number
    scale: number    // display scale at this level, 1.0 = base size
  }
}
```

This is the same shape expected by the layout engine defined in `plan.md`. The physics simulation is one implementation of a layout mode.

Store the result in `observations-layout.json` alongside `observations.json`. The renderer loads it at startup and does not recompute positions.

---

## Animated Transitions Between Layouts

When the user switches layout modes (taxonomy → chronological), each image animates from its current position to its new position. The transition interpolates `x`, `y`, `z`, and `scale` over a fixed duration (e.g. 800ms, ease-in-out).

The physics simulation guarantees non-overlapping positions in the taxonomy layout. Other layout modes (chronological, geographic) produce their own position maps via their own algorithms. The transition animation does not care how positions were computed — it just tweens between two snapshots.

If a new layout mode also benefits from separation (e.g. geographic clustering produces overlaps), run the physics simulation for that mode too, using geographic centroid as the anchor instead of taxonomy centroid.

---

## Connection to the Layout Engine (Phase 5)

The physics simulation is not built until Phase 5. In Phase 1 and Phase 2, positions are hardcoded. In Phase 3, positions are computed with a simpler algorithm (e.g. polar coordinates around a centroid) to validate the zoom and label systems.

The simulation is introduced in Phase 5 when at least two layout modes exist and the shared shape of the layout interface is visible. At that point, replace the simple positioning with the physics simulation for the taxonomy mode, profile the build time, and tune `separationStrength` and `gravityStrength` against the real collection.

Do not pre-tune constants against a synthetic dataset. Real insect collections have irregular densities and aspect ratios that synthetic data does not replicate.

---

## Summary

| Concern | Approach |
|---|---|
| Overlap | Separation force proportional to overlap depth |
| Taxonomic grouping | Cluster gravity toward hierarchy anchor points |
| Oscillation / divergence | Velocity damping per step |
| Z depth | Assigned post-simulation by taxonomy rank |
| Large groups | O(n²) is sufficient; upgrade to Barnes-Hut if needed |
| Determinism | Seeded RNG for initialization |
| Multi-level hierarchy | Separate simulation pass per rank, bottom-up |
| Build time | Run once at build time; renderer consumes static output |
