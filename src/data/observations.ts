import type { Observation } from '../types/Observation'
import rawData from './observations.json'

export const observations = rawData as unknown as Observation[]
