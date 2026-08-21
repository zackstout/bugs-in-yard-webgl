#!/usr/bin/env tsx
/**
 * Phase 2 build script: iNaturalist CSV → src/data/observations.json
 *
 * Usage:
 *   tsx scripts/build-observations.ts --csv path/to/export.csv
 *   tsx scripts/build-observations.ts --csv path/to/export.csv --out src/data/observations.json
 *
 * Flags:
 *   --verify-columns   Print all column names from the CSV and exit.
 *                      Run this first if the script warns about missing columns.
 *
 * Output:
 *   src/data/observations.json — normalized observations, ready for the renderer.
 *
 * Image handling (Phase 2):
 *   Images are referenced as iNaturalist URLs (medium size). No local download.
 *   Replace with local paths in Phase 4 when BugTextureManager is built.
 *
 * Seed positions:
 *   Orders are arranged in a ring. Each observation starts at its order's
 *   ring center plus a small random jitter. The physics simulation (Phase 5)
 *   refines these — they only need to land in the right neighbourhood.
 */

import { parse } from 'csv-parse/sync'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')

// ─── Expected iNaturalist CSV column names ────────────────────────────────────
//
// These are the standard columns from inaturalist.org/observations/export.
// Run with --verify-columns to check whether your export matches.

const COL = {
  id:             'id',
  observedOn:     'observed_on',
  qualityGrade:   'quality_grade',
  imageUrl:       'image_url',
  scientificName: 'scientific_name',
  commonName:     'common_name',
  tagList:        'tag_list',
  latitude:       'latitude',
  longitude:      'longitude',
  placeGuess:     'place_guess',
  phylum:         'taxon_phylum_name',
  order:          'taxon_order_name',
  family:         'taxon_family_name',
  genus:          'taxon_genus_name',
  species:        'taxon_species_name',    // full binomial, e.g. "Coccinella septempunctata"
  subspecies:     'taxon_subspecies_name',
} as const

// ─── Filters ──────────────────────────────────────────────────────────────────
//
// Only include observations from these phyla. Excludes plants, fungi, birds,
// mammals, and everything else in the account that isn't an invertebrate.
//
// Extend this list if needed (e.g. Annelida for earthworms, Platyhelminthes).

const INCLUDE_PHYLA = new Set([
  'Arthropoda',   // insects, spiders, crustaceans, centipedes, etc.
  'Mollusca',     // snails, slugs, etc.
])

function shouldInclude(row: Record<string, string>): boolean {
  const phylum = row[COL.phylum]?.trim()
  // If the phylum column is missing entirely, let everything through and warn.
  // If the column exists but is empty (unidentified to phylum), exclude.
  if (!(COL.phylum in row)) return true
  return INCLUDE_PHYLA.has(phylum)
}

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
//
// Deterministic so seed positions are stable across builds.
// The same CSV always produces the same layout.json.

