<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { observations } from "../data/observations";
import { familyCommonNames } from "../data/commonNames/familyCommonNames";
import { orderCommonNames } from "../data/commonNames/orderCommonNames";
import type { Observation } from "../types/Observation";

// ── Node interfaces ───────────────────────────────────────────────────────────

interface SpeciesNode {
  scientificName: string;
  obs: Observation[];
}

interface GenusNode {
  genus: string;
  species: SpeciesNode[];
  unspecified: Observation[];
}

interface TribeNode {
  tribe: string;
  genera: GenusNode[];
  unspecified: Observation[];
}

interface SubfamilyNode {
  subfamily: string;
  tribes: TribeNode[];
  genera: GenusNode[];
  unspecified: Observation[];
}

interface FamilyNode {
  family: string;
  subfamilies: SubfamilyNode[];
  tribes: TribeNode[];
  genera: GenusNode[];
  unspecified: Observation[];
}

interface OrderNode {
  order: string;
  families: FamilyNode[];
  unspecified: Observation[];
}

interface TaxonomyTree {
  orders: OrderNode[];
  unspecified: Observation[];
}

// ── Internal map types ────────────────────────────────────────────────────────

type GenusMap = Map<
  string,
  { speciesMap: Map<string, Observation[]>; unspecified: Observation[] }
>;
type TribeMap = Map<string, { genusMap: GenusMap; unspecified: Observation[] }>;
type SubfamilyMap = Map<
  string,
  { tribeMap: TribeMap; genusMap: GenusMap; unspecified: Observation[] }
>;
type FamilyMap = Map<
  string,
  {
    subfamilyMap: SubfamilyMap;
    tribeMap: TribeMap;
    genusMap: GenusMap;
    unspecified: Observation[];
  }
>;

function getOrCreate<K, V>(map: Map<K, V>, key: K, init: () => V): V {
  if (!map.has(key)) map.set(key, init());
  return map.get(key)!;
}

function buildGenusMap(genusMap: GenusMap): GenusNode[] {
  return Array.from(genusMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([genus, { speciesMap, unspecified }]) => ({
      genus,
      species: Array.from(speciesMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scientificName, obs]) => ({ scientificName, obs })),
      unspecified,
    }));
}

function buildTribeMap(tribeMap: TribeMap): TribeNode[] {
  return Array.from(tribeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tribe, { genusMap, unspecified }]) => ({
      tribe,
      genera: buildGenusMap(genusMap),
      unspecified,
    }));
}

function buildSubfamilyMap(subfamilyMap: SubfamilyMap): SubfamilyNode[] {
  return Array.from(subfamilyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subfamily, { tribeMap, genusMap, unspecified }]) => ({
      subfamily,
      tribes: buildTribeMap(tribeMap),
      genera: buildGenusMap(genusMap),
      unspecified,
    }));
}

const tree = computed<TaxonomyTree>(() => {
  const orderMap = new Map<
    string,
    { familyMap: FamilyMap; unspecified: Observation[] }
  >();
  const topUnspecified: Observation[] = [];

  for (const obs of observations) {
    if (!obs.order) {
      topUnspecified.push(obs);
      continue;
    }

    const orderEntry = getOrCreate(orderMap, obs.order, () => ({
      familyMap: new Map(),
      unspecified: [],
    }));
    if (!obs.family) {
      orderEntry.unspecified.push(obs);
      continue;
    }

    const familyEntry = getOrCreate(orderEntry.familyMap, obs.family, () => ({
      subfamilyMap: new Map(),
      tribeMap: new Map(),
      genusMap: new Map(),
      unspecified: [],
    }));

    let genusContainer: { genusMap: GenusMap; unspecified: Observation[] };
    if (obs.subfamily) {
      const subfamilyEntry = getOrCreate(
        familyEntry.subfamilyMap,
        obs.subfamily,
        () => ({
          tribeMap: new Map(),
          genusMap: new Map(),
          unspecified: [],
        }),
      );
      if (obs.tribe) {
        genusContainer = getOrCreate(
          subfamilyEntry.tribeMap,
          obs.tribe,
          () => ({ genusMap: new Map(), unspecified: [] }),
        );
      } else {
        genusContainer = subfamilyEntry;
      }
    } else if (obs.tribe) {
      genusContainer = getOrCreate(familyEntry.tribeMap, obs.tribe, () => ({
        genusMap: new Map(),
        unspecified: [],
      }));
    } else {
      genusContainer = familyEntry;
    }

    if (!obs.genus) {
      genusContainer.unspecified.push(obs);
      continue;
    }

    const genusEntry = getOrCreate(genusContainer.genusMap, obs.genus, () => ({
      speciesMap: new Map(),
      unspecified: [],
    }));
    if (!obs.species) {
      genusEntry.unspecified.push(obs);
      continue;
    }

    const speciesKey = `${obs.genus} ${obs.species}`;
    getOrCreate(genusEntry.speciesMap, speciesKey, () => []).push(obs);
  }

  const orders: OrderNode[] = Array.from(orderMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([order, { familyMap, unspecified }]) => ({
      order,
      families: Array.from(familyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([
            family,
            { subfamilyMap, tribeMap, genusMap, unspecified: famUnspec },
          ]) => ({
            family,
            subfamilies: buildSubfamilyMap(subfamilyMap),
            tribes: buildTribeMap(tribeMap),
            genera: buildGenusMap(genusMap),
            unspecified: famUnspec,
          }),
        ),
      unspecified,
    }));

  return { orders, unspecified: topUnspecified };
});

