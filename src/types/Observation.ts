export interface Observation {
  id: string
  commonName: string
  scientificName?: string
  imageFile: string // filename inside /public/images/
  x: number
  y: number
  z: number
}
