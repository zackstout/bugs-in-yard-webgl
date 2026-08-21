export interface Observation {
  id: string
  commonName: string
  scientificName?: string
  imageFile: string // filename inside /public/images/
  x: number
  y: number
  z: number
  // Taxonomy fields — partial; mirrors iNaturalist CSV export structure
  order?: string
  family?: string
  genus?: string
  species?: string       // specific epithet only, e.g. "septempunctata"
  taxonRank?: string     // finest rank the ID was made at: 'species' | 'genus' | 'family' | 'order'
}