// ── Selection ─────────────────────────────────────────────────────────────────

type SelectedNode =
  | { kind: "order";     node: OrderNode }
  | { kind: "family";    node: FamilyNode }
  | { kind: "subfamily"; node: SubfamilyNode }
  | { kind: "tribe";     node: TribeNode }
  | { kind: "genus";     node: GenusNode }
  | { kind: "species";   node: SpeciesNode }

// shallowRef keeps node objects unwrapped so === identity checks work in template.
const selectedNode = shallowRef<SelectedNode | null>(null);

function selectNode(n: SelectedNode) {
  selectedNode.value = n;
}

function isSelected(node: object): boolean {
  return selectedNode.value?.node === node;
}

// ── Observation count helpers ─────────────────────────────────────────────────

function genusObsCount(n: GenusNode): number {
  return n.unspecified.length + n.species.reduce((s, sp) => s + sp.obs.length, 0);
}
function tribeObsCount(n: TribeNode): number {
  return n.unspecified.length + n.genera.reduce((s, g) => s + genusObsCount(g), 0);
}
function subfamilyObsCount(n: SubfamilyNode): number {
  return (
    n.unspecified.length +
    n.tribes.reduce((s, t) => s + tribeObsCount(t), 0) +
    n.genera.reduce((s, g) => s + genusObsCount(g), 0)
  );
}
function familyObsCount(n: FamilyNode): number {
  return (
    n.unspecified.length +
    n.subfamilies.reduce((s, sf) => s + subfamilyObsCount(sf), 0) +
    n.tribes.reduce((s, t) => s + tribeObsCount(t), 0) +
    n.genera.reduce((s, g) => s + genusObsCount(g), 0)
  );
}
function orderObsCount(n: OrderNode): number {
  return n.unspecified.length + n.families.reduce((s, f) => s + familyObsCount(f), 0);
}
function selectedObsCount(sel: SelectedNode): number {
  switch (sel.kind) {
    case "order":     return orderObsCount(sel.node);
    case "family":    return familyObsCount(sel.node);
    case "subfamily": return subfamilyObsCount(sel.node);
    case "tribe":     return tribeObsCount(sel.node);
    case "genus":     return genusObsCount(sel.node);
    case "species":   return sel.node.obs.length;
  }
}

// ── Representative image helpers ──────────────────────────────────────────────

function grabImages(obs: Observation[], into: string[], max: number) {
  for (const o of obs) {
    if (into.length >= max) return;
    if (o.imageFile) into.push(o.imageFile);
  }
}

function genusImages(n: GenusNode, max: number): string[] {
  const imgs: string[] = [];
  grabImages(n.unspecified, imgs, max);
  for (const sp of n.species) {
    if (imgs.length >= max) break;
    grabImages(sp.obs, imgs, max);
  }
  return imgs;
}

function tribeImages(n: TribeNode, max: number): string[] {
  const imgs: string[] = [];
  grabImages(n.unspecified, imgs, max);
  for (const g of n.genera) {
    if (imgs.length >= max) break;
    imgs.push(...genusImages(g, max - imgs.length));
  }
  return imgs;
}

