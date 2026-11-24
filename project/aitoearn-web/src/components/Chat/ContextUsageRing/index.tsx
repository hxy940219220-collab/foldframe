'use client'

import type { IDisplayMessage, ITaskContextUsage } from '@/store/agent/agent.types'
import { useState } from 'react'
import { cn } from '@/utils/className'

export function estimateTextTokens(text?: string | null): number {
  const clean = (text || '').trim()
  if (!clean) return 0
  let cjk = 0
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    if (
      (code >= 0x4E00 && code <= 0x9FFF)
      || (code >= 0x3040 && code <= 0x30FF)
      || (code >= 0xAC00 && code <= 0xD7AF)
    ) {
      cjk++
    }
  }
  const rest = clean.length - cjk
  return Math.max(1, Math.round(cjk * 0.72 + rest * 0.28))
}

export function estimateConversationContextTokens(params: {
  serverUsage?: ITaskContextUsage | null
  messages?: IDisplayMessage[]
  draftText?: string
  draftMediaCount?: number
}): number {
  const { serverUsage, messages = [], draftText = '', draftMediaCount = 0 } = params
  let baseTokens = 0

  if (serverUsage && serverUsage.totalTokens > 0) {
    baseTokens = serverUsage.totalTokens
  }
  else if (messages.length > 0) {
    baseTokens = 650
    for (const msg of messages) {
      baseTokens += estimateTextTokens(msg.content)
      if (msg.steps?.length) {
        for (const step of msg.steps) {
          if (step.content && step.content !== msg.content) {
            baseTokens += estimateTextTokens(step.content)
          }
          if (step.workflowSteps?.length) {
            for (const wf of step.workflowSteps) {
              baseTokens += estimateTextTokens(wf.content) + estimateTextTokens(wf.result)
            }
          }
        }
      }
      if (msg.medias?.length) {
        baseTokens += msg.medias.length * 250
      }
    }
  }

  const draftTokens = estimateTextTokens(draftText) + draftMediaCount * 250
  return baseTokens + draftTokens
}

export function formatTokensInK(tokens: number): string {
  const safe = Math.max(0, Math.round(tokens))
  if (safe === 0) return '0k'
  if (safe < 10_000) {
    const k = Math.max(0.1, safe / 1000)
    const formatted = k.toFixed(1).replace(/\.0$/, '')
    return `${formatted}k`
  }
  return `${Math.round(safe / 1000)}k`
}

function formatUsagePercent(used: number, total: number): { label: string, ratio: number } {
  if (used <= 0 || total <= 0) {
    return { label: '0%', ratio: 0 }
  }
  const rawPct = Math.min(100, (used / total) * 100)
  const label = rawPct < 1
    ? `${Math.max(0.1, Number(rawPct.toFixed(1)))}%`
    : `${Math.round(rawPct)}%`
  return { label, ratio: rawPct / 100 }
}

export interface ContextUsageRingProps {
  usedTokens: number
  totalTokens: number
  className?: string
  testId?: string
}

/**
 * 上下文窗口占比指示器（镂空环形进度 + 悬浮深色详情卡片）
 * 悬浮展示：当前模型总上下文（K）、已消耗 Token（K）及占比百分比。
 */
export function ContextUsageRing({
  usedTokens,
  totalTokens,
  className,
  testId = 'context-usage-ring',
}: ContextUsageRingProps) {
  const [hovered, setHovered] = useState(false)
  const safeTotal = Math.max(1000, totalTokens || 200_000)
  const safeUsed = Math.max(0, usedTokens || 0)
  const { label: percentLabel, ratio } = formatUsagePercent(safeUsed, safeTotal)
  const usedK = formatTokensInK(safeUsed)
  const totalK = formatTokensInK(safeTotal)

  const radius = 7.2
  const circumference = 2 * Math.PI * radius
  // 有消耗但占比极小时，显示一小段可见起点弧以便一眼感知已占用
  const visualRatio = safeUsed > 0 ? Math.max(0.04, Math.min(1, ratio)) : 0
  const dashOffset = circumference * (1 - visualRatio)

  const arcColorClass = ratio >= 0.9
    ? 'text-rose-500'
    : ratio >= 0.7
      ? 'text-amber-500'
      : 'text-foreground/75'

  return (
    <div
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        data-testid={testId}
        aria-label={`上下文窗口：${percentLabel} 已用，已用 ${usedK} token，共 ${totalK}`}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus:outline-none cursor-pointer"
      >
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden>
          {/* 镂空底环 */}
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            className="text-muted-foreground/25"
          />
          {/* 已用进度弧（顺时针从 12 点钟起） */}
          {visualRatio > 0 && (
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 10 10)"
              className={cn('transition-all duration-300', arcColorClass)}
            />
          )}
        </svg>
      </button>

      {hovered && (
        <div
          role="tooltip"
          data-testid={`${testId}-tooltip`}
          className="pointer-events-none absolute bottom-full left-1/2 z-[120] mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-2xl border border-white/10 bg-[#1C1C1E]/96 px-4 py-2.5 text-center text-white shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="text-[11.5px] font-normal text-zinc-400">
            上下文窗口：
          </div>
          <div className="mt-0.5 text-[12.5px] font-medium text-zinc-200 tabular-nums">
            {percentLabel}
            {' '}
            已用
          </div>
          <div className="mt-0.5 text-[13px] font-semibold text-white tabular-nums">
            已用
            {' '}
            {usedK}
            {' '}
            token，共
            {' '}
            {totalK}
          </div>
        </div>
      )}
    </div>
  )
}

export default ContextUsageRing
