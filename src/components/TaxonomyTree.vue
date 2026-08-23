<script setup lang="ts">
import { computed } from "vue";
import { observations } from "../data/observations";
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

interface FamilyNode {
  family: string;
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

const tree = computed<TaxonomyTree>(() => {
  const orderMap = new Map<
    string,
    {
      familyMap: Map<
        string,
        {
          genusMap: Map<
            string,
            {
              speciesMap: Map<string, Observation[]>;
              unspecified: Observation[];
            }
          >;
          unspecified: Observation[];
        }
      >;
      unspecified: Observation[];
    }
  >();
  const topUnspecified: Observation[] = [];

  for (const obs of observations) {
    if (!obs.order) {
      topUnspecified.push(obs);
      continue;
    }

    if (!orderMap.has(obs.order)) {
      orderMap.set(obs.order, { familyMap: new Map(), unspecified: [] });
    }
    const orderEntry = orderMap.get(obs.order)!;

    if (!obs.family) {
      orderEntry.unspecified.push(obs);
      continue;
    }

    if (!orderEntry.familyMap.has(obs.family)) {
      orderEntry.familyMap.set(obs.family, {
        genusMap: new Map(),
        unspecified: [],
      });
    }
    const familyEntry = orderEntry.familyMap.get(obs.family)!;

    if (!obs.genus) {
      familyEntry.unspecified.push(obs);
      continue;
    }

    if (!familyEntry.genusMap.has(obs.genus)) {
      familyEntry.genusMap.set(obs.genus, {
        speciesMap: new Map(),
        unspecified: [],
      });
    }
    const genusEntry = familyEntry.genusMap.get(obs.genus)!;

    if (!obs.species) {
      genusEntry.unspecified.push(obs);
      continue;
    }

    const speciesKey = `${obs.genus} ${obs.species}`;
    if (!genusEntry.speciesMap.has(speciesKey)) {
      genusEntry.speciesMap.set(speciesKey, []);
    }
    genusEntry.speciesMap.get(speciesKey)!.push(obs);
  }

  const orders: OrderNode[] = Array.from(orderMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([order, { familyMap, unspecified }]) => ({
      order,
      families: Array.from(familyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([family, { genusMap, unspecified: famUnspec }]) => ({
          family,
          genera: Array.from(genusMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([genus, { speciesMap, unspecified: genUnspec }]) => ({
              genus,
              species: Array.from(speciesMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([scientificName, obs]) => ({ scientificName, obs })),
              unspecified: genUnspec,
            })),
          unspecified: famUnspec,
        })),
      unspecified,
    }));

  return { orders, unspecified: topUnspecified };
});

function obsLabel(obs: Observation): string {
  const name = obs.commonName && obs.commonName !== "Unknown" ? obs.commonName : null;
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

            <ul>
              <!-- Observations known only to family level -->
              <li
                v-for="label in groupedLabels(familyNode.unspecified)"
                :key="label"
                class="node node-obs"
              >
                {{ label }}
              </li>

              <!-- Genera -->
              <li
                v-for="genusNode in familyNode.genera"
                :key="genusNode.genus"
                class="node node-genus"
              >
                <span class="rank-label">Genus</span>
                <span class="taxon-name">{{ genusNode.genus }}</span>

                <ul>
                  <!-- Observations known only to genus level -->
                  <li
                    v-for="label in groupedLabels(genusNode.unspecified)"
                    :key="label"
                    class="node node-obs"
                  >
                    {{ label }}
                  </li>

                  <!-- Species -->
                  <li
                    v-for="speciesNode in genusNode.species"
                    :key="speciesNode.scientificName"
                    class="node node-species"
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
</template>

<style scoped>
.tree-view {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: #0d0c0a;
  color: #eabd6b;
  padding: 2rem 2.5rem;
  font-family: "Georgia", serif;
  font-size: 0.9rem;
  line-height: 1.6;
}

.tree-title {
  font-size: 1.2rem;
  font-weight: normal;
  letter-spacing: 0.05em;
  margin: 0 0 0.25rem 0;
  color: #9094e0;
}

.tree-count {
  color: #7a6a4a;
  margin: 0 0 1.5rem 0;
  font-size: 0.8rem;
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

.rank-label {
  font-size: 0.7rem;
  color: #5a4e38;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-right: 0.4rem;
}

.taxon-name {
  color: #c4aa78;
  font-weight: bold;
}

.taxon-name--species {
  font-style: italic;
}

.label-unspecified {
  color: #6a5e48;
  font-style: italic;
}

.node-obs {
  color: #8a7a5a;
  font-size: 0.85rem;
}

.node-obs::before {
  content: "–";
  color: #3a3028;
  margin-right: 0.4rem;
}
</style>