function subfamilyImages(n: SubfamilyNode, max: number): string[] {
  const imgs: string[] = [];
  grabImages(n.unspecified, imgs, max);
  for (const t of n.tribes) {
    if (imgs.length >= max) break;
    imgs.push(...tribeImages(t, max - imgs.length));
  }
  for (const g of n.genera) {
    if (imgs.length >= max) break;
    imgs.push(...genusImages(g, max - imgs.length));
  }
  return imgs;
}

function familyImages(n: FamilyNode, max: number): string[] {
  const imgs: string[] = [];
  grabImages(n.unspecified, imgs, max);
  for (const sf of n.subfamilies) {
    if (imgs.length >= max) break;
    imgs.push(...subfamilyImages(sf, max - imgs.length));
  }
  for (const t of n.tribes) {
    if (imgs.length >= max) break;
    imgs.push(...tribeImages(t, max - imgs.length));
  }
  for (const g of n.genera) {
    if (imgs.length >= max) break;
    imgs.push(...genusImages(g, max - imgs.length));
  }
  return imgs;
}

function orderImages(n: OrderNode, max: number): string[] {
  const imgs: string[] = [];
  grabImages(n.unspecified, imgs, max);
  for (const f of n.families) {
    if (imgs.length >= max) break;
    imgs.push(...familyImages(f, max - imgs.length));
  }
  return imgs;
}

// ── Panel header helpers ──────────────────────────────────────────────────────

function panelName(sel: SelectedNode): string {
  switch (sel.kind) {
    case "order":     return sel.node.order;
    case "family":    return sel.node.family;
    case "subfamily": return sel.node.subfamily;
    case "tribe":     return sel.node.tribe;
    case "genus":     return sel.node.genus;
    case "species":   return sel.node.scientificName;
  }
}

function panelRankLabel(sel: SelectedNode): string {
  const labels: Record<SelectedNode["kind"], string> = {
    order: "Order", family: "Family", subfamily: "Subfamily",
    tribe: "Tribe", genus: "Genus", species: "Species",
  };
  return labels[sel.kind];
}

function speciesCommonName(node: SpeciesNode): string | null {
  for (const o of node.obs) {
    if (o.commonName && o.commonName !== "Unknown") return o.commonName;
  }
  return null;
}

function panelCommonName(sel: SelectedNode): string | null {
  switch (sel.kind) {
    case "order":   return orderCommonNames[sel.node.order] ?? null;
    case "family":  return familyCommonNames[sel.node.family] ?? null;
    case "species": return speciesCommonName(sel.node);
    default:        return null;
  }
}

// ── Panel children (drill-down) ───────────────────────────────────────────────

interface PanelChild {
  rankLabel: string;
  name: string;
  isSpecies: boolean;
  commonName: string | null;
  count: number;
  images: string[];
  selection: SelectedNode;
}

const panelChildren = computed<PanelChild[]>(() => {
  const sel = selectedNode.value;
  if (!sel || sel.kind === "species") return [];

  switch (sel.kind) {
    case "genus":
      return sel.node.species.map((sp) => ({
        rankLabel: "Species",
        name: sp.scientificName,
        isSpecies: true,
        commonName: speciesCommonName(sp),
        count: sp.obs.length,
        images: sp.obs.filter((o) => o.imageFile).map((o) => o.imageFile).slice(0, 3),
        selection: { kind: "species" as const, node: sp },
      }));

    case "tribe":
      return sel.node.genera.map((g) => ({
        rankLabel: "Genus",
        name: g.genus,
        isSpecies: false,
        commonName: null,
        count: genusObsCount(g),
        images: genusImages(g, 3),
        selection: { kind: "genus" as const, node: g },
      }));

    case "subfamily": {
      const children: PanelChild[] = [];
      for (const t of sel.node.tribes)
        children.push({ rankLabel: "Tribe", name: t.tribe, isSpecies: false, commonName: null, count: tribeObsCount(t), images: tribeImages(t, 3), selection: { kind: "tribe" as const, node: t } });
      for (const g of sel.node.genera)
        children.push({ rankLabel: "Genus", name: g.genus, isSpecies: false, commonName: null, count: genusObsCount(g), images: genusImages(g, 3), selection: { kind: "genus" as const, node: g } });
      return children;
    }

    case "family": {
      const children: PanelChild[] = [];
      for (const sf of sel.node.subfamilies)
        children.push({ rankLabel: "Subfamily", name: sf.subfamily, isSpecies: false, commonName: null, count: subfamilyObsCount(sf), images: subfamilyImages(sf, 3), selection: { kind: "subfamily" as const, node: sf } });
      for (const t of sel.node.tribes)
        children.push({ rankLabel: "Tribe", name: t.tribe, isSpecies: false, commonName: null, count: tribeObsCount(t), images: tribeImages(t, 3), selection: { kind: "tribe" as const, node: t } });
      for (const g of sel.node.genera)
        children.push({ rankLabel: "Genus", name: g.genus, isSpecies: false, commonName: null, count: genusObsCount(g), images: genusImages(g, 3), selection: { kind: "genus" as const, node: g } });
      return children;
    }

    case "order":
      return sel.node.families.map((f) => ({
        rankLabel: "Family",
        name: f.family,
        isSpecies: false,
        commonName: familyCommonNames[f.family] ?? null,
        count: familyObsCount(f),
        images: familyImages(f, 3),
        selection: { kind: "family" as const, node: f },
      }));
  }
});

