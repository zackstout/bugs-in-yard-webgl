import type { Observation } from '../types/Observation'

// Phase 1 dummy data — manually positioned observations used for interaction testing.
//
// Group centers and cases:
//   Beetles    (-12,  3)  — Case 3: dense, 4 families, multiple genera, depth 3
//   Lepidoptera ( 10,  8)  — Case 2: 4 obs, each a different family, depth 1
//   Hymenoptera ( 12, -6)  — Case 2: 4 obs, 2 families, depth 1
//   Odonata    ( -8, -8)  — Case 1: single observation, fast path
//   Hemiptera  (  2,  0)  — Case 2: 3 obs, 3 families, depth 1
//   Unidentified(  0,-14)  — Separate cluster, no taxonomy

export const dummyObservations: Observation[] = [

  // ── Coleoptera (Beetles) — Case 3: dense group, effective depth 3 ──────────
  // order → family → genus → species all produce meaningful splits.
  // Family Coccinellidae: 2 genera (Coccinella, Harmonia), multiple species each.
  { id: 'b1', commonName: 'Seven-spotted Ladybug',     scientificName: 'Coccinella septempunctata',    imageFile: '/images/seven-spotted-ladybug.jpg',      x: -13,   y:  4.5,  z:  0.5, order: 'Coleoptera', family: 'Coccinellidae', genus: 'Coccinella', species: 'septempunctata',    taxonRank: 'species' },
  { id: 'b2', commonName: 'Transverse Ladybug',         scientificName: 'Coccinella transversoguttata', imageFile: '/images/transverse-ladybug.jpg',          x: -11.5, y:  5.5,  z: -0.3, order: 'Coleoptera', family: 'Coccinellidae', genus: 'Coccinella', species: 'transversoguttata', taxonRank: 'species' },
  { id: 'b3', commonName: 'Asian Lady Beetle',          scientificName: 'Harmonia axyridis',            imageFile: '/images/asian-lady-beetle.jpg',           x: -10.5, y:  4.5,  z:  0.3, order: 'Coleoptera', family: 'Coccinellidae', genus: 'Harmonia',   species: 'axyridis',         taxonRank: 'species' },
  { id: 'b4', commonName: 'Spotless Lady Beetle',       scientificName: 'Cycloneda munda',              imageFile: '/images/spotless-lady-beetle.jpg',        x: -11,   y:  6,    z: -0.5, order: 'Coleoptera', family: 'Coccinellidae', genus: 'Cycloneda',  species: 'munda',            taxonRank: 'species' },
  // Family Carabidae: 2 genera — genus is an effective rank within this family.
  { id: 'b5', commonName: 'Ground Beetle',              scientificName: 'Carabus nemoralis',            imageFile: '/images/ground-beetle.jpg',               x: -14,   y:  2.5,  z:  1,   order: 'Coleoptera', family: 'Carabidae',    genus: 'Carabus',    species: 'nemoralis',        taxonRank: 'species' },
  { id: 'b6', commonName: 'Black Ground Beetle',        scientificName: 'Pterostichus melanarius',      imageFile: '/images/black-ground-beetle.jpg',         x: -13,   y:  1.5,  z: -0.5, order: 'Coleoptera', family: 'Carabidae',    genus: 'Pterostichus', species: 'melanarius',     taxonRank: 'species' },
  // Family Elateridae: single observation, identified only to family.
  // taxonRank 'family' means genus/species layers are skipped for this node.
  { id: 'b7', commonName: 'Click Beetle',               scientificName: undefined,                      imageFile: '/images/click-beetle.jpg',                x: -11,   y:  1,    z:  0,   order: 'Coleoptera', family: 'Elateridae',                                                    taxonRank: 'family' },
  // Family Cerambycidae: 1 genus, 2 species — genus is not an effective rank here.
  { id: 'b8', commonName: 'Carolina Sawyer',            scientificName: 'Monochamus carolinensis',      imageFile: '/images/carolina-sawyer.jpg',             x: -10,   y:  3.5,  z:  1,   order: 'Coleoptera', family: 'Cerambycidae', genus: 'Monochamus', species: 'carolinensis',     taxonRank: 'species' },
  { id: 'b9', commonName: 'White-spotted Sawyer',       scientificName: 'Monochamus scutellatus',       imageFile: '/images/white-spotted-sawyer.jpg',        x: -9,    y:  2.5,  z: -1,   order: 'Coleoptera', family: 'Cerambycidae', genus: 'Monochamus', species: 'scutellatus',      taxonRank: 'species' },

  // ── Lepidoptera (Butterflies & Moths) — Case 2: depth 1 ───────────────────
  // 4 observations, each in a different family. Family is the only effective rank.
  // No genus-level splits exist — 1 obs per family.
  { id: 'lp1', commonName: 'Eastern Tiger Swallowtail', scientificName: 'Papilio glaucus',             imageFile: '/images/tiger-swallowtail.jpg',           x:  9,    y:  9,    z:  0,   order: 'Lepidoptera', family: 'Papilionidae', genus: 'Papilio',    species: 'glaucus',          taxonRank: 'species' },
  { id: 'lp2', commonName: 'Cabbage White',              scientificName: 'Pieris rapae',                imageFile: '/images/cabbage-white.jpg',               x: 12,    y:  8.5,  z:  1,   order: 'Lepidoptera', family: 'Pieridae',    genus: 'Pieris',     species: 'rapae',            taxonRank: 'species' },
  { id: 'lp3', commonName: 'Luna Moth',                  scientificName: 'Actias luna',                 imageFile: '/images/luna-moth.jpg',                   x: 10.5,  y:  6.5,  z: -0.5, order: 'Lepidoptera', family: 'Saturniidae', genus: 'Actias',     species: 'luna',             taxonRank: 'species' },
  { id: 'lp4', commonName: 'Monarch',                    scientificName: 'Danaus plexippus',            imageFile: '/images/monarch.jpg',                     x:  8,    y: 10,    z:  0.5, order: 'Lepidoptera', family: 'Nymphalidae', genus: 'Danaus',     species: 'plexippus',        taxonRank: 'species' },

  // ── Hymenoptera (Bees & Wasps) — Case 2: depth 1 ─────────────────────────
  // 4 observations, 2 families (Apidae, Vespidae). Each genus has 1 observation,
  // so genus is not an effective rank — family is the only split.
  { id: 'hy1', commonName: 'Eastern Bumble Bee',         scientificName: 'Bombus impatiens',            imageFile: '/images/bumble-bee.jpg',                  x: 11,    y: -5,    z:  0,   order: 'Hymenoptera', family: 'Apidae',    genus: 'Bombus',     species: 'impatiens',        taxonRank: 'species' },
  { id: 'hy2', commonName: 'Honey Bee',                  scientificName: 'Apis mellifera',              imageFile: '/images/honey-bee.jpg',                   x: 13.5,  y: -7,    z:  0.5, order: 'Hymenoptera', family: 'Apidae',    genus: 'Apis',       species: 'mellifera',        taxonRank: 'species' },
  { id: 'hy3', commonName: 'Yellow Jacket',              scientificName: 'Vespula maculifrons',         imageFile: '/images/yellow-jacket.jpg',               x: 12,    y: -4,    z: -1,   order: 'Hymenoptera', family: 'Vespidae',  genus: 'Vespula',    species: 'maculifrons',      taxonRank: 'species' },
  { id: 'hy4', commonName: 'Paper Wasp',                 scientificName: 'Polistes fuscatus',           imageFile: '/images/paper-wasp.jpg',                  x: 14,    y: -6,    z:  1,   order: 'Hymenoptera', family: 'Vespidae',  genus: 'Polistes',   species: 'fuscatus',         taxonRank: 'species' },

  // ── Odonata (Dragonflies & Damselflies) — Case 1: single observation ───────
  // One observation only. The Group zoom level collapses to a fast path —
  // no subgroup layer exists. The camera moves from Atlas directly toward the photo.
  { id: 'od1', commonName: 'Ebony Jewelwing',            scientificName: 'Calopteryx maculata',         imageFile: '/images/ebony-jewelwing.jpg',             x: -8,    y: -8,    z:  0,   order: 'Odonata', family: 'Calopterygidae', genus: 'Calopteryx', species: 'maculata',        taxonRank: 'species' },

  // ── Hemiptera (True Bugs) — Case 2: depth 1 ──────────────────────────────
  // 3 observations, each in a different family. Family is the only effective rank.
  { id: 'hm1', commonName: 'Milkweed Bug',               scientificName: 'Oncopeltus fasciatus',        imageFile: '/images/milkweed-bug.jpg',                x:  1,    y:  1,    z:  0,   order: 'Hemiptera', family: 'Lygaeidae',    genus: 'Oncopeltus', species: 'fasciatus',        taxonRank: 'species' },
  { id: 'hm2', commonName: 'Brown Marmorated Stink Bug', scientificName: 'Halyomorpha halys',           imageFile: '/images/stink-bug.jpg',                   x:  3.5,  y: -1,    z:  0.5, order: 'Hemiptera', family: 'Pentatomidae', genus: 'Halyomorpha', species: 'halys',           taxonRank: 'species' },
  { id: 'hm3', commonName: 'Assassin Bug',               scientificName: 'Zelus longipes',              imageFile: '/images/assassin-bug.jpg',                x:  2,    y:  2,    z: -1,   order: 'Hemiptera', family: 'Reduviidae',   genus: 'Zelus',      species: 'longipes',         taxonRank: 'species' },

  // ── Unidentified ──────────────────────────────────────────────────────────
  // No taxonomy at all. Placed in a separate cluster at Atlas level.
  // No taxonomy labels are shown — photos only.
  { id: 'u1', commonName: 'Unknown Beetle',              scientificName: undefined,                      imageFile: '/images/unknown-beetle.jpg',              x:  0.5,  y: -14,   z:  0   },
  { id: 'u2', commonName: 'Unknown Fly',                 scientificName: undefined,                      imageFile: '/images/unknown-fly.jpg',                 x: -0.5,  y: -15.5, z:  0.5 },
]
