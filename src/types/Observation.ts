export interface Observation {
  id: string
  commonName: string
  scientificName?: string
  imageFile: string // iNaturalist medium URL (Phase 2); local path in Phase 4
  x: number
  y: number
  z: number
  // Taxonomy fields — partial; mirrors iNaturalist CSV export structure
  order?: string
  family?: string
  subfamily?: string
  tribe?: string
  genus?: string
  species?: string       // specific epithet only, e.g. "septempunctata"
  taxonRank?: string     // finest rank the ID was made at: 'species' | 'genus' | 'family' | 'order'
}