// ── Label helpers ─────────────────────────────────────────────────────────────

function obsLabel(obs: Observation): string {
  const name =
    obs.commonName && obs.commonName !== "Unknown" ? obs.commonName : null;
  return name || obs.scientificName || obs.id;
}

function groupedLabels(obs: Observation[]): string[] {
  const counts = new Map<string, number>();
  for (const o of obs) {
    const label = obsLabel(o);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, n]) =>
    n > 1 ? `${label} (${n})` : label,
  );
}
</script>

<template>
  <div class="tree-layout">
    <div class="tree-view">
      <h1 class="tree-title">All Samples — Taxonomy Tree</h1>
      <p class="tree-count">{{ observations.length }} observations</p>

      <ul class="tree-root">
        <!-- Observations with no order -->
        <li
          v-for="label in groupedLabels(tree.unspecified)"
          :key="label"
          class="node node-obs"
        >
          {{ label }}
        </li>

        <!-- Orders -->
        <li
          v-for="orderNode in tree.orders"
          :key="orderNode.order"
          class="node node-order"
          :class="{ 'node--selected': isSelected(orderNode) }"
          @click.stop="selectNode({ kind: 'order', node: orderNode })"
        >
          <span class="rank-label">Order</span>
          <span class="taxon-name">{{ orderNode.order }}</span>
          <span v-if="orderCommonNames[orderNode.order]" class="common-name">{{ orderCommonNames[orderNode.order] }}</span>

          <ul>
            <li
              v-for="label in groupedLabels(orderNode.unspecified)"
              :key="label"
              class="node node-obs"
            >
              {{ label }}
            </li>

            <!-- Families -->
            <li
              v-for="familyNode in orderNode.families"
              :key="familyNode.family"
              class="node node-family"
              :class="{ 'node--selected': isSelected(familyNode) }"
              @click.stop="selectNode({ kind: 'family', node: familyNode })"
            >
              <span class="rank-label">Family</span>
              <span class="taxon-name">{{ familyNode.family }}</span>
              <span v-if="familyCommonNames[familyNode.family]" class="common-name">{{ familyCommonNames[familyNode.family] }}</span>

              <ul>
                <li
                  v-for="label in groupedLabels(familyNode.unspecified)"
                  :key="label"
                  class="node node-obs"
                >
                  {{ label }}
                </li>

                <!-- Subfamilies -->
                <li
                  v-for="subfamilyNode in familyNode.subfamilies"
                  :key="subfamilyNode.subfamily"
                  class="node node-subfamily"
                  :class="{ 'node--selected': isSelected(subfamilyNode) }"
                  @click.stop="selectNode({ kind: 'subfamily', node: subfamilyNode })"
                >
                  <span class="rank-label">Subfamily</span>
                  <span class="taxon-name">{{ subfamilyNode.subfamily }}</span>

                  <ul>
                    <li
                      v-for="label in groupedLabels(subfamilyNode.unspecified)"
                      :key="label"
                      class="node node-obs"
                    >
                      {{ label }}
                    </li>

                    <li
                      v-for="tribeNode in subfamilyNode.tribes"
                      :key="tribeNode.tribe"
                      class="node node-tribe"
                      :class="{ 'node--selected': isSelected(tribeNode) }"
                      @click.stop="selectNode({ kind: 'tribe', node: tribeNode })"
                    >
                      <span class="rank-label">Tribe</span>
                      <span class="taxon-name">{{ tribeNode.tribe }}</span>

                      <ul>
                        <li
                          v-for="label in groupedLabels(tribeNode.unspecified)"
                          :key="label"
                          class="node node-obs"
                        >
                          {{ label }}
                        </li>

                        <li
                          v-for="genusNode in tribeNode.genera"
                          :key="genusNode.genus"
                          class="node node-genus"
                          :class="{ 'node--selected': isSelected(genusNode) }"
                          @click.stop="selectNode({ kind: 'genus', node: genusNode })"
                        >
                          <span class="rank-label">Genus</span>
                          <span class="taxon-name">{{ genusNode.genus }}</span>

                          <ul>
                            <li
                              v-for="label in groupedLabels(genusNode.unspecified)"
                              :key="label"
                              class="node node-obs"
                            >
                              {{ label }}
                            </li>

                            <li
                              v-for="speciesNode in genusNode.species"
                              :key="speciesNode.scientificName"
                              class="node node-species"
                              :class="{ 'node--selected': isSelected(speciesNode) }"
                              @click.stop="selectNode({ kind: 'species', node: speciesNode })"
                            >
                              <span class="taxon-name taxon-name--species">{{ speciesNode.scientificName }}</span>

                              <ul>
                                <li
                                  v-for="label in groupedLabels(speciesNode.obs)"
                                  :key="label"
                                  class="node node-obs"
                                >
                                  {{ label }}
                                </li>
                              </ul>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>

                    <!-- Genera directly under subfamily -->
                    <li
                      v-for="genusNode in subfamilyNode.genera"
                      :key="genusNode.genus"
                      class="node node-genus"
                      :class="{ 'node--selected': isSelected(genusNode) }"
                      @click.stop="selectNode({ kind: 'genus', node: genusNode })"
                    >
                      <span class="rank-label">Genus</span>
                      <span class="taxon-name">{{ genusNode.genus }}</span>

                      <ul>
                        <li
                          v-for="label in groupedLabels(genusNode.unspecified)"
                          :key="label"
                          class="node node-obs"
                        >
                          {{ label }}
                        </li>

                        <li
                          v-for="speciesNode in genusNode.species"
                          :key="speciesNode.scientificName"
                          class="node node-species"
                          :class="{ 'node--selected': isSelected(speciesNode) }"
                          @click.stop="selectNode({ kind: 'species', node: speciesNode })"
                        >
                          <span class="taxon-name taxon-name--species">{{ speciesNode.scientificName }}</span>

                          <ul>
                            <li
                              v-for="label in groupedLabels(speciesNode.obs)"
                              :key="label"
                              class="node node-obs"
                            >
                              {{ label }}
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <!-- Tribes directly under family -->
                <li
                  v-for="tribeNode in familyNode.tribes"
                  :key="tribeNode.tribe"
                  class="node node-tribe"
                  :class="{ 'node--selected': isSelected(tribeNode) }"
                  @click.stop="selectNode({ kind: 'tribe', node: tribeNode })"
                >
                  <span class="rank-label">Tribe</span>
                  <span class="taxon-name">{{ tribeNode.tribe }}</span>

                  <ul>
                    <li
                      v-for="label in groupedLabels(tribeNode.unspecified)"
                      :key="label"
                      class="node node-obs"
                    >
                      {{ label }}
                    </li>

                    <li
                      v-for="genusNode in tribeNode.genera"
                      :key="genusNode.genus"
                      class="node node-genus"
                      :class="{ 'node--selected': isSelected(genusNode) }"
                      @click.stop="selectNode({ kind: 'genus', node: genusNode })"
                    >
                      <span class="rank-label">Genus</span>
                      <span class="taxon-name">{{ genusNode.genus }}</span>

                      <ul>
                        <li
                          v-for="label in groupedLabels(genusNode.unspecified)"
                          :key="label"
                          class="node node-obs"
                        >
                          {{ label }}
                        </li>

                        <li
                          v-for="speciesNode in genusNode.species"
                          :key="speciesNode.scientificName"
                          class="node node-species"
                          :class="{ 'node--selected': isSelected(speciesNode) }"
                          @click.stop="selectNode({ kind: 'species', node: speciesNode })"
                        >
                          <span class="taxon-name taxon-name--species">{{ speciesNode.scientificName }}</span>

                          <ul>
                            <li
                              v-for="label in groupedLabels(speciesNode.obs)"
                              :key="label"
                              class="node node-obs"
                            >
                              {{ label }}
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>

                <!-- Genera directly under family -->
                <li
                  v-for="genusNode in familyNode.genera"
                  :key="genusNode.genus"
                  class="node node-genus"
                  :class="{ 'node--selected': isSelected(genusNode) }"
                  @click.stop="selectNode({ kind: 'genus', node: genusNode })"
                >
                  <span class="rank-label">Genus</span>
                  <span class="taxon-name">{{ genusNode.genus }}</span>

                  <ul>
                    <li
                      v-for="label in groupedLabels(genusNode.unspecified)"
                      :key="label"
                      class="node node-obs"
                    >
                      {{ label }}
                    </li>

                    <li
                      v-for="speciesNode in genusNode.species"
                      :key="speciesNode.scientificName"
                      class="node node-species"
                      :class="{ 'node--selected': isSelected(speciesNode) }"
                      @click.stop="selectNode({ kind: 'species', node: speciesNode })"
                    >
                      <span class="taxon-name taxon-name--species">{{ speciesNode.scientificName }}</span>

                      <ul>
                        <li
                          v-for="label in groupedLabels(speciesNode.obs)"
                          :key="label"
                          class="node node-obs"
                        >
                          {{ label }}
                        </li>
                      </ul>
                    </li>
                  </ul>
                </li>
              </ul>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <!-- Side panel -->
    <div v-if="selectedNode" class="side-panel">
      <button class="side-panel-close" @click="selectedNode = null">✕</button>

      <p class="side-panel-rank">{{ panelRankLabel(selectedNode) }}</p>
      <h2
        class="side-panel-name"
        :class="{ 'side-panel-name--italic': selectedNode.kind === 'species' || selectedNode.kind === 'genus' }"
      >
        {{ panelName(selectedNode) }}
      </h2>
      <p v-if="panelCommonName(selectedNode)" class="side-panel-common">
        {{ panelCommonName(selectedNode) }}
      </p>
      <p class="side-panel-count">
        {{ selectedObsCount(selectedNode) }}
        observation{{ selectedObsCount(selectedNode) !== 1 ? "s" : "" }}
      </p>

      <!-- Species: full image grid -->
      <div v-if="selectedNode.kind === 'species'" class="side-panel-images">
        <img
          v-for="obs in selectedNode.node.obs.filter((o) => o.imageFile)"
          :key="obs.id"
          :src="obs.imageFile"
          :alt="obs.commonName || obs.scientificName || obs.id"
          class="side-panel-img"
        />
      </div>

      <!-- All other ranks: child cards -->
      <div v-else class="side-panel-children">
        <button
          v-for="child in panelChildren"
          :key="child.name"
          class="child-card"
          @click="selectNode(child.selection)"
        >
          <div class="child-card-header">
            <span class="child-card-rank">{{ child.rankLabel }}</span>
            <span
              class="child-card-name"
              :class="{ 'child-card-name--italic': child.isSpecies }"
            >{{ child.name }}</span>
            <span v-if="child.commonName" class="child-card-common">{{ child.commonName }}</span>
            <span class="child-card-count">{{ child.count }} obs</span>
          </div>
          <div v-if="child.images.length" class="child-card-images">
            <img
              v-for="(src, i) in child.images"
              :key="i"
              :src="src"
              class="child-card-img"
              alt=""
            />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tree-layout {
  position: fixed;
  inset: 0;
  display: flex;
  background: #0d0c0a;
  font-family: "Georgia", serif;
}

