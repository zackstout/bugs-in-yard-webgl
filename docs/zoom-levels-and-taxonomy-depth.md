# Zoom Levels and Taxonomy Depth

## The Problem

The application defines three semantic zoom levels: **Atlas**, **Group**, and **Specimen**. These levels feel natural when a taxonomic group contains dozens of observations spread across families, genera, and species. But the real collection will not be uniform.

Some orders in the collection will have a single observation. Others will have many, with meaningful branching at multiple ranks — suborder, infraorder, superfamily, family, subfamily, tribe, genus, species. If the zoom model is rigid, sparse groups feel broken and dense groups feel shallow.

The goal is a zoom experience that feels continuous and proportionate regardless of how deep or shallow a given branch of the taxonomy is.

---

## The Core Insight

The three zoom levels — **Atlas**, **Group**, and **Specimen** — are **semantic positions**, not fixed camera distances. What changes between groups is not the number of levels but what each level *reveals*.

However, not every group traverses all three levels. A single-observation order has nothing to navigate inside — the Group level is skipped and the camera goes straight to Specimen. A dense order with multiple families and genera produces multiple nested Group levels before Specimen is reached.

The camera distance that triggers a level transition should scale with the footprint of the group being entered. A group with one beetle has a small footprint. The camera reaches Specimen depth much sooner. A group with 150 beetles spanning multiple families has a large footprint. The Group level contains several layers of meaningful content before Specimen becomes relevant.

This means:
- The zoom levels are not always all present.
- What is visible at each level adapts to the density and depth of the active group.

---

## Navigation Stack

Navigation is **stack-based**. Each entry on the stack represents a zoom level into a finer sub-cluster. The stack drives both what the camera targets and what labels are shown.

```
[]                                   → Atlas
[Coleoptera]                         → inside the Beetles order cluster
[Coleoptera, Coccinellidae]          → inside the Ladybug family sub-cluster
[Coleoptera, Coccinellidae, b1]      → Specimen
```

**Rules:**

1. **Always enter via order first.** From Atlas, clicking any observation always pushes the order level, regardless of current camera position. The renderer never infers depth from camera distance and skips intermediate levels.

2. **Skip any node with exactly one observation (fast path).** If a node in the effective rank tree has only one observation, that node is not a meaningful navigation stop. Push past it to the next level.
   - An order with 1 observation → skip order level, go straight to Specimen. *(Odonata example: `[] → [od1]`)*
   - A family with 1 observation within its order → skip family level, go straight to Specimen. *(Elateridae within Coleoptera: `[Coleoptera] → [b7]`)*

3. **Escape pops one level.** From Specimen, Escape returns to the enclosing group. From a group, Escape returns to the next coarser level (or Atlas if the stack is empty).

4. **Stack depth is bounded by the effective rank tree.** A group with effective depth 1 produces a maximum stack depth of 2 (order + specimen). A group with effective depth 3 produces a maximum stack depth of 4.

---

## iNaturalist Taxonomy Ranks

iNaturalist uses the following ranks (coarsest to finest):

```
kingdom → phylum → class → order
  → suborder → infraorder → superfamily
    → family → subfamily → tribe → subtribe
      → genus → subgenus → species → subspecies
```

Not every observation uses every rank. A well-identified beetle might fill genus and species. A casual observation might reach only order or family. The layout engine must work with whatever is actually present.

---

## Effective Ranks

For any given branch of the taxonomy, most intermediate ranks will be absent or trivial (only one child). A rank is **effective** for a branch if it has more than one child within the collection.

Example: if every beetle in the collection is in the family Coccinellidae, then `family` is not an effective rank — it does not split anything. The next effective rank might be `genus`.

**Build a tree of effective ranks per group at build time**, not at render time. This tree drives layout and label decisions.

```ts
interface TaxonNode {
  rank: string              // e.g. "order", "family", "genus"
  name: string
  children: TaxonNode[]
  observationIds: string[]  // direct observations at this node (unresolved to finer rank)
  depth: number             // depth within the effective tree (0 = root at Atlas)
}
```

---

## How Zoom Levels Map to Taxonomy Depth

### Case 1 — Single observation in an order

Effective tree depth: 0 (just the observation itself).

- **Atlas:** The observation appears as a single point or thumbnail in the overall collection. It is labeled by the finest rank available.
- **Group:** Skipped. There is no cluster to navigate — only one observation exists in this order.
- **Specimen:** Clicking from Atlas goes directly to Specimen. The navigation stack is `[] → [obs]`.

The user does not experience a "missing" level — the camera animates smoothly from the Atlas position directly toward the photo. There is no empty intermediate stop.

**Implementation note:** Apply the fast-path rule at the order level. If the order contains exactly one observation, do not push an order group state. Push Specimen directly.

