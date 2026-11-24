'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import dayjs from 'dayjs'
import {
  CalendarPlus,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiDeleteMaterial,
  apiGetMaterialGroupList,
  apiGetMaterialList,
} from '@/api/materials/material.api'
import { getDraftPlatformMeta } from '@/components/PublishDialog/draftSchedule.util'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'

export interface ScheduledDraftBoxViewProps {
  onScheduleDraft: (draft: PromotionMaterial) => void
  onDraftCountChange?: (count: number) => void
}

const ScheduledDraftBoxView = memo<ScheduledDraftBoxViewProps>(({
  onScheduleDraft,
  onDraftCountChange,
}) => {
  const [drafts, setDrafts] = useState<PromotionMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('all')

  const fetchDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const groupRes = await apiGetMaterialGroupList(1, 20)
      const groups = groupRes?.data?.list || []
      if (groups.length === 0) {
        setDrafts([])
        onDraftCountChange?.(0)
        return
      }
      const lists = await Promise.all(
        groups.slice(0, 5).map(async (g) => {
          const res = await apiGetMaterialList(g.id, 1, 50)
          return res?.data?.list || []
        }),
      )
      const dedup = Array.from(new Map(lists.flat().map(item => [item.id, item])).values())
      dedup.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      setDrafts(dedup)
      onDraftCountChange?.(dedup.length)
    }
    catch (err) {
      console.error('[ScheduledDraftBoxView] Failed to fetch drafts:', err)
      toast.error('获取草稿列表失败')
    }
    finally {
      setLoading(false)
    }
  }, [onDraftCountChange])

  useEffect(() => {
    void fetchDrafts()
  }, [fetchDrafts])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await apiDeleteMaterial(id)
      if (res && res.code === 0) {
        setDrafts((prev) => {
          const next = prev.filter(item => item.id !== id)
          onDraftCountChange?.(next.length)
          return next
        })
        toast.success('草稿已删除')
      }
      else {
        toast.error(res?.message || '删除草稿失败')
      }
    }
    catch {
      toast.error('删除草稿失败')
    }
    finally {
      setDeletingId(null)
    }
  }

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

  return (
    <div data-testid="accounts-draft-box-view" className="flex flex-1 min-h-0 flex-col bg-background">
      {/* 二级筛选条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索草稿…"
              className="h-8.5 rounded-xl bg-background pl-8.5 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setPlatformFilter('all')}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                platformFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/70 text-muted-foreground hover:text-foreground',
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
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-muted/70 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchDrafts()}
            className="h-8.5 gap-1.5 rounded-xl text-xs cursor-pointer"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>刷新</span>
          </Button>
          <Button asChild size="sm" className="h-8.5 gap-1.5 rounded-xl text-xs">
            <Link href="/ai-social?tab=publisher">
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span>去排版工坊</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* 草稿卡片网格 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="mx-auto mt-10 flex max-w-md flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-8 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Layers className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {drafts.length === 0 ? '排版草稿箱还是空的' : '没有符合筛选条件的草稿'}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {drafts.length === 0
                ? '在「策划与排版 → 排版工坊」中调整好画面比例、标题、文案和标签，点击「存入草稿箱」，即可在此统一管理并一键排期发布。'
                : '可以清空搜索词或切换到「全部」查看所有草稿。'}
            </p>
            <Button asChild className="mt-5 gap-1.5 rounded-full px-5">
              <Link href="/ai-social?tab=publisher">
                <LayoutTemplate className="h-4 w-4" />
                <span>打开排版工坊</span>
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDrafts.map((draft) => {
              const firstMedia = draft.mediaList?.[0]
              const isVideo = firstMedia?.type === 'video' || draft.type === 'video'
              const coverSrc = draft.coverUrl || firstMedia?.thumbUrl || (firstMedia?.type === 'img' ? firstMedia.url : '')
              const resolvedCover = coverSrc ? getOssUrl(coverSrc) : ''
              const resolvedVideo = isVideo && firstMedia?.url ? getOssUrl(firstMedia.url) : ''
              const platMeta = getDraftPlatformMeta(draft.accountTypes?.[0])
              const mediaCount = draft.mediaList?.length || 0

              return (
                <article
                  key={draft.id}
                  data-testid={`accounts-draft-card-${draft.id}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
                >
                  {/* 视觉封面区 */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
                    {resolvedCover ? (
                      <img
                        src={resolvedCover}
                        alt={draft.title || 'draft cover'}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
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
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <FileText className="h-10 w-10" />
                      </div>
                    )}

                    <div className="absolute left-3 top-3 flex items-center gap-1.5">
                      <span className={cn('rounded-full border bg-background/90 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-xs', platMeta.badgeClass)}>
                        {platMeta.label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-xs">
                        {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                        {isVideo ? '视频成片' : `${mediaCount} 张图文`}
                      </span>
                    </div>

                    {draft.createdAt && (
                      <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-xs">
                        {dayjs(draft.createdAt).format('MM-DD HH:mm')}
                      </span>
                    )}
                  </div>

                  {/* 正文与标签区 */}
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={draft.title}>
                      {draft.title || '未命名排版草稿'}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {draft.desc || '暂无正文描述'}
                    </p>

                    {(draft.topics?.length || 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {draft.topics!.slice(0, 4).map(tag => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                          >
                            #{tag.replace(/^#+/, '')}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 操作脚栏 */}
                    <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`accounts-draft-schedule-${draft.id}`}
                        onClick={() => onScheduleDraft(draft)}
                        className="h-8 flex-1 gap-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>一键排期发布</span>
                      </Button>

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        title="在排版工坊中精修"
                        className="h-8 gap-1 rounded-xl px-2.5 text-xs"
                      >
                        <Link href={`/ai-social?tab=publisher&draftId=${encodeURIComponent(draft.id)}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>精修</span>
                        </Link>
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === draft.id}
                        onClick={() => void handleDelete(draft.id)}
                        title="删除草稿"
                        className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      >
                        {deletingId === draft.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})

ScheduledDraftBoxView.displayName = 'ScheduledDraftBoxView'

export default ScheduledDraftBoxView
