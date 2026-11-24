'use client'

import type { Metrics, UsageReport, UsageType } from './usage.types'
import {
  Activity,
  Cpu,
  Film,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { inferProviderIconId, ProviderAppIcon } from '@/components/common/ProviderAppIcon'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/utils/className'
import { appCurrency } from '@/utils/currency'
import { DailyChart } from './DailyChart'

const RING_COLORS = ['#4f46e5', '#7c3aed', '#0284c7', '#10b981', '#f59e0b', '#e11d48']

const TYPE_BADGE_META: Record<UsageType, { label: string, pill: string, color: string }> = {
  text: { label: '文本文案', pill: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20', color: '#4f46e5' },
  image: { label: '图像生成', pill: 'bg-violet-500/10 text-violet-700 border-violet-500/20', color: '#7c3aed' },
  video: { label: '视频生成', pill: 'bg-sky-500/10 text-sky-700 border-sky-500/20', color: '#0284c7' },
  agent: { label: '创作副驾', pill: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', color: '#10b981' },
  other: { label: '其他任务', pill: 'bg-slate-500/10 text-slate-700 border-slate-500/20', color: '#64748b' },
}

function formatFriendlyModelName(raw: string): string {
  if (!raw) return '自动路由模型'
  const lower = raw.toLowerCase()
  if (lower === 'agy:default') return 'Antigravity · 自动默认'
  if (lower.startsWith('agy:')) return `Antigravity · ${raw.slice(4)}`
  if (lower === 'codex:default') return 'Codex · 自动默认'
  if (lower.startsWith('codex:')) return `Codex · ${raw.slice(6)}`
  if (lower === 'grok:default') return 'Grok · 自动默认'
  if (lower.startsWith('grok:')) return `Grok · ${raw.slice(5)}`
  if (lower === 'workbuddy:default') return 'WorkBuddy · 自动默认'
  if (lower.startsWith('workbuddy:')) return `WorkBuddy · ${raw.slice(10)}`
  if (lower.startsWith('dreamina')) return `即梦 AI · ${raw}`
  return raw
}

function DonutChart({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: Array<{ key: string, value: number, color: string }>
  centerValue: string
  centerLabel: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = 56
  const stroke = 14
  const circumference = 2 * Math.PI * radius
  let cumulative = 0

  return (
    <div className="relative mx-auto flex h-[152px] w-[152px] items-center justify-center">
      <svg viewBox="0 0 144 144" className="h-full w-full -rotate-90">
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/70"
          strokeWidth={stroke}
        />
        {total > 0 && segments.map((seg) => {
          const ratio = seg.value / total
          const dash = Math.max(0, ratio * circumference - (segments.length > 1 ? 3 : 0))
          const offset = -cumulative * circumference
          cumulative += ratio
          return (
            <circle
              key={seg.key}
              cx="72"
              cy="72"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={offset}
              className="transition-all duration-500"
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">{centerValue}</span>
        <span className="text-[11px] font-medium text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  )
}

export function UsageReportView({ report, locale }: { report: UsageReport, locale: string }) {
  const { t } = useTransClient('usage')
  const [groupBy, setGroupBy] = useState<'model' | 'type'>('model')
  const [donutMode, setDonutMode] = useState<'model' | 'type'>('model')
  const { summary } = report

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale])
  const currency = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: appCurrency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }), [locale])

  const activeDays = useMemo(() => report.daily.filter(d => d.calls > 0).length, [report.daily])
  const avgCallsPerActiveDay = activeDays > 0 ? Math.round((summary.calls / activeDays) * 10) / 10 : 0
  const tokenCoveragePct = summary.calls > 0 ? Math.round((summary.tokenReports / summary.calls) * 100) : 0
  const hasBilledCost = summary.costReports > 0 && summary.costUSD > 0

  function formatTokens(row: Metrics & { type?: string }) {
    if ((row.type === 'image' || row.type === 'video') && row.tokens === 0)
      return '—'
    return !row.calls || row.tokenReports > 0 ? number.format(row.tokens) : '—'
  }

  function formatCostBadge(row: Metrics) {
    if (!row.calls) return <span className="text-muted-foreground">—</span>
    if (row.costReports > 0 && row.costUSD > 0) {
      return <span className="font-medium tabular-nums text-foreground">{currency.format(row.costUSD)}</span>
    }
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        本机直连
      </span>
    )
  }

  const rows = useMemo(
    () => (groupBy === 'model' ? report.models : report.types.map(row => ({ ...row, model: '' }))),
    [groupBy, report.models, report.types],
  )

  const maxRowCalls = useMemo(() => Math.max(1, ...rows.map(r => r.calls)), [rows])

  const breakdownItems = useMemo(() => {
    if (donutMode === 'model') {
      return [...report.models]
        .sort((a, b) => b.calls - a.calls || b.tokens - a.tokens)
        .slice(0, 6)
        .map((item, idx) => ({
          key: `${item.model}:${item.type}`,
          label: formatFriendlyModelName(item.model),
          providerId: inferProviderIconId(item.model),
          calls: item.calls,
          tokens: item.tokens,
          color: RING_COLORS[idx % RING_COLORS.length],
        }))
    }
    return [...report.types]
      .sort((a, b) => b.calls - a.calls)
      .map((item, idx) => ({
        key: item.type,
        label: TYPE_BADGE_META[item.type]?.label || t(`types.${item.type}`),
        providerId: null,
        calls: item.calls,
        tokens: item.tokens,
        color: TYPE_BADGE_META[item.type]?.color || RING_COLORS[idx % RING_COLORS.length],
      }))
  }, [donutMode, report.models, report.types, t])

  const breakdownTotalCalls = breakdownItems.reduce((sum, i) => sum + i.calls, 0)

  return (
    <div className="space-y-5">
      {/* Layer 1: 4 列 KPI 概览卡片 */}
      <div data-testid="usage-kpi-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Token 消耗 */}
        <div className="rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_6px_22px_-14px_rgba(67,56,202,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('reportedTokens')}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
              <Cpu className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {number.format(summary.tokens)}
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Token 上报覆盖</span>
              <span className="font-medium tabular-nums text-foreground">
                {summary.tokenReports} / {summary.calls} 次 ({tokenCoveragePct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                style={{ width: `${Math.min(100, tokenCoveragePct)}%` }}
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* KPI 2: 累计调用 */}
        <div className="rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_6px_22px_-14px_rgba(67,56,202,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('calls')}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
              <Activity className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {number.format(summary.calls)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">次</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <span>活跃天数 {activeDays} / {report.days} 天</span>
            <span className="font-medium text-foreground tabular-nums">日均 {avgCallsPerActiveDay} 次</span>
          </div>
        </div>

        {/* KPI 3: 视觉媒体产出 */}
        <div className="rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_6px_22px_-14px_rgba(67,56,202,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">视觉素材产出</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
              <ImageIcon className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-3 tabular-nums">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {number.format(summary.images)}
              <span className="ml-1 text-xs font-medium text-muted-foreground">张图</span>
            </span>
            {summary.videoSeconds > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700">
                <Film className="h-3 w-3" />
                {number.format(summary.videoSeconds)}s 视频
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <span>参与模型</span>
            <span className="font-medium text-foreground tabular-nums">{report.models.length} 个引擎/型号</span>
          </div>
        </div>

        {/* KPI 4: 费用概览 */}
        <div className="rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_6px_22px_-14px_rgba(67,56,202,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">第三方 API 账单</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {hasBilledCost ? (
              <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {currency.format(summary.costUSD)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-4 w-4" />
                本机直连 · 0 账单
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <span>{hasBilledCost ? `已统计 ${summary.costReports} 次计费` : '优先使用本机授权账号'}</span>
            <span className="font-medium text-emerald-600">{hasBilledCost ? '按量计费' : '免平台费'}</span>
          </div>
        </div>
      </div>

      {/* Layer 2: 12 列 Bento 可视化分析区（8 列趋势柱图 + 4 列占比环形图） */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <DailyChart
            days={report.daily.map(day => ({
              date: day.date,
              tokens: day.tokenReports ? day.tokens : null,
              calls: day.calls,
              cost: day.costReports ? day.costUSD : null,
              images: day.images,
              videoSeconds: day.videoSeconds,
              tokenMissing: day.calls - day.tokenReports,
              costMissing: day.calls - day.costReports,
            }))}
            locale={locale}
          />
        </div>

        <section
          aria-label="调用分布占比"
          className="flex flex-col justify-between rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_8px_28px_-16px_rgba(67,56,202,0.16)] lg:col-span-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">调用占比</h2>
              <p className="text-xs text-muted-foreground">各模型与创作场景分布</p>
            </div>
            <div className="inline-flex rounded-xl border border-border/80 bg-muted/50 p-0.5">
              {(['model', 'type'] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDonutMode(key)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer',
                    donutMode === key
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {key === 'model' ? '按模型' : '按类型'}
                </button>
              ))}
            </div>
          </div>

          <div className="my-4">
            <DonutChart
              segments={breakdownItems.map(i => ({ key: i.key, value: i.calls, color: i.color }))}
              centerValue={compact.format(summary.calls)}
              centerLabel="总调用次"
            />
          </div>

          <div className="space-y-2.5">
            {breakdownItems.length > 0 ? breakdownItems.map((item) => {
              const pct = breakdownTotalCalls > 0 ? Math.round((item.calls / breakdownTotalCalls) * 100) : 0
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.providerId ? (
                        <ProviderAppIcon provider={item.providerId} size={18} />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      )}
                      <span className="truncate font-medium text-foreground">{item.label}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {item.calls} 次 · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                    <div
                      style={{ width: `${Math.max(4, pct)}%`, backgroundColor: item.color }}
                      className="h-full rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              )
            }) : (
              <p className="py-6 text-center text-xs text-muted-foreground">当前时段暂无调用记录</p>
            )}
          </div>
        </section>
      </div>

      {/* Layer 3: 消耗明细卡片 */}
      <section
        aria-labelledby="usage-detail-heading"
        className="overflow-hidden rounded-2xl border border-border/85 bg-card/95 shadow-[0_8px_28px_-16px_rgba(67,56,202,0.16)]"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 text-primary" />
            <h2 id="usage-detail-heading" className="text-sm font-semibold text-foreground">
              {t('detail')}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {rows.length} 项
            </span>
          </div>

          <div
            role="group"
            aria-label={t('groupBy')}
            className="inline-flex items-center rounded-xl border border-border/80 bg-muted/50 p-0.5"
          >
            {(['model', 'type'] as const).map(key => (
              <button
                key={key}
                type="button"
                aria-pressed={groupBy === key}
                onClick={() => setGroupBy(key)}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                  groupBy === key
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(key === 'model' ? 'byModel' : 'byType')}
              </button>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto">
          <Table aria-label={t('detail')} className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {groupBy === 'model' && <TableHead scope="col" className="pl-5 text-xs font-semibold">模型 / 引擎</TableHead>}
                <TableHead scope="col" className={cn('text-xs font-semibold', groupBy !== 'model' && 'pl-5')}>生成类型</TableHead>
                <TableHead scope="col" className="text-xs font-semibold">调用次数与占比</TableHead>
                <TableHead scope="col" className="text-xs font-semibold">Token 消耗</TableHead>
                <TableHead scope="col" className="text-xs font-semibold">视觉产出</TableHead>
                <TableHead scope="col" className="pr-5 text-right text-xs font-semibold">费用状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const badge = TYPE_BADGE_META[row.type] || TYPE_BADGE_META.other
                const barPct = Math.round((row.calls / maxRowCalls) * 100)
                return (
                  <TableRow key={JSON.stringify([row.type, row.model])} className="transition-colors hover:bg-muted/25">
                    {groupBy === 'model' && (
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <ProviderAppIcon provider={inferProviderIconId(row.model)} size={22} />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {formatFriendlyModelName(row.model)}
                            </div>
                            {row.model && (
                              <code className="text-[10.5px] text-muted-foreground">{row.model}</code>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className={cn(groupBy !== 'model' && 'pl-5')}>
                      <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium', badge.pill)}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="w-10 text-xs font-semibold tabular-nums text-foreground">
                          {number.format(row.calls)}
                        </span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            style={{ width: `${Math.max(6, barPct)}%` }}
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500"
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium tabular-nums text-foreground">
                      {formatTokens(row)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {[
                        row.images > 0 && `${number.format(row.images)} 张图`,
                        row.videoSeconds > 0 && `${number.format(row.videoSeconds)}s 视频`,
                      ].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="pr-5 text-right text-xs">
                      {formatCostBadge(row)}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={groupBy === 'model' ? 6 : 5} className="py-12 text-center text-xs text-muted-foreground">
                    {t('noModels')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>{t('scope', { zone: report.timezone, interpolation: { escapeValue: false } })}</span>
          <span>数据实时同步自本地调用日志</span>
        </footer>
      </section>
    </div>
  )
}
