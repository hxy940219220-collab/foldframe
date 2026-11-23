export type UsageType = 'text' | 'image' | 'video' | 'agent' | 'other'

export interface Metrics {
  calls: number
  tokens: number
  tokenReports: number
  costUSD: number
  costReports: number
  images: number
  videoSeconds: number
}

export interface UsageReport {
  days: number
  timezone: string
  summary: Metrics
  daily: (Metrics & { date: string })[]
  types: (Metrics & { type: UsageType })[]
  models: (Metrics & { model: string, type: UsageType })[]
}
