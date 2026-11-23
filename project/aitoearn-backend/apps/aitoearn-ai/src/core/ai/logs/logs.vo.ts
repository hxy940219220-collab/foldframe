import { z } from 'zod'

export {
  LogDetailResponseVo,
  LogItemVo,
  LogsListResponseVo,
} from '@yikart/aitoearn-ai-shared'

const metrics = z.object({
  calls: z.number().describe('已结束的生成调用次数'),
  tokens: z.number().describe('已上报的 Token'),
  tokenReports: z.number().describe('至少有一份 Token 回执的调用次数'),
  costUSD: z.number().describe('供应商或 Agent SDK 上报的美元费用'),
  costReports: z.number().describe('至少有一份费用回执的调用次数'),
  images: z.number().describe('已生成图片数'),
  videoSeconds: z.number().describe('已上报的成片秒数'),
})
const byType = metrics.extend({ type: z.string().describe('生成类型') })
export const usageResponseSchema = z.object({
  days: z.number().describe('统计天数'),
  timezone: z.string().describe('统计时区'),
  summary: metrics.describe('总计'),
  daily: z.array(metrics.extend({ date: z.string().describe('本地日期 YYYY-MM-DD') })).describe('每日统计'),
  types: z.array(byType).describe('按生成类型统计'),
  models: z.array(byType.extend({ model: z.string().describe('模型名称') })).describe('按模型及类型统计'),
})