.tree-view {
  flex: 1;
  overflow-y: auto;
  color: #eabd6b;
  padding: 2rem 2.5rem;
  font-size: 1.05rem;
  line-height: 1.7;
  min-width: 0;
}

.tree-title {
  font-size: 1.4rem;
  font-weight: normal;
  letter-spacing: 0.05em;
  margin: 0 0 0.25rem 0;
  color: #9094e0;
}

.tree-count {
  color: #7a6a4a;
  margin: 0 0 1.5rem 0;
  font-size: 0.95rem;
}

.tree-root {
  list-style: none;
  padding: 0;
  margin: 0;
}

ul {
  list-style: none;
  padding-left: 1.5rem;
  margin: 0.2rem 0 0 0;
  border-left: 1px solid #2a2620;
}

.node {
  margin: 0.2rem 0;
  padding-left: 1rem;
}

.node::before {
  content: "•";
  color: #4a3e28;
  margin-right: 1rem;
}

/* Vertical spacing — larger gap for higher-rank groups */
.node-order    { margin-top: 2.5rem; }
.node-family   { margin-top: 1.6rem; }
.node-subfamily{ margin-top: 1.1rem; }
.node-tribe    { margin-top: 0.7rem; }
.node-genus    { margin-top: 0.4rem; }

/* All non-obs nodes are clickable */
.node-order,
.node-family,
.node-subfamily,
.node-tribe,
.node-genus,
.node-species {
  cursor: pointer;
}

