'use client'

import type { DraftMediaGenerationMeta } from '@/api/ai/ai.api'
import type { MediaPreviewItem } from '@/components/common/MediaPreview'
import {
  Check,
  Clock,
  Coins,
  Copy,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize,
  Ratio,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiGetDraftMediaMeta } from '@/api/ai/ai.api'
import { useAiBatchGenerateBarStore } from '@/components/draft-box/components/AiBatchGenerateBar/store'
import { useDraftBoxConfigStore } from '@/store/draft-box/draftBoxConfigStore'
import { toast } from '@/utils/ui/toast'

const metaCache = new Map<string, DraftMediaGenerationMeta>()

interface MediaDetailSidebarProps {
  item: MediaPreviewItem
  groupId?: string
  onClosePreview?: () => void
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatElapsed(ms?: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return `${ms} ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)} 秒`
  const min = Math.floor(sec / 60)
  const rem = Math.round(sec % 60)
  return `${min} 分 ${rem} 秒`
}

export function MediaDetailSidebar({
  item,
  groupId,
  onClosePreview,
}: MediaDetailSidebarProps) {
  const cacheKey = `${item.mediaId || ''}::${item.rawUrl || item.src}`
  const [meta, setMeta] = useState<DraftMediaGenerationMeta | null>(() => metaCache.get(cacheKey) ?? null)
  const [loading, setLoading] = useState<boolean>(() => !metaCache.has(cacheKey))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
    const cached = metaCache.get(cacheKey)
    if (cached) {
      setMeta(cached)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setMeta(null)

    apiGetDraftMediaMeta({
      mediaId: item.mediaId,
      url: item.rawUrl || item.src,
    })
      .then((res) => {
        if (cancelled) return
        const data: DraftMediaGenerationMeta = (res?.data as DraftMediaGenerationMeta | undefined) ?? { found: false }
        metaCache.set(cacheKey, data)
        setMeta(data)
      })
      .catch(() => {
        if (cancelled) return
        setMeta({ found: false })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, item.mediaId, item.rawUrl, item.src])

  const handleCopyPrompt = async () => {
    if (!meta?.prompt) return
    try {
      await navigator.clipboard.writeText(meta.prompt)
      setCopied(true)
      toast.success('提示词已复制')
      setTimeout(() => setCopied(false), 1800)
    }
    catch {
      toast.error('复制失败，请手动选中复制')
    }
  }

  const handleReusePrompt = () => {
    if (!meta?.prompt || !groupId) return
    useAiBatchGenerateBarStore.getState().patchState(groupId, { promptValue: meta.prompt })
    useDraftBoxConfigStore.getState().updateConfig(groupId, { promptValue: meta.prompt })
    toast.success('已填入创作输入框')
    onClosePreview?.()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 py-16 text-white/55">
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
        <span className="text-xs">正在加载生成详情…</span>
      </div>
    )
  }

  if (!meta?.found) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-white/80">
            {item.type === 'video' ? <Film className="h-4 w-4 text-violet-400" /> : <ImageIcon className="h-4 w-4 text-violet-400" />}
            <span>{item.type === 'video' ? '视频素材' : '图片素材'}</span>
          </div>
          {item.title && (
            <p className="mt-2 break-all text-xs text-white/70">{item.title}</p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            该素材为本地上传或暂无关联的 AI 生成任务记录。
          </p>
        </div>

        {item.createdAt && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 flex items-center justify-between text-xs">
            <span className="text-white/50">创建时间</span>
            <span className="text-white/85 tabular-nums">{formatDateTime(item.createdAt)}</span>
          </div>
        )}
      </div>
    )
  }

  const resolutionDisplay = meta.mediaType === 'video'
    ? (meta.resolution || meta.imageSize)
    : (meta.imageSize || meta.resolution)

  const perItemCredits = meta.creditsUsed != null && meta.creditsUsed > 0 && meta.imageCount && meta.imageCount > 1
    ? Math.round((meta.creditsUsed / meta.imageCount) * 100) / 100
    : null

  const creditsBadgeLabel = meta.creditsUnit === 'codex'
    ? 'Codex 本机'
    : meta.creditsUnit === 'dreamina'
      ? '即梦积分'
      : '系统积分'

  return (
    <div className="space-y-4">
      {/* 提示词区块 */}
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/60">提示词</span>
          {meta.prompt && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-white/80 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
              {groupId && (
                <button
                  type="button"
                  onClick={handleReusePrompt}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/25 hover:text-white transition-colors cursor-pointer"
                >
                  <WandSparkles className="h-3 w-3" />
                  <span>复用</span>
                </button>
              )}
            </div>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/92">
          {meta.prompt || '（未记录提示词）'}
        </p>
      </section>

      {/* 模型与积分核心卡片 */}
      <section className="grid gap-2.5">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-white/50">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            <span>所用模型</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-white">
              {meta.modelDisplayName || meta.model || '未知模型'}
            </span>
            {meta.model && meta.modelDisplayName && meta.modelDisplayName !== meta.model && (
              <span className="truncate text-[11px] font-mono text-white/40">{meta.model}</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-200/80">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span>消耗积分</span>
            </div>
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
              {creditsBadgeLabel}
            </span>
          </div>
          <div className="mt-1.5">
            {meta.creditsUnit === 'codex' ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-semibold text-amber-200">ChatGPT 订阅额度</span>
                <span className="text-[11px] text-amber-100/65">本机 Codex 直连 · 免 API 扣费</span>
              </div>
            ) : meta.creditsUsed != null ? (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-bold tabular-nums text-amber-300">
                  {meta.creditsUsed}
                  {' '}
                  积分
                </span>
                {meta.creditsUsed === 0 && meta.creditsUnit === 'dreamina' ? (
                  <span className="text-[11px] text-emerald-300/90">
                    会员 / 活动限免
                  </span>
                ) : perItemCredits != null ? (
                  <span className="text-[11px] text-amber-100/65">
                    本批共 {meta.imageCount} 张（约 {perItemCredits} 积分/张）
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-white/60">
                {meta.creditsUnit === 'dreamina'
                  ? '由即梦账号直接扣费（本次历史记录未采集具体差值，新生成将自动记录）'
                  : '未记录具体积分消耗'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 生成参数网格 */}
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="mb-2.5 text-xs font-medium text-white/60">生成参数</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-1 text-[11px] text-white/45">
              <Maximize className="h-3 w-3" />
              <span>清晰度</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-white/90">
              {resolutionDisplay || '默认'}
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-1 text-[11px] text-white/45">
              <Ratio className="h-3 w-3" />
              <span>画面比例</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-white/90">
              {meta.aspectRatio || '默认'}
            </div>
          </div>

          {meta.mediaType === 'video' ? (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-white/45">
                <Film className="h-3 w-3" />
                <span>视频时长</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-white/90">
                {meta.duration ? `${meta.duration} 秒` : '默认'}
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-1 text-[11px] text-white/45">
                <Layers className="h-3 w-3" />
                <span>本批数量</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-white/90">
                {meta.imageCount ? `${meta.imageCount} 张` : '1 张'}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="flex items-center gap-1 text-[11px] text-white/45">
              <Clock className="h-3 w-3" />
              <span>生成耗时</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-white/90 tabular-nums">
              {formatElapsed(meta.generationDurationMs)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5 text-[11px]">
          <span className="text-white/45">生成时间</span>
          <span className="text-white/75 tabular-nums">{formatDateTime(meta.createdAt || item.createdAt)}</span>
        </div>
      </section>
    </div>
  )
}
