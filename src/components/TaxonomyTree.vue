<script setup lang="ts">
import { computed, ref } from "vue";
import { observations } from "../data/observations";
import { familyCommonNames } from "../data/commonNames/familyCommonNames";
import { orderCommonNames } from "../data/commonNames/orderCommonNames";
import type { Observation } from "../types/Observation";

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
  genera: GenusNode[]; // genera with no tribe
  unspecified: Observation[];
}

interface FamilyNode {
  family: string;
  subfamilies: SubfamilyNode[];
  tribes: TribeNode[]; // tribes with no subfamily
  genera: GenusNode[]; // genera with no subfamily and no tribe
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

    // Route to the finest available container above genus
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

const selectedSpecies = ref<SpeciesNode | null>(null);

function selectSpecies(node: SpeciesNode) {
  selectedSpecies.value = node;
}

function speciesCommonName(node: SpeciesNode): string | null {
  for (const o of node.obs) {
    if (o.commonName && o.commonName !== "Unknown") return o.commonName;
  }
  return null;
}

function obsLabel(obs: Observation): string {
  const name =
    obs.commonName && obs.commonName !== "Unknown" ? obs.commonName : null;
  return name || obs.scientificName || obs.id;
}

// Group a list of observations by common name and return "Name (N)" strings.
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
      <!-- Observations with no order (higher rank or unknown) -->
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
      >
        <span class="rank-label">Order</span>
        <span class="taxon-name">{{ orderNode.order }}</span>
        <span v-if="orderCommonNames[orderNode.order]" class="common-name">{{ orderCommonNames[orderNode.order] }}</span>

        <ul>
          <!-- Observations known only to order level -->
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
          >
            <span class="rank-label">Family</span>
            <span class="taxon-name">{{ familyNode.family }}</span>
            <span v-if="familyCommonNames[familyNode.family]" class="common-name">{{ familyCommonNames[familyNode.family] }}</span>

            <ul>
              <!-- Observations known only to family level -->
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
                      >
                        <span class="rank-label">Genus</span>
                        <span class="taxon-name">{{ genusNode.genus }}</span>
                        <ul>
                          <li
                            v-for="label in groupedLabels(
                              genusNode.unspecified,
                            )"
                            :key="label"
                            class="node node-obs"
                          >
                            {{ label }}
                          </li>
                          <li
                            v-for="speciesNode in genusNode.species"
                            :key="speciesNode.scientificName"
                            class="node node-species"
                            :class="{ 'node-species--selected': selectedSpecies === speciesNode }"
                            @click.stop="selectSpecies(speciesNode)"
                          >
                            <span class="taxon-name taxon-name--species">{{
                              speciesNode.scientificName
                            }}</span>
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
                  <!-- Genera directly under subfamily (no tribe) -->
                  <li
                    v-for="genusNode in subfamilyNode.genera"
                    :key="genusNode.genus"
                    class="node node-genus"
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
                        :class="{ 'node-species--selected': selectedSpecies === speciesNode }"
                        @click.stop="selectSpecies(speciesNode)"
                      >
                        <span class="taxon-name taxon-name--species">{{
                          speciesNode.scientificName
                        }}</span>
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

              <!-- Tribes directly under family (no subfamily) -->
              <li
                v-for="tribeNode in familyNode.tribes"
                :key="tribeNode.tribe"
                class="node node-tribe"
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
                        :class="{ 'node-species--selected': selectedSpecies === speciesNode }"
                        @click.stop="selectSpecies(speciesNode)"
                      >
                        <span class="taxon-name taxon-name--species">{{
                          speciesNode.scientificName
                        }}</span>
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

              <!-- Genera directly under family (no subfamily, no tribe) -->
              <li
                v-for="genusNode in familyNode.genera"
                :key="genusNode.genus"
                class="node node-genus"
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
                    :class="{ 'node-species--selected': selectedSpecies === speciesNode }"
                    @click.stop="selectSpecies(speciesNode)"
                  >
                    <span class="taxon-name taxon-name--species">{{
                      speciesNode.scientificName
                    }}</span>
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
    <div v-if="selectedSpecies" class="side-panel">
      <button class="side-panel-close" @click="selectedSpecies = null">✕</button>
      <p class="side-panel-common">{{ speciesCommonName(selectedSpecies) }}</p>
      <h2 class="side-panel-name">{{ selectedSpecies.scientificName }}</h2>
      <p class="side-panel-count">{{ selectedSpecies.obs.length }} observation{{ selectedSpecies.obs.length !== 1 ? 's' : '' }}</p>
      <div class="side-panel-images">
        <img
          v-for="obs in selectedSpecies.obs.filter(o => o.imageFile)"
          :key="obs.id"
          :src="obs.imageFile"
          :alt="obs.commonName || obs.scientificName || obs.id"
          class="side-panel-img"
        />
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
.node-order {
  margin-top: 2.5rem;
}

.node-family {
  margin-top: 1.6rem;
}

.node-subfamily {
  margin-top: 1.1rem;
}

.node-tribe {
  margin-top: 0.7rem;
}

.node-genus {
  margin-top: 0.4rem;
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
}

.node-obs::before {
  content: "–";
  color: #3a3028;
  margin-right: 0.4rem;
}

.node-species {
  cursor: pointer;
}

.node-species:hover .taxon-name {
  color: #e8d090;
}

.node-species--selected > .taxon-name {
  color: #9094e0;
}

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

.side-panel-common {
  color: #7a8a6a;
  font-style: italic;
  font-size: 0.9rem;
  margin: 0 0 0.25rem 0;
}

.side-panel-name {
  color: #c4aa78;
  font-style: italic;
  font-size: 1.1rem;
  font-weight: normal;
  margin: 0 0 0.2rem 0;
}

.side-panel-count {
  color: #5a4e38;
  font-size: 0.85rem;
  margin: 0 0 1.25rem 0;
}

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
</style>
