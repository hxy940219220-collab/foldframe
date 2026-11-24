/**
 * 发布弹框左栏 - 专用「排版草稿箱」面板
 * 展示在排版工坊中已排版好、待排期发布的内容草稿，支持一键填入右侧发布区或拖拽导入。
 * 不再嵌入 AI 创作提示词表单，保持发布与排期工作流专注清晰。
 */
'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import {
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useDrag } from 'react-dnd'
import { getEmptyImage } from 'react-dnd-html5-backend'
import { useShallow } from 'zustand/react/shallow'
import { apiGetMaterialGroupList, apiGetMaterialList } from '@/api/materials/material.api'
import { applyDraftToPublishDialog, getDraftPlatformMeta } from '@/components/PublishDialog/draftSchedule.util'
import { PUBLISH_DIALOG_DND_TYPE } from '@/components/PublishDialog/PublishDialog.util'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'

interface DraftCardItemProps {
  draft: PromotionMaterial
  isApplied: boolean
  isApplying: boolean
  onApply: (draft: PromotionMaterial) => void
}

const DraggableDraftCard = memo<DraftCardItemProps>(({ draft, isApplied, isApplying, onApply }) => {
  const [{ isDragging }, drag, preview] = useDrag(
    () => ({
      type: PUBLISH_DIALOG_DND_TYPE,
      item: { kind: 'draft' as const, material: draft },
      collect: monitor => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [draft],
  )

  useEffect(() => {
    preview(getEmptyImage(), { captureDraggingState: true })
  }, [preview])

  const firstMedia = draft.mediaList?.[0]
  const isVideo = firstMedia?.type === 'video' || draft.type === 'video'
  const coverSrc = draft.coverUrl || firstMedia?.thumbUrl || (firstMedia?.type === 'img' ? firstMedia.url : '')
  const resolvedCover = coverSrc ? getOssUrl(coverSrc) : ''
  const resolvedVideo = isVideo && firstMedia?.url ? getOssUrl(firstMedia.url) : ''
  const platMeta = getDraftPlatformMeta(draft.accountTypes?.[0])
  const mediaCount = draft.mediaList?.length || 0

  return (
    <div
      ref={(node) => {
        drag(node)
      }}
      data-testid={`publish-draft-card-${draft.id}`}
      className={cn(
        'group relative flex gap-3 rounded-2xl border bg-card p-3 transition-all',
        isDragging && 'opacity-50 ring-2 ring-primary/40',
        isApplied
          ? 'border-primary/50 bg-primary/[0.03] shadow-sm'
          : 'border-border/80 hover:border-primary/35 hover:shadow-sm',
      )}
    >
      {/* 封面预览 */}
      <div className="relative h-22 w-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/40">
        {resolvedCover ? (
          <img
            src={resolvedCover}
            alt={draft.title || 'draft cover'}
            className="h-full w-full object-cover"
          />
        ) : resolvedVideo ? (
          <video
            src={resolvedVideo}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover bg-black"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
            <FileText className="h-6 w-6" />
          </div>
        )}
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
          {isVideo ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
          {isVideo ? '视频' : `${mediaCount} 图`}
        </span>
      </div>

      {/* 文案摘要 + 平台 + 一键填入 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('shrink-0 rounded-full border px-2 py-0 text-[10px] font-semibold leading-4', platMeta.badgeClass)}>
                {platMeta.label}
              </span>
              <span className="inline-flex items-center text-muted-foreground/40 cursor-grab" title="也可直接拖拽到右侧发布区">
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            </div>
            <Link
              href={`/ai-social?tab=publisher&draftId=${encodeURIComponent(draft.id)}`}
              title="在排版工坊中精修"
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary"
            >
              <span>精修</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <h4 className="line-clamp-1 text-xs font-semibold text-foreground" title={draft.title}>
            {draft.title || '未命名排版草稿'}
          </h4>

          {draft.desc && (
            <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
              {draft.desc}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-hidden">
            {(draft.topics || []).slice(0, 2).map(tag => (
              <span
                key={tag}
                className="max-w-[90px] truncate rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                #{tag.replace(/^#+/, '')}
              </span>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            variant={isApplied ? 'secondary' : 'default'}
            data-testid={`publish-draft-fill-btn-${draft.id}`}
            disabled={isApplying}
            onClick={() => onApply(draft)}
            className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-[11px] font-medium cursor-pointer"
          >
            {isApplying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isApplied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            <span>{isApplied ? '已填入' : '一键填入'}</span>
          </Button>
        </div>
      </div>
    </div>
  )
})

DraggableDraftCard.displayName = 'DraggableDraftCard'

const PublishDialogDraftPanel = memo(() => {
  const [drafts, setDrafts] = useState<PromotionMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [appliedId, setAppliedId] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const { pubListLength } = usePublishDialog(
    useShallow(state => ({
      pubListLength: state.pubList.length,
    })),
  )

  const fetchAllDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const groupRes = await apiGetMaterialGroupList(1, 20)
      const groups = groupRes?.data?.list || []
      if (groups.length === 0) {
        setDrafts([])
        return
      }
      const lists = await Promise.all(
        groups.slice(0, 5).map(async (g) => {
          const res = await apiGetMaterialList(g.id, 1, 50)
          return res?.data?.list || []
        }),
      )
      const merged = lists.flat()
      // 去重并按最新时间倒序
      const dedup = Array.from(new Map(merged.map(item => [item.id, item])).values())
      dedup.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      setDrafts(dedup)
    }
    catch (err) {
      console.error('[PublishDialogDraftPanel] Failed to load drafts:', err)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAllDrafts()
  }, [fetchAllDrafts])

  const availablePlatforms = useMemo(() => {
    const set = new Set<string>()
    for (const d of drafts) {
      for (const p of d.accountTypes || []) {
        if (p) set.add(p)
      }
    }
    return Array.from(set)
  }, [drafts])

  const filteredDrafts = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return drafts.filter((d) => {
      const matchPlat = platformFilter === 'all' || (d.accountTypes || []).includes(platformFilter)
      const matchQuery = !q
        || (d.title || '').toLowerCase().includes(q)
        || (d.desc || '').toLowerCase().includes(q)
        || (d.topics || []).some(tag => tag.toLowerCase().includes(q))
      return matchPlat && matchQuery
    })
  }, [drafts, platformFilter, searchText])

  const handleApplyDraft = useCallback(async (draft: PromotionMaterial) => {
    setApplyingId(draft.id)
    try {
      const result = await applyDraftToPublishDialog(draft)
      setAppliedId(draft.id)
      if (!result.hasAccounts) {
        toast.info('已加载草稿内容，请先在右侧添加并选择发布渠道账号')
      }
      else {
        toast.success('已将排版草稿一键填入右侧发布区')
      }
    }
    catch (err) {
      console.error('[PublishDialogDraftPanel] apply draft failed:', err)
      toast.error('填入草稿失败，请重试')
    }
    finally {
      setApplyingId(null)
    }
  }, [])

  return (
    <div
      data-testid="publish-dialog-draft-panel"
      className="flex h-full min-h-0 flex-col bg-muted/20"
    >
      {/* 顶部标题栏 */}
      <div className="shrink-0 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-back text-gradient-foreground shadow-sm shadow-primary/20">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">排版草稿箱</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-primary">
              {drafts.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void fetchAllDrafts()}
              title="刷新草稿箱"
              className="h-7.5 w-7.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7.5 gap-1.5 rounded-lg px-2.5 text-xs font-medium"
            >
              <Link href="/ai-social?tab=publisher">
                <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
                <span>去排版工坊</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* 搜索 + 平台筛选 */}
        <div className="mt-2.5 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索草稿…"
              className="h-8 rounded-xl bg-muted/40 pl-8 text-xs"
            />
          </div>

          {availablePlatforms.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setPlatformFilter('all')}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                  platformFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                全部 ({drafts.length})
              </button>
              {availablePlatforms.map((plat) => {
                const meta = getDraftPlatformMeta(plat)
                const active = platformFilter === plat
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => setPlatformFilter(plat)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 草稿列表滚动区 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/70 px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              {drafts.length === 0 ? '暂无待发布的排版草稿' : '未找到匹配的草稿'}
            </h4>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              {drafts.length === 0
                ? '在「排版工坊」调好配图比例、标题与各平台文案后，点击「存入草稿箱」即可在此一键选用并排期发布。'
                : '试试清空筛选关键词或切换目标平台。'}
            </p>
            <Button asChild size="sm" className="mt-4 gap-1.5 rounded-full px-4">
              <Link href="/ai-social?tab=publisher">
                <LayoutTemplate className="h-3.5 w-3.5" />
                <span>前往排版工坊</span>
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {pubListLength === 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                提示：当前尚未绑定发布渠道，右侧添加频道后即可直接将以下草稿定时发布。
              </div>
            )}
            {filteredDrafts.map(draft => (
              <DraggableDraftCard
                key={draft.id}
                draft={draft}
                isApplied={appliedId === draft.id}
                isApplying={applyingId === draft.id}
                onApply={handleApplyDraft}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
})

PublishDialogDraftPanel.displayName = 'PublishDialogDraftPanel'

export default PublishDialogDraftPanel
