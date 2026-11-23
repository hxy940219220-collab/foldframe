'use client'

import { useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { appCurrency } from '@/utils/currency'
import styles from './usage.module.css'

export interface ChartDay {
  date: string
  tokens: number | null
  calls: number
  cost: number | null
  tokenMissing: number
  costMissing: number
}

export function DailyChart({ days, locale }: { days: ChartDay[], locale: string }) {
  const { t } = useTransClient('usage')
  const [mode, setMode] = useState<'tokens' | 'calls' | 'cost'>('tokens')
  const [focused, setFocused] = useState<string>()
  const number = new Intl.NumberFormat(locale)
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  const costFormat = new Intl.NumberFormat(locale, { style: 'currency', currency: appCurrency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 8 })
  const smallNumber = new Intl.NumberFormat(locale, { maximumSignificantDigits: 3 })
  const costLabel = (value: number) => value > 0 && value < 1e-8
    ? `${appCurrency} ${smallNumber.format(value)}`
    : costFormat.format(value)
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const labelDate = (day: ChartDay) => date.format(new Date(day.date + 'T12:00:00Z'))
  const selected = days.find(day => day.date === focused) ?? days[days.length - 1]
  const unknown = (day: ChartDay) => day.calls > 0 && day[mode] == null
  const maximum = Math.max(0, ...days.map(day => day[mode] ?? 0)) || (mode === 'cost' ? 0.01 : 1)
  const step = 10 ** Math.floor(Math.log10(maximum))
  const ceiling = Number((Math.ceil(maximum / step) * step).toPrecision(12))
  const axisLabel = (value: number) => mode === 'cost' && value < 1 ? smallNumber.format(value) : compact.format(value)
  const allEmpty = days.every(day => day.calls === 0)
  const allMissing = !allEmpty && days.every(day => !day.calls || day[mode] == null)
  const valueText = (day: ChartDay) => {
    if (unknown(day))
      return t('notReported')
    const value = day[mode] ?? 0
    return mode === 'cost' ? costLabel(value) : number.format(value)
  }
  const missing = selected && (mode === 'cost' ? selected.costMissing : mode === 'tokens' ? selected.tokenMissing : 0)
  const metricName = (key: typeof mode) => key === 'cost' ? t('dailyCost', { currency: appCurrency }) : t(key)

  return (
    <section className={styles.chart} aria-labelledby="daily-usage-title">
      <header className={styles.chartHead}>
        <h2 id="daily-usage-title">{t('daily')}</h2>
        <div className={styles.switches} role="group" aria-label={t('metric')}>
          {(['tokens', 'cost', 'calls'] as const).map(key => (
            <button type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{metricName(key)}</button>
          ))}
        </div>
      </header>
      <div className={styles.plot}>
        <div className={styles.axis} aria-hidden="true">
          <span>{axisLabel(ceiling)}</span><span>{ceiling > 1 || mode === 'cost' ? axisLabel(ceiling / 2) : ''}</span><span>0</span>
        </div>
        <div className={styles.plane}>
          <div className={styles.grid} aria-hidden="true"><i /><i /><i /></div>
          {(allEmpty || allMissing) && <p className={styles.noTrend}>{t(allEmpty ? 'noActivity' : mode === 'cost' ? 'noCostData' : 'noTokenData')}</p>}
          <div className={styles.bars} role="group" aria-label={t('daily')}>
            {days.map((day, index) => (
              <button
                type="button"
                key={day.date}
                tabIndex={selected?.date === day.date ? 0 : -1}
                aria-label={labelDate(day) + ' · ' + t(mode) + ' ' + valueText(day)}
                aria-pressed={selected?.date === day.date}
                title={labelDate(day) + ' · ' + t(mode) + ' ' + valueText(day)}
                onFocus={() => setFocused(day.date)}
                onMouseEnter={() => setFocused(day.date)}
                onClick={() => setFocused(day.date)}
                onKeyDown={event => {
                  const navigation: Partial<Record<string, number>> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: days.length - 1 }
                  const next = navigation[event.key]
                  if (next === undefined)
                    return
                  event.preventDefault()
                  const buttons = event.currentTarget.parentElement?.querySelectorAll('button')
                  buttons?.[Math.max(0, Math.min(next, days.length - 1))]?.focus()
                }}
              >
                {unknown(day)
                  ? <i className={styles.unknownBar} />
                  : (day[mode] ?? 0) > 0 && <i className={styles.bar} style={{ height: `${Math.max(1, (day[mode] ?? 0) / ceiling * 100)}%` }} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {days.length > 0 && (
        <div className={styles.dateAxis} aria-hidden="true">
          <span>{labelDate(days[0])}</span><span>{labelDate(days[Math.floor(days.length / 2)])}</span><span>{labelDate(days[days.length - 1])}</span>
        </div>
      )}
      {selected && (
        <p className={styles.readout} aria-live="polite">
          <span className={styles.dot} />{labelDate(selected)}
          <strong>{valueText(selected)}</strong>{t(mode)}
          {Boolean(missing) && <span>· {t('missing', { count: missing })}</span>}
        </p>
      )}
    </section>
  )
}