function mulberry32(seed: number): () => number {
  return function (): number {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand   = mulberry32(0xdeadbeef)
const jitter = (range: number) => (rand() - 0.5) * 2 * range

// ─── Taxonomy helpers ─────────────────────────────────────────────────────────

type TaxonRank = 'species' | 'genus' | 'family' | 'order' | 'class' | 'higher'

function determineTaxonRank(row: Record<string, string>): TaxonRank {
  if (row[COL.species])  return 'species'
  if (row[COL.genus])    return 'genus'
  if (row[COL.family])   return 'family'
  if (row[COL.order])    return 'order'
  return 'higher'
}

// Extract specific epithet from a full binomial.
// "Coccinella septempunctata" → "septempunctata"
function specificEpithet(binomial: string): string {
  const parts = binomial.trim().split(/\s+/)
  return parts.length >= 2 ? parts[parts.length - 1] : ''
}

// ─── Image URL ────────────────────────────────────────────────────────────────
//
// iNaturalist URLs follow the pattern:
//   https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/square.jpg
//
// Replace 'square' with 'medium' for ~500px wide images — a good fit for
// the Group-level view. No download required: Three.js loads from HTTPS.
// CORS is enabled on iNaturalist's open data bucket.

function deriveMediumUrl(squareUrl: string): string {
  return squareUrl.replace(/\/square(\.\w+)$/, '/medium$1')
}

// ─── Seed position generation ─────────────────────────────────────────────────
//
// Orders are arranged in a ring of radius ORDER_RING_RADIUS.
// Each observation is placed at its order's center plus a small random jitter.
//
// Z is assigned by taxonomy rank to stratify depth visually:
//   species → +1.5, genus → +1.0, family → +0.5, coarser → 0
// These values come from the image-layout-physics.md spec. The physics
// simulation (Phase 5) will refine XY but leave Z assignment unchanged.

const ORDER_RING_RADIUS = 40   // world units; sized for MESH_HEIGHT=6, 19 orders
const JITTER_RADIUS     = 1.5  // initial scatter within each order cluster

const RANK_Z: Record<TaxonRank, number> = {
  species: 1.5,
  genus:   1.0,
  family:  0.5,
  order:   0,
  class:   0,
  higher:  0,
}

function computeOrderCenters(orders: string[]): Map<string, { x: number; y: number }> {
  const centers = new Map<string, { x: number; y: number }>()
  const sorted  = [...orders].sort()   // stable ordering across runs
  sorted.forEach((order, i) => {
    // Start at the top (−π/2) and go clockwise
    const angle = (2 * Math.PI * i) / sorted.length - Math.PI / 2
    centers.set(order, {
      x: Math.round(ORDER_RING_RADIUS * Math.cos(angle) * 10) / 10,
      y: Math.round(ORDER_RING_RADIUS * Math.sin(angle) * 10) / 10,
    })
  })
  return centers
}

// ─── Slug generation ──────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args       = process.argv.slice(2)
  const csvIdx     = args.indexOf('--csv')
  const outIdx     = args.indexOf('--out')
  const verifyCols = args.includes('--verify-columns')

  if (csvIdx === -1 || !args[csvIdx + 1]) {
    console.error('Usage: tsx scripts/build-observations.ts --csv path/to/export.csv')
    process.exit(1)
  }

  const csvPath = resolve(args[csvIdx + 1])
  const outPath = outIdx !== -1 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : resolve(ROOT, 'src/data/observations.json')

  // ── Parse CSV ──────────────────────────────────────────────────────────────

  console.log(`Reading ${csvPath}`)
  const content = readFileSync(csvPath, 'utf-8')
  const rows: Record<string, string>[] = parse(content, {
    columns:           true,
    skip_empty_lines:  true,
    trim:              true,
  })
  console.log(`Loaded ${rows.length} rows`)

  // ── Verify columns ─────────────────────────────────────────────────────────

  if (verifyCols) {
    console.log('\nColumns in this CSV:')
    Object.keys(rows[0] ?? {}).forEach(c => console.log(`  ${c}`))
    process.exit(0)
  }

  const firstRow = rows[0] ?? {}
  const missing  = Object.entries(COL).filter(([, col]) => !(col in firstRow))
  if (missing.length > 0) {
    console.warn('\n⚠  Missing columns (related fields will be empty):')
    missing.forEach(([key, col]) => console.warn(`   ${key}: "${col}"`))
    console.warn('\nRun with --verify-columns to see all available columns.\n')
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered  = rows.filter(shouldInclude)
  const excluded  = rows.length - filtered.length
  console.log(`Kept ${filtered.length} rows (excluded ${excluded} — plants, fungi, vertebrates, etc.)`)

  // ── Compute order ring positions ───────────────────────────────────────────

  const orderSet = new Set<string>()
  for (const row of filtered) {
    const order = row[COL.order]?.trim()
    if (order) orderSet.add(order)
  }
  const orderList    = [...orderSet].sort()
  const orderCenters = computeOrderCenters(orderList)
  console.log(`\nFound ${orderList.length} orders`)

  // ── Map rows to observations ───────────────────────────────────────────────

  const observations = filtered.map(row => {
    const id          = row[COL.id]?.trim()          ?? ''
    const commonName  = row[COL.commonName]?.trim()  || 'Unknown'
    const sciName     = row[COL.scientificName]?.trim() || ''
    const orderName   = row[COL.order]?.trim()       || ''
    const familyName  = row[COL.family]?.trim()      || ''
    const genusName   = row[COL.genus]?.trim()       || ''
    const speciesName = row[COL.species]?.trim()     || ''  // full binomial
    const imageUrl    = row[COL.imageUrl]?.trim()    || ''
    const observedOn  = row[COL.observedOn]?.trim()  || ''
    const qualGrade   = row[COL.qualityGrade]?.trim() || ''
    const lat         = parseFloat(row[COL.latitude]  ?? '')
    const lng         = parseFloat(row[COL.longitude] ?? '')
    const place       = row[COL.placeGuess]?.trim()  || ''

    const taxonRank = determineTaxonRank(row)
    const epithet   = speciesName ? specificEpithet(speciesName) : ''
    const slug      = `${slugify(commonName || sciName || 'observation')}-${id}`

    // Seed position
    const center = orderCenters.get(orderName)
    const x = (center?.x ?? 0) + jitter(JITTER_RADIUS)
    const y = (center?.y ?? 0) + jitter(JITTER_RADIUS)
    const z = RANK_Z[taxonRank]

    const hasLocation = place || (!isNaN(lat) && !isNaN(lng))
    const location    = hasLocation
      ? { name: place, lat: isNaN(lat) ? undefined : lat, lng: isNaN(lng) ? undefined : lng }
      : undefined

    return {
      id,
      slug,
      commonName,
      scientificName: sciName  || undefined,
      order:          orderName  || undefined,
      family:         familyName || undefined,
      genus:          genusName  || undefined,
      species:        epithet    || undefined,
      taxonRank,
      observedAt:     observedOn,
      qualityGrade:   qualGrade,
      location,
      imageFile:      imageUrl ? deriveMediumUrl(imageUrl) : '',
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      z,
    }
  })

  // ── Sort by taxonomy for readability ───────────────────────────────────────

  observations.sort((a, b) => {
    const o = (a.order  ?? '').localeCompare(b.order  ?? ''); if (o) return o
    const f = (a.family ?? '').localeCompare(b.family ?? ''); if (f) return f
    const g = (a.genus  ?? '').localeCompare(b.genus  ?? ''); if (g) return g
    return (a.scientificName ?? '').localeCompare(b.scientificName ?? '')
  })

  // ── Write output ───────────────────────────────────────────────────────────

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(observations, null, 2), 'utf-8')
  console.log(`\n✓ Wrote ${observations.length} observations → ${outPath}`)

  // ── Summary ────────────────────────────────────────────────────────────────

  const byOrder = new Map<string, number>()
  for (const obs of observations) {
    const key = obs.order ?? 'Unidentified'
    byOrder.set(key, (byOrder.get(key) ?? 0) + 1)
  }

  const byRank = new Map<string, number>()
  for (const obs of observations) {
    byRank.set(obs.taxonRank, (byRank.get(obs.taxonRank) ?? 0) + 1)
  }

  console.log('\nObservations per order (top 10):')
  ;[...byOrder.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([order, n]) => console.log(`  ${n.toString().padStart(4)}  ${order}`))

  console.log('\nIdentification depth:')
  ;[...byRank.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([rank, n]) => console.log(`  ${n.toString().padStart(4)}  ${rank}`))

  const noImage = observations.filter(o => !o.imageFile).length
  if (noImage > 0) console.warn(`\n⚠  ${noImage} observations have no image URL`)
}

main()