.node-order:hover    > .taxon-name,
.node-family:hover   > .taxon-name,
.node-subfamily:hover > .taxon-name,
.node-tribe:hover    > .taxon-name,
.node-genus:hover    > .taxon-name,
.node-species:hover  > .taxon-name {
  color: #e8d090;
}

.node--selected > .taxon-name {
  color: #9094e0;
}

.rank-label {
  font-size: 0.75rem;
  color: #9a7e4e;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-right: 0.5rem;
  font-weight: bold;
  opacity: 0.85;
}

.taxon-name {
  color: #c4aa78;
  font-weight: bold;
}

.taxon-name--species {
  font-style: italic;
}

.common-name {
  color: #7a8a6a;
  font-size: 0.9rem;
  margin-left: 0.6rem;
  font-style: italic;
}

.label-unspecified {
  color: #6a5e48;
  font-style: italic;
}

.node-obs {
  color: #8a7a5a;
  font-size: 1rem;
  cursor: default;
}

.node-obs::before {
  content: "–";
  color: #3a3028;
  margin-right: 0.4rem;
}

/* ── Side panel ─────────────────────────────────────────────────────────────── */

.side-panel {
  width: 50vw;
  flex-shrink: 0;
  border-left: 1px solid #2a2620;
  overflow-y: auto;
  padding: 1.5rem 1.25rem;
  color: #eabd6b;
  position: relative;
}

