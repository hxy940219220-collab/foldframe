import type { UsageRecord } from './usage'
import { describe, expect, it } from 'vitest'
import { summarizeUsage, usagePeriod } from './usage'

const now = new Date('2026-11-03T04:00:00Z')
const period = usagePeriod(7, 'America/Los_Angeles', now)

function log(type: string, response: UsageRecord['response'], extra: Partial<UsageRecord> = {}): UsageRecord {
  return { type, response, createdAt: now, model: 'test-model', channel: '', status: 'success', ...extra }
}

describe('generation usage', () => {
  it('counts a multi-model Agent once, including cache, and respects SDK totals', async () => {
    const report = await summarizeUsage([
      log('agent', {
        modelUsage: {
          primary: { inputTokens: 20, outputTokens: 30, cacheReadInputTokens: 5, costUSD: 0.02 },
          helper: { costUSD: 0.01 },
        },
        total_cost_usd: 0.04,
      }, { channel: 'claude-agent' }),
    ], period)
    expect(report.summary).toMatchObject({ calls: 1, tokens: 55, costUSD: 0.04, tokenReports: 1, costReports: 1 })
    expect(report.types).toEqual([{ type: 'agent', ...report.summary }])
    expect(report.models.map(row => [row.model, row.tokenReports, row.tokens])).toEqual([['primary', 1, 55], ['helper', 0, 0]])
    expect(report.daily.at(-1)).toEqual({ date: '2026-11-02', ...report.summary })
  })

  it('keeps provider reports, unreported usage, and media units distinct', async () => {
    const report = await summarizeUsage([
      log('chat', { usage: { total_tokens: 0 } }),
      log('image', { usage: { totalTokenCount: 1800 } }, { channel: 'gemini', imageCount: 1 }),
      log('image', { providerTokens: 89, usage: { totalTokenCount: 1800 } }, { channel: 'gemini', imageCount: 2 }),
      log('image', { providerModel: 'gpt-image', usage: { input_tokens: 30, output_tokens: 70 } }, { imageCount: 1 }),
      log('video', { usage: { output_video_duration: 8 } }),
      log('video', { usage: { total_tokens: 80 }, seconds: '4' }),
      log('draft-generation', { usage: { total_tokens: 999999 } }),
    ], period)
    expect(report.summary).toEqual({ calls: 6, tokens: 269, tokenReports: 4, costUSD: 0, costReports: 0, images: 4, videoSeconds: 12 })
    expect(report.types.find(row => row.type === 'image')).toMatchObject({ tokens: 189, tokenReports: 2 })
  })

  it('applies local calendar boundaries and groups both hours at the fall DST transition', async () => {
    const records = ['2026-10-27T06:59:59Z', '2026-10-27T07:00:00Z', '2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z']
      .map(date => log('chat', { usage: { total_tokens: 2 } }, { createdAt: new Date(date) }))
    const report = await summarizeUsage(records, period)
    expect(report.daily).toHaveLength(7)
    expect(report.daily[0]).toMatchObject({ date: '2026-10-27', tokens: 2 })
    expect(report.daily.find(day => day.date === '2026-11-01')?.tokens).toBe(4)
    expect(report.summary.tokens).toBe(6)
  })
})
