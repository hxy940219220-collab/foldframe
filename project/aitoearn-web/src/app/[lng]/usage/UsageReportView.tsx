'use client'

import type { Metrics, UsageReport } from './usage.types'
import { useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { appCurrency } from '@/utils/currency'
import { DailyChart } from './DailyChart'
import styles from './usage.module.css'

export function UsageReportView({ report, locale }: { report: UsageReport, locale: string }) {
  const { t } = useTransClient('usage')
  const [groupBy, setGroupBy] = useState<'model' | 'type'>('model')
  const { summary } = report
  const number = new Intl.NumberFormat(locale)
  const currency = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: appCurrency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
  function tokens(row: Metrics & { type?: string }) {
    if ((row.type === 'image' || row.type === 'video') && row.tokens === 0) {
      return '—'
    }
    return !row.calls || row.tokenReports > 0 ? number.format(row.tokens) : t('notReported')
  }
  function cost(row: Metrics) {
    return !row.calls || row.costReports > 0 ? currency.format(row.costUSD) : t('notReported')
  }
  function coverage(total: number, measured: number, type?: string) {
    if (type === 'image' || type === 'video') return null
    return measured < total && measured > 0
      ? <small className={styles.coverage}>{t('coverage', { measured: number.format(measured), total: number.format(total) })}</small>
      : null
  }
  const rows = groupBy === 'model' ? report.models : report.types.map(row => ({ ...row, model: '' }))
  return (
    <>
      <dl className={styles.metrics}>
        <div>
          <dt>{t('reportedTokens')}</dt><dd>{tokens(summary)}</dd>{coverage(summary.calls, summary.tokenReports)}
        </div>
        <div>
          <dt>{t('cost')}</dt><dd>{cost(summary)}</dd>{coverage(summary.calls, summary.costReports)}
        </div>
        <div>
          <dt>{t('calls')}</dt><dd>{number.format(summary.calls)}</dd>
        </div>
      </dl>
      <DailyChart
        days={report.daily.map(day => ({
          date: day.date, tokens: day.tokenReports ? day.tokens : null, calls: day.calls,
          cost: day.costReports ? day.costUSD : null,
          tokenMissing: day.calls - day.tokenReports, costMissing: day.calls - day.costReports,
        }))}
        locale={locale}
      />
      <section aria-labelledby="usage-detail-heading">
        <header className={styles.sectionHead}>
          <h2 id="usage-detail-heading">{t('detail')}</h2>
          <div role="group" aria-label={t('groupBy')} className={styles.switches}>
            {(['model', 'type'] as const).map(key => (
              <button key={key} type="button" aria-pressed={groupBy === key} onClick={() => setGroupBy(key)}>{t(key === 'model' ? 'byModel' : 'byType')}</button>
            ))}
          </div>
        </header>
        <Table aria-label={t('detail')} className="min-w-[540px]">
          <TableHeader>
            <TableRow>
              {groupBy === 'model' && <TableHead scope="col">{t('model')}</TableHead>}
              <TableHead scope="col">{t('type')}</TableHead>
              <TableHead scope="col">{t('calls')}</TableHead>
              <TableHead scope="col">{t('tokens')}</TableHead>
              <TableHead scope="col">{t('media')}</TableHead>
              <TableHead scope="col">{t('cost')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => (
              <TableRow key={JSON.stringify([row.type, row.model])}>
                {groupBy === 'model' && <TableCell className="font-medium">{row.model || t('notReported')}</TableCell>}
                <TableCell>{t(`types.${row.type}`)}</TableCell>
                <TableCell>{number.format(row.calls)}</TableCell>
                <TableCell>{tokens(row)}{coverage(row.calls, row.tokenReports, row.type)}</TableCell>
                <TableCell>
                  {[
                    row.images > 0 && t('images', { value: number.format(row.images) }),
                    row.videoSeconds > 0 && t('seconds', { value: number.format(row.videoSeconds) }),
                  ].filter(Boolean).join(' · ') || '—'}
                </TableCell>
                <TableCell>{cost(row)}{coverage(row.calls, row.costReports)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={groupBy === 'model' ? 6 : 5} className={styles.empty}>{t('noModels')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <p className={styles.note}>{t('scope', { zone: report.timezone, interpolation: { escapeValue: false } })}</p>
      </section>
    </>
  )
}
