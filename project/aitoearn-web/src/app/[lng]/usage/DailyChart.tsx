'use client'

import { Flame } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { appCurrency } from '@/utils/currency'
import { cn } from '@/utils/className'

export interface ChartDay {
  date: string
  tokens: number | null
  calls: number
  cost: number | null
  images: number
  videoSeconds: number
  tokenMissing: number
  costMissing: number
}

export function DailyChart({ days, locale }: { days: ChartDay[], locale: string }) {
  const { t } = useTransClient('usage')
  const [mode, setMode] = useState<'tokens' | 'calls' | 'cost'>('tokens')
  const [focused, setFocused] = useState<string>()

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const compact = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale])
  const costFormat = useMemo(() => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: appCurrency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }), [locale])
  const smallNumber = useMemo(() => new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 }), [locale])
  const shortDateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', timeZone: 'UTC' }), [locale])
  const fullDateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }), [locale])

  const labelShort = (day: ChartDay) => shortDateFmt.format(new Date(`${day.date}T12:00:00Z`))
  const labelFull = (day: ChartDay) => fullDateFmt.format(new Date(`${day.date}T12:00:00Z`))
  const costLabel = (value: number) => (value > 0 && value < 1e-6 ? `${appCurrency} ${smallNumber.format(value)}` : costFormat.format(value))

  // Default focus on the highest-activity day (or latest day) so the readout feels immediately alive
  const peakDay = useMemo(() => {
    let best: ChartDay | undefined
    let bestVal = -1
    for (const d of days) {
      const val = d[mode] ?? 0
      if (val > bestVal) {
        bestVal = val
        best = d
      }
    }
    return bestVal > 0 ? best : days[days.length - 1]
  }, [days, mode])

  const selected = days.find(d => d.date === focused) ?? peakDay ?? days[days.length - 1]
  const unknown = (day: ChartDay) => day.calls > 0 && day[mode] == null
  const maximum = Math.max(0, ...days.map(d => d[mode] ?? 0)) || (mode === 'cost' ? 0.01 : 1)
  const step = 10 ** Math.floor(Math.log10(maximum))
  const ceiling = Number((Math.ceil(maximum / step) * step).toPrecision(12))
  const axisLabel = (value: number) => (mode === 'cost' && value < 1 ? smallNumber.format(value) : compact.format(value))
  const allEmpty = days.every(d => d.calls === 0)
  const allMissing = !allEmpty && days.every(d => !d.calls || d[mode] == null)

  const valueText = (day: ChartDay) => {
    if (unknown(day))
      return mode === 'cost' ? '本机直连' : t('notReported')
    const val = day[mode] ?? 0
    return mode === 'cost' ? costLabel(val) : number.format(val)
  }

  const metricTabs: Array<{ key: 'tokens' | 'calls' | 'cost', label: string }> = [
    { key: 'tokens', label: 'Token' },
    { key: 'calls', label: '调用次数' },
    { key: 'cost', label: '费用' },
  ]

  const showEveryDayLabel = days.length <= 10

  return (
    <section
      aria-labelledby="daily-usage-title"
      className="flex h-full flex-col justify-between rounded-2xl border border-border/85 bg-card/95 p-5 shadow-[0_8px_28px_-16px_rgba(67,56,202,0.16)]"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 id="daily-usage-title" className="text-sm font-semibold text-foreground">
              {t('daily')}
            </h2>
            {peakDay && (peakDay[mode] ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[11px] font-medium text-primary">
                <Flame className="h-3 w-3" />
                峰值 {labelFull(peakDay)} · {mode === 'cost' ? costLabel(peakDay[mode] ?? 0) : compact.format(peakDay[mode] ?? 0)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">悬停或点击柱条查看当日调用与产出明细</p>
        </div>

        <div
          role="group"
          aria-label={t('metric')}
          className="inline-flex items-center rounded-xl border border-border/80 bg-muted/50 p-0.5"
        >
          {metricTabs.map((tab) => {
            const active = mode === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(tab.key)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer',
                  active
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Chart Plot */}
      <div className="mt-5 flex-1">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 items-stretch">
          {/* Y-Axis */}
          <div className="flex h-[200px] flex-col justify-between text-right text-[11px] font-medium tabular-nums text-muted-foreground/80" aria-hidden="true">
            <span>{axisLabel(ceiling)}</span>
            <span>{ceiling > 1 || mode === 'cost' ? axisLabel(ceiling * 0.66) : ''}</span>
            <span>{ceiling > 1 || mode === 'cost' ? axisLabel(ceiling * 0.33) : ''}</span>
            <span>0</span>
          </div>

          {/* Bars Plane */}
          <div className="relative h-[200px]">
            {/* Gridlines */}
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
              <div className="border-t border-dashed border-border/75" />
              <div className="border-t border-dashed border-border/60" />
              <div className="border-t border-dashed border-border/60" />
              <div className="border-t border-border/90" />
            </div>

            {(allEmpty || allMissing) && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <span className="rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-xs">
                  {allEmpty
                    ? t('noActivity')
                    : mode === 'cost'
                      ? '本时段均为账号直连调用，未产生第三方平台账单'
                      : t('noTokenData')}
                </span>
              </div>
            )}

            <div
              className={cn(
                'relative z-10 flex h-full items-end',
                days.length <= 10 ? 'gap-3 px-2' : 'gap-1 px-0.5',
              )}
              role="group"
              aria-label={t('daily')}
            >
              {days.map((day, index) => {
                const rawVal = day[mode] ?? 0
                const pct = rawVal > 0 ? Math.max(5, (rawVal / ceiling) * 100) : 0
                const isSelected = selected?.date === day.date
                const isUnknown = unknown(day)
                return (
                  <button
                    key={day.date}
                    type="button"
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={`${labelFull(day)} · ${t(mode)} ${valueText(day)}`}
                    aria-pressed={isSelected}
                    title={`${labelFull(day)} · ${t(mode)}: ${valueText(day)}`}
                    onFocus={() => setFocused(day.date)}
                    onMouseEnter={() => setFocused(day.date)}
                    onClick={() => setFocused(day.date)}
                    onKeyDown={(event) => {
                      const navigation: Partial<Record<string, number>> = {
                        ArrowLeft: index - 1,
                        ArrowRight: index + 1,
                        Home: 0,
                        End: days.length - 1,
                      }
                      const next = navigation[event.key]
                      if (next === undefined)
                        return
                      event.preventDefault()
                      const buttons = event.currentTarget.parentElement?.querySelectorAll('button')
                      buttons?.[Math.max(0, Math.min(next, days.length - 1))]?.focus()
                    }}
                    className={cn(
                      'group relative flex h-full flex-1 flex-col justify-end rounded-lg transition-colors cursor-pointer focus:outline-none',
                      isSelected ? 'bg-primary/[0.05]' : 'hover:bg-muted/45',
                    )}
                  >
                    {/* Subtle slot guide */}
                    <div className="mx-auto flex h-full w-full max-w-[38px] flex-col justify-end">
                      {isUnknown ? (
                        <div className="h-3 w-full rounded-t-md border border-dashed border-primary/35 bg-primary/10" />
                      ) : pct > 0 ? (
                        <div
                          style={{ height: `${pct}%` }}
                          className={cn(
                            'w-full rounded-t-lg transition-all duration-300',
                            isSelected
                              ? 'bg-gradient-to-t from-indigo-600 via-violet-500 to-indigo-400 shadow-[0_6px_18px_-4px_rgba(99,102,241,0.55)]'
                              : 'bg-gradient-to-t from-indigo-500/80 to-violet-400/75 group-hover:from-indigo-600 group-hover:to-violet-400',
                          )}
                        />
                      ) : (
                        <div className="h-[3px] w-full rounded-full bg-border/65" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* X-Axis Dates */}
        {days.length > 0 && (
          <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)] gap-3" aria-hidden="true">
            <span />
            {showEveryDayLabel ? (
              <div className="flex items-center gap-3 px-2">
                {days.map(day => (
                  <span
                    key={day.date}
                    className={cn(
                      'flex-1 text-center text-[11px] tabular-nums transition-colors',
                      selected?.date === day.date ? 'font-semibold text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {labelShort(day)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between px-1 text-[11px] tabular-nums text-muted-foreground">
                <span>{labelShort(days[0])}</span>
                <span>{labelShort(days[Math.floor(days.length * 0.25)])}</span>
                <span>{labelShort(days[Math.floor(days.length * 0.5)])}</span>
                <span>{labelShort(days[Math.floor(days.length * 0.75)])}</span>
                <span>{labelShort(days[days.length - 1])}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Day Interactive Readout Strip */}
      {selected && (
        <div
          aria-live="polite"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/75 bg-muted/35 px-3.5 py-2 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
            <span className="font-semibold text-foreground">{labelFull(selected)}</span>
            <span className="text-muted-foreground">当日摘要</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <span className="text-muted-foreground">
              Token <strong className="ml-1 font-semibold text-foreground">{selected.tokens != null ? number.format(selected.tokens) : '0'}</strong>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">
              调用 <strong className="ml-1 font-semibold text-foreground">{number.format(selected.calls)} 次</strong>
            </span>
            {(selected.images > 0 || selected.videoSeconds > 0) && (
              <>
                <span className="h-3 w-px bg-border" />
                <span className="text-muted-foreground">
                  视觉 <strong className="ml-1 font-semibold text-foreground">
                    {[selected.images > 0 && `${selected.images} 张`, selected.videoSeconds > 0 && `${selected.videoSeconds}s`].filter(Boolean).join(' · ')}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
