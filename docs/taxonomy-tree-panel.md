# Taxonomy Tree — Side Panel Design

## Overview

The taxonomy tree view (`TaxonomyTree.vue`) is a hierarchical reference view of the full collection. Every node in the tree is clickable. Clicking any node opens a side panel showing the contents of that node. The panel supports drill-down navigation independent of the tree.

---

## Selection Model

The selected node is a discriminated union covering all taxonomy ranks:

```ts
type SelectedNode =
  | { kind: 'order';     node: OrderNode }
  | { kind: 'family';    node: FamilyNode }
  | { kind: 'subfamily'; node: SubfamilyNode }
  | { kind: 'tribe';     node: TribeNode }
  | { kind: 'genus';     node: GenusNode }
  | { kind: 'species';   node: SpeciesNode }
```

The panel switches on `kind` to decide what to render.

---

## Panel Content by Rank

### Species
- Scientific name (italic) + common name if available
- Observation count
- Full image grid — all observations with an image, square-cropped

### Genus and above (order, family, subfamily, tribe, genus)
- Rank label + name + common name if available
- Total observation count across all descendants
- **One card per direct child**, sorted alphabetically
  - Child name
  - Observation count for that child's subtree
  - Up to 3 representative images (first images found walking down to observations)

---

## Panel Drill-Down

Clicking a child card inside the panel navigates one level deeper — the panel updates to show that child's contents. The tree selection highlight stays on the originally clicked node.

This lets a user click a family in the tree, then explore its genera and species entirely within the panel, without scrolling back to the tree.

The close button clears the panel entirely. Clicking a different node in the tree resets the panel to that node (no drill-down history is preserved across tree clicks).

---

## Representative Images

A helper function `representativeImages(node, max)` walks down the node's subtree — through whatever ranks are present — until it finds observations with an `imageFile`. Returns the first `max` image URLs found. Used to populate child cards at genus and above.

```ts
function representativeImages(node: GenusNode | TribeNode | SubfamilyNode | FamilyNode | OrderNode, max: number): string[]
```

---

## Layout

The tree view and panel share horizontal space (`display: flex`):
- Tree: `flex: 1`, scrollable, minimum width respected
- Panel: fixed width (`50vw`), scrollable independently, bordered left edge

The panel only renders when a node is selected (`v-if="selectedNode"`).

---

## Interaction Rules

| Action | Result |
|---|---|
| Click any tree node | Panel opens/updates to that node |
| Click child card in panel | Panel drills into that child |
| Click close button | Panel clears |
| Click same node again | No change (already selected) |
| Click different tree node | Panel resets to new node, drill-down history cleared |

---

## Common Names

- Orders: looked up via `orderCommonNames` (`src/data/commonNames/orderCommonNames.ts`)
- Families: looked up via `familyCommonNames` (`src/data/commonNames/familyCommonNames.ts`)
- Species: derived from the first observation with a non-"Unknown" `commonName`
- Subfamily, tribe, genus: no common name lookup (not available in current data)