.side-panel-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: #5a4e38;
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
}

.side-panel-close:hover {
  color: #9a7e4e;
}

.side-panel-rank {
  font-size: 0.75rem;
  color: #9a7e4e;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 0.2rem 0;
}

.side-panel-name {
  color: #c4aa78;
  font-size: 1.2rem;
  font-weight: bold;
  font-style: normal;
  margin: 0 0 0.15rem 0;
}

.side-panel-name--italic {
  font-style: italic;
}

.side-panel-common {
  color: #7a8a6a;
  font-style: italic;
  font-size: 0.95rem;
  margin: 0 0 0.15rem 0;
}

.side-panel-count {
  color: #5a4e38;
  font-size: 0.85rem;
  margin: 0 0 1.25rem 0;
}

/* Species image grid */
.side-panel-images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}

.side-panel-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 3px;
  display: block;
  opacity: 0.9;
}

.side-panel-img:hover {
  opacity: 1;
}

/* Child cards */
.side-panel-children {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.child-card {
  background: #131210;
  border: 1px solid #2a2620;
  border-radius: 4px;
  padding: 0.6rem 0.75rem;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font-family: "Georgia", serif;
  color: #eabd6b;
  transition: border-color 0.15s;
}

.child-card:hover {
  border-color: #4a3e28;
}

.child-card-header {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}

.child-card-rank {
  font-size: 0.65rem;
  color: #9a7e4e;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: bold;
  flex-shrink: 0;
}

.child-card-name {
  color: #c4aa78;
  font-weight: bold;
  font-size: 0.95rem;
}

.child-card-name--italic {
  font-style: italic;
}

.child-card-common {
  color: #7a8a6a;
  font-style: italic;
  font-size: 0.85rem;
}

.child-card-count {
  color: #4a3e28;
  font-size: 0.8rem;
  margin-left: auto;
  flex-shrink: 0;
}

.child-card-images {
  display: flex;
  gap: 0.35rem;
}

.child-card-img {
  width: calc(33.333% - 0.25rem);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 2px;
  opacity: 0.85;
}
</style>
