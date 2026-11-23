// Aggregate only metering metadata; prompts and generated assets never enter the response.
export interface UsageRecord {
  createdAt: Date
  type: string
  model: string
  channel: string
  status: string
  response?: {
    model?: string
    providerModel?: string
    providerTokens?: number
    modelUsage?: Record<string, Record<string, unknown>>
    usage?: Record<string, unknown>
    usage_metadata?: Record<string, unknown>
    total_cost_usd?: number
    costUSD?: number
    seconds?: string | number
    duration?: number
  }
  imageCount?: number
}

interface Metrics {
  calls: number
  tokens: number
  tokenReports: number
  costUSD: number
  costReports: number
  images: number
  videoSeconds: number
}

function empty(): Metrics {
  return { calls: 0, tokens: 0, tokenReports: 0, costUSD: 0, costReports: 0, images: 0, videoSeconds: 0 }
}

const metricKeys = Object.keys(empty()) as (keyof Metrics)[]
function add(target: Metrics, source: Metrics) {
  for (const key of metricKeys) target[key] += source[key]
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function tokenCount(usage: Record<string, unknown>, channel: string, agentModel: boolean) {
  const total = number(usage['total_tokens']) ?? number(usage['totalTokenCount']) ?? number(usage['totalTokens'])
  if (total !== undefined) return total
  const input = number(usage['input_tokens']) ?? number(usage['prompt_tokens']) ?? number(usage['inputTokens']) ?? number(usage['promptTokenCount'])
  const output = number(usage['output_tokens']) ?? number(usage['completion_tokens']) ?? number(usage['outputTokens']) ?? number(usage['candidatesTokenCount'])
  if (input === undefined || output === undefined) return undefined
  if (agentModel) return input + output + (number(usage['cacheReadInputTokens']) ?? 0) + (number(usage['cacheCreationInputTokens']) ?? 0)
  if (channel === 'anthropic' || channel === 'claude-agent') {
    const details = usage['input_token_details'] as Record<string, unknown> | undefined
    const cacheRead = number(usage['cache_read_input_tokens']) ?? number(details?.['cache_read']) ?? 0
    const cacheWrite = number(usage['cache_creation_input_tokens']) ?? ((number(details?.['cache_creation_5m']) ?? 0) + (number(details?.['cache_creation_1h']) ?? 0))
    return input + output + cacheRead + cacheWrite
  }
  return input + output
}

function metrics(tokens: number | undefined, cost: number | undefined): Metrics {
  return { ...empty(), calls: 1, tokens: tokens ?? 0, tokenReports: Number(tokens !== undefined), costUSD: cost ?? 0, costReports: Number(cost !== undefined) }
}

const types: Record<string, string> = { chat: 'text', image: 'image', video: 'video', agent: 'agent', 'video-edit': 'video', aideo: 'video', 'style-transfer': 'video' }

export function usagePeriod(days: number, timezone: string, now = new Date()) {
  // Calendar date arithmetic on UTC representations of local day labels also works across DST.
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const last = Date.parse(format.format(now) + 'T00:00:00Z')
  const dayMs = 86400000
  const dates = Array.from({ length: days }, (_, i) => new Date(last - (days - i - 1) * dayMs).toISOString().slice(0, 10))
  return { days, timezone, dates, format, since: new Date(last - days * dayMs), until: now }
}

export async function summarizeUsage(records: AsyncIterable<UsageRecord> | Iterable<UsageRecord>, period: ReturnType<typeof usagePeriod>) {
  const daily = new Map(period.dates.map(date => [date, { date, ...empty() }]))
  const summary = empty()
  const byType = new Map<string, Metrics & { type: string }>()
  const models = new Map<string, Metrics & { model: string, type: string }>()
  for await (const record of records) {
    const day = daily.get(period.format.format(record.createdAt))
    if (!day || record.type === 'draft-generation' || record.type === 'crawler') continue
    const type = types[record.type] ?? 'other'
    const response = record.response ?? {}
    const entries = type === 'agent' ? Object.entries(response.modelUsage ?? {}).filter(([, value]) => value && typeof value === 'object') : []
    const breakdown = entries.map(([model, usage]) => ({
      model, value: metrics(tokenCount(usage, record.channel, true), number(usage['costUSD'])),
    }))
    const sdkTotal = number(response.total_cost_usd)
    if (!breakdown.length) {
      const usage = response.usage ?? response.usage_metadata ?? {}
      // Legacy Gemini image logs combined estimates with the provider's counts.
      const tokens = type === 'image' && record.channel === 'gemini'
        ? number(response.providerTokens)
        : tokenCount(usage, record.channel, false)
      const value = metrics(tokens, sdkTotal ?? number(response.costUSD))
      if (record.status === 'success') {
        if (type === 'image') value.images = number(record.imageCount) ?? 0
        if (type === 'video') {
          // The top-level log.duration is execution latency in milliseconds.
          const seconds = typeof response.seconds === 'string' && /^\d+(\.\d+)?$/.test(response.seconds) ? Number(response.seconds) : response.seconds
          value.videoSeconds = number(usage['output_video_duration']) ?? number(response.duration) ?? number(seconds) ?? 0
        }
      }
      breakdown.push({ model: response.providerModel || response.model || record.model, value })
    }
    const call = empty()
    for (const { model, value } of breakdown) {
      const key = JSON.stringify([type, model])
      const row = models.get(key) ?? { type, model, ...empty() }
      add(row, value)
      models.set(key, row)
      add(call, value)
    }
    call.calls = 1
    call.tokenReports = Number(call.tokenReports > 0)
    call.costReports = Number(call.costReports > 0)
    if (entries.length && response.usage) {
      const total = tokenCount(response.usage, record.channel, false)
      if (total !== undefined) {
        call.tokens = total
        call.tokenReports = 1
      }
    }
    if (sdkTotal !== undefined) {
      call.costUSD = sdkTotal
      call.costReports = 1
    }
    add(summary, call)
    add(day, call)
    const typeTotal = byType.get(type) ?? { type, ...empty() }
    add(typeTotal, call)
    byType.set(type, typeTotal)
  }
  return {
    days: period.days, timezone: period.timezone, summary, daily: [...daily.values()],
    types: [...byType.values()].sort((a, b) => b.tokens - a.tokens || a.type.localeCompare(b.type)),
    models: [...models.values()].sort((a, b) => b.tokens - a.tokens || b.calls - a.calls || a.model.localeCompare(b.model)),
  }
}