---

### Case 2 — Small group, one effective rank below order

Example: 4 observations, all different families, no meaningful genus/species splits.

Effective tree depth: 1 (order → families).

- **Atlas:** Cluster visible. Label shows order.
- **Group:** Camera enters the cluster. Individual photos become visible, arranged by family. Family labels appear. No further subgroup nesting exists.
- **Specimen:** Select one photo.

This is the baseline case the plan was designed around. It works as described.

---

### Case 3 — Dense group, multiple effective ranks

Example: 60 beetle observations spanning 5 families, 12 genera, 30 species.

Effective tree depth: 3 (order → family → genus → species).

- **Atlas:** Cluster visible. Label shows order (Coleoptera).
- **Group (outer):** Camera enters the cluster. Family-level subclusters become visible. Labels show family names. Individual photos are small or not yet shown.
- **Group (inner):** Camera moves toward a family subcluster. Genus-level groupings appear. Thumbnails become distinct. Labels show genus names.
- **Specimen:** Select one photo.

This requires the Group level to contain **layers**. The camera traverses from the family level down to the genus level within a single semantic zoom level.

**Implementation approach:** Use the effective tree depth to compute intermediate camera positions within the Group level. Each effective rank below the Atlas level gets a proportional share of the camera travel from cluster entry to Specimen approach. Labels and thumbnails fade in at their corresponding depth threshold.

---

## Continuous Depth Thresholds

Define thresholds as normalized camera distances within a group's footprint, not as absolute world-space distances.

```ts
interface GroupDepthThresholds {
  familyLabel: number      // 0.0 = cluster edge, 1.0 = specimen
  genusLabel: number
  thumbnailsVisible: number
  speciesLabel: number
}
```

For a group with only one effective rank, compress the thresholds. The camera crosses all of them quickly. For a group with three effective ranks, spread them across the full depth of travel.

This produces continuous, proportionate behavior without conditional logic in the renderer.

---

## Labels

Labels should appear at the rank that is **meaningful at the current zoom level for the current group**.

Rules:
- At Atlas level, label clusters by the coarsest rank that makes them distinct from neighbors (usually order).
- Entering a Group, surface the next effective rank label as the camera approaches.
- Never show a label for a rank that does not branch in the current view. If all visible observations are in the same family, the family label is redundant — show the genus labels instead.
- For a single-observation group, show the finest available rank as the label from the beginning.

---

## Minimum Footprint

From `plan.md`, concern #6: cluster spread is proportional to observation count on a log scale, with a minimum floor.

Apply the same floor to all groups, including single-observation ones. A single beetle still occupies a visible footprint at the Atlas level. It does not shrink to a point.

The minimum footprint should be large enough that the observation is clickable and its thumbnail is recognizable at Atlas zoom.

---

## Edge Cases

### Observation identified only to family (no genus or species)

Place it at the family node in the effective tree. In the Group level it appears alongside genus/species observations at the family-level ring, visually distinct (slightly offset, different label style). Do not discard it or push it to a catch-all position.

### Two observations, same species

Both appear at the same leaf node of the effective tree. At Specimen zoom they are side by side. This is a valid and common case (multiple visits to the same organism). Do not collapse them into one.

### One observation per genus, many genera

The genus level is effective (many genera), but the species level is not (each genus has only one observation). Skip the species label layer. Move from genus labels directly to Specimen.

### Observation with no taxonomy at all (no ID)

Place it in a dedicated "Unidentified" cluster at the Atlas level. It is accessible but spatially separate from identified groups. Do not invent a taxonomy position for it.

---

## Summary Table

| Group type | Effective depth | Stack | Atlas | Group behavior | Specimen |
|---|---|---|---|---|---|
| 1 observation | 0 | `[] → [obs]` | Single point, finest known rank label | **Skipped** | Direct from Atlas |
| Few obs, 1 rank | 1 | `[] → [order] → [obs]` | Cluster, order label | Family/subgroup labels, photos visible | Normal |
| Many obs, 2+ ranks | 2–3 | `[] → [order] → [family] → [obs]` | Cluster, order label | Layered: family → genus, progressive labels | Normal |
| Unidentified | — | `[] → [obs]` | Separate cluster | **Skipped** | Direct from Atlas |

---

## Relationship to the Layout Engine (Phase 5)

The layout engine needs the effective rank tree to place observations in meaningful spatial positions. Build the effective rank tree as a separate pre-processing step during the build script, alongside `observations.json`.

The renderer consumes the tree to:
- Set Group entry and depth thresholds per cluster
- Decide which labels to show and when
- Scale cluster footprints

Do not hard-code this logic in the renderer. Pass it in as data, the same way positions are passed in.
