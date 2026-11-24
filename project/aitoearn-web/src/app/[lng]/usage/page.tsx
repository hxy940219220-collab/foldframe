// Account-scoped model usage and daily consumption.
'use client'

import type { UsageReport } from './usage.types'
import { BarChart3, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import { UsageReportView } from './UsageReportView'

type Result = { status: 'ok', report: UsageReport } | { status: 'loading' | 'error' | 'auth' }

function PeriodReport({ days, token, locale, refreshKey }: { days: number, token: string, locale: string, refreshKey: number }) {
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
  }, [days, token, attempt, refreshKey])

  if (result.status === 'ok')
    return <UsageReportView report={result.report} locale={locale} />
  if (result.status === 'loading') {
    return (
      <div role="status" aria-label={t('loading')} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <Skeleton className="h-[340px] rounded-2xl lg:col-span-8" />
          <Skeleton className="h-[340px] rounded-2xl lg:col-span-4" />
        </div>
        <Skeleton className="h-[220px] rounded-2xl" />
      </div>
    )
  }
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
      <p>{t(result.status === 'auth' ? 'auth' : 'error')}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setAttempt(n => n + 1)}>{t('retry')}</Button>
    </div>
  )
}

export default function UsagePage({ params }: { params: { lng: string } }) {
  const { t, ready } = useTransClient('usage')
  const token = useUserStore(state => state.token)
  const hydrated = useUserStore(state => state._hasHydrated)
  const [days, setDays] = useState(7)
  const [refreshKey, setRefreshKey] = useState(0)

  if (!ready)
    return <Skeleton className="m-6 h-32 rounded-2xl" />

  return (
    <div className="min-h-full bg-background">
      {/* 统一吸顶顶栏（与创作工作台、AI 生成素材页视觉对齐） */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/90 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-gradient-foreground shadow-sm shadow-primary/20">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground">{t('title')}</h1>
            <p className="text-[11px] text-muted-foreground">实时追踪模型调用、Token 消耗与视觉素材产出</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={t('period')}
            className="inline-flex items-center rounded-xl border border-border/80 bg-muted/50 p-0.5"
          >
            {[7, 30].map((period) => {
              const active = days === period
              return (
                <button
                  key={period}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDays(period)}
                  className={cn(
                    'rounded-lg px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                    active
                      ? 'bg-card text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('days', { count: period })}
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey(k => k + 1)}
            className="h-8 gap-1.5 rounded-xl text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6 md:px-8">
        {token
          ? <PeriodReport key={`${days}-${token}`} days={days} token={token} locale={params.lng} refreshKey={refreshKey} />
          : (
              <div role="status" className="rounded-2xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
                {t(hydrated ? 'auth' : 'loading')}
              </div>
            )}
      </div>
    </div>
  )
}
