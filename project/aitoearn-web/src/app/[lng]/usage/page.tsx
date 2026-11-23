// Account-scoped model usage and daily consumption.
'use client'

import type { UsageReport } from './usage.types'
import { useEffect, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserStore } from '@/store/user'
import { UsageReportView } from './UsageReportView'
import styles from './usage.module.css'

type Result = { status: 'ok', report: UsageReport } | { status: 'loading' | 'error' | 'auth' }

function PeriodReport({ days, token, locale }: { days: number, token: string, locale: string }) {
  const { t } = useTransClient('usage')
  const [result, setResult] = useState<Result>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setResult({ status: 'loading' })
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const params = new URLSearchParams({ days: String(days), timezone })
      try {
        const response = await fetch(`/api/ai/logs/usage?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
          redirect: 'error',
        })
        if (response.status === 401 || response.status === 403) {
          setResult({ status: 'auth' })
          return
        }
        if (!response.ok)
          throw new Error('Request failed')
        const responseData = await response.json() as { code: number, data: UsageReport }
        if (responseData.code === 401 || responseData.code === 403) {
          setResult({ status: 'auth' })
          return
        }
        if (responseData.code !== 0 || !responseData.data?.summary || !Array.isArray(responseData.data.daily) || !Array.isArray(responseData.data.models) || !Array.isArray(responseData.data.types))
          throw new Error('Invalid usage report')
        if (!controller.signal.aborted)
          setResult({ status: 'ok', report: responseData.data })
      }
      catch {
        if (!controller.signal.aborted)
          setResult({ status: 'error' })
      }
    }
    void load()
    return () => controller.abort()
  }, [days, token, attempt])

  if (result.status === 'ok')
    return <UsageReportView report={result.report} locale={locale} />
  if (result.status === 'loading')
    return <div role="status" aria-label={t('loading')} className="space-y-6 py-8"><Skeleton className="h-16 w-full" /><Skeleton className="h-44 w-full" /></div>
  return (
    <div role="status" className={styles.feedback}>
      {t(result.status === 'auth' ? 'auth' : 'error')}
      <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)}>{t('retry')}</Button>
    </div>
  )
}

export default function UsagePage({ params }: { params: { lng: string } }) {
  const { t, ready } = useTransClient('usage')
  const token = useUserStore(state => state.token)
  const hydrated = useUserStore(state => state._hasHydrated)
  const [days, setDays] = useState(7)
  if (!ready)
    return <Skeleton className="m-6 h-32" />
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.pageHead}>
          <h1>{t('title')}</h1>
          <div role="group" aria-label={t('period')} className={styles.switches}>
            {[7, 30].map(period => (
              <button key={period} type="button" aria-pressed={days === period}
                onClick={() => setDays(period)}>{t('days', { count: period })}</button>
            ))}
          </div>
        </header>
        {token
          ? <PeriodReport key={days + token} days={days} token={token} locale={params.lng} />
          : <p role="status" className={styles.feedback}>{t(hydrated ? 'auth' : 'loading')}</p>}
      </div>
    </div>
  )
}
