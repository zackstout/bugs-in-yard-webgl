import type { Observation } from '../types/Observation'

// Positions are manually set for Phase 1.
// Group centers: Beetles(-12, 3), Butterflies(10, 8), Bees(12, -6), Dragonflies(-8, -8), True Bugs(2, 0)

export const observations: Observation[] = [
  // ── Beetles ────────────────────────────────────────────────────────────────
  { id: 'b1', commonName: 'Seven-spotted Ladybug',  scientificName: 'Coccinella septempunctata', imageFile: 'seven-spotted-ladybug.jpg',  x: -13,  y:  4.5, z:  0.5 },
  { id: 'b2', commonName: 'Asian Lady Beetle',       scientificName: 'Harmonia axyridis',         imageFile: 'asian-lady-beetle.jpg',        x: -10.5,y:  5,   z: -0.5 },
  { id: 'b3', commonName: 'Ground Beetle',           scientificName: 'Carabus nemoralis',          imageFile: 'ground-beetle.jpg',            x: -14,  y:  2.5, z:  1   },
  { id: 'b4', commonName: 'Click Beetle',            scientificName: 'Elateridae sp.',             imageFile: 'click-beetle.jpg',             x: -11,  y:  2,   z: -1   },

  // ── Butterflies & Moths ────────────────────────────────────────────────────
  { id: 'lp1', commonName: 'Eastern Tiger Swallowtail', scientificName: 'Papilio glaucus',        imageFile: 'tiger-swallowtail.jpg',        x:  9,   y:  9,   z:  0   },
  { id: 'lp2', commonName: 'Cabbage White',              scientificName: 'Pieris rapae',           imageFile: 'cabbage-white.jpg',            x: 12,   y:  8.5, z:  1   },
  { id: 'lp3', commonName: 'Luna Moth',                  scientificName: 'Actias luna',            imageFile: 'luna-moth.jpg',                x: 10.5, y:  6.5, z: -0.5 },
  { id: 'lp4', commonName: 'Monarch',                    scientificName: 'Danaus plexippus',       imageFile: 'monarch.jpg',                  x:  8,   y: 10,   z:  0.5 },

  // ── Bees & Wasps ──────────────────────────────────────────────────────────
  { id: 'hy1', commonName: 'Eastern Bumble Bee', scientificName: 'Bombus impatiens',           imageFile: 'bumble-bee.jpg',               x: 11,   y: -5,   z:  0   },
  { id: 'hy2', commonName: 'Honey Bee',          scientificName: 'Apis mellifera',             imageFile: 'honey-bee.jpg',                x: 13.5, y: -7,   z:  0.5 },
  { id: 'hy3', commonName: 'Yellow Jacket',      scientificName: 'Vespula maculifrons',        imageFile: 'yellow-jacket.jpg',            x: 12,   y: -4,   z: -1   },
  { id: 'hy4', commonName: 'Paper Wasp',         scientificName: 'Polistes sp.',               imageFile: 'paper-wasp.jpg',               x: 14,   y: -6,   z:  1   },

  // ── Dragonflies & Damselflies ─────────────────────────────────────────────
  { id: 'od1', commonName: 'Common Whitetail',       scientificName: 'Plathemis lydia',            imageFile: 'common-whitetail.jpg',         x: -9,   y: -7,   z:  0   },
  { id: 'od2', commonName: 'Eastern Pondhawk',        scientificName: 'Erythemis simplicicollis',   imageFile: 'eastern-pondhawk.jpg',         x: -7,   y: -9,   z:  0.5 },
  { id: 'od3', commonName: 'Twelve-spotted Skimmer', scientificName: 'Libellula pulchella',         imageFile: 'twelve-spotted-skimmer.jpg',   x: -10,  y: -8.5, z: -0.5 },
  { id: 'od4', commonName: 'Ebony Jewelwing',         scientificName: 'Calopteryx maculata',        imageFile: 'ebony-jewelwing.jpg',          x: -8,   y: -6,   z:  1   },

  // ── True Bugs ─────────────────────────────────────────────────────────────
  { id: 'hm1', commonName: 'Milkweed Bug', scientificName: 'Oncopeltus fasciatus',           imageFile: 'milkweed-bug.jpg',             x:  1,   y:  1,   z:  0   },
  { id: 'hm2', commonName: 'Stink Bug',    scientificName: 'Halyomorpha halys',              imageFile: 'stink-bug.jpg',                x:  3.5, y: -1,   z:  0.5 },
  { id: 'hm3', commonName: 'Assassin Bug', scientificName: 'Zelus longipes',                 imageFile: 'assassin-bug.jpg',             x:  2,   y:  2,   z: -1   },
  { id: 'hm4', commonName: 'Boxelder Bug', scientificName: 'Boisea trivittata',              imageFile: 'boxelder-bug.jpg',             x:  0,   y: -1,   z:  0.5 },
]
