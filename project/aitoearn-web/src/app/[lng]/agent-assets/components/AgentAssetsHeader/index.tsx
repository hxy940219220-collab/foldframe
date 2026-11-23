/**
 * AgentAssetsHeader - AI 生成素材页顶部组件
 * 包含返回按钮、标题、类型分类 Tabs（全部/图片/视频）与比例筛选框
 */

'use client'

import { ArrowLeft, Bot, Film, Image as ImageIcon, Layers, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { StudioSelect } from '@/components/draft-box/components/StudioModes/StudioSelect'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'

export type AgentAssetTypeFilter = 'all' | 'image' | 'video'

export const AGENT_ASSET_RATIO_OPTIONS = [
  { value: 'all', label: '全部比例' },
  { value: 'portrait', label: '竖版 (9:16 / 3:4)' },
  { value: 'landscape', label: '横版 (16:9 / 4:3)' },
  { value: 'square', label: '方图 (1:1)' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '3:4', label: '3:4 笔记' },
  { value: '4:5', label: '4:5 竖图' },
  { value: '1:1', label: '1:1 方形' },
  { value: '4:3', label: '4:3 横图' },
  { value: '16:9', label: '16:9 宽屏' },
]

interface AgentAssetsHeaderProps {
  /** 总数量 */
  total: number
  /** 当前筛选结果数量 */
  filteredCount: number
  /** 图片数量 */
  imageCount: number
  /** 视频数量 */
  videoCount: number
  /** 当前类型筛选 */
  mediaTypeFilter: AgentAssetTypeFilter
  /** 类型切换回调 */
  onMediaTypeChange: (val: AgentAssetTypeFilter) => void
  /** 当前比例筛选 */
  ratioFilter: string
  /** 比例筛选回调 */
  onRatioFilterChange: (val: string) => void
  /** 是否有生效的筛选条件 */
  hasActiveFilter: boolean
  /** 重置筛选 */
  onResetFilters: () => void
}

export function AgentAssetsHeader({
  total,
  filteredCount,
  imageCount,
  videoCount,
  mediaTypeFilter,
  onMediaTypeChange,
  ratioFilter,
  onRatioFilterChange,
  hasActiveFilter,
  onResetFilters,
}: AgentAssetsHeaderProps) {
  const { t } = useTransClient('material')
  const router = useRouter()

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  const tabs: Array<{ id: AgentAssetTypeFilter, label: string, count: number, icon: typeof Layers }> = [
    { id: 'all', label: '全部', count: total, icon: Layers },
    { id: 'image', label: '图片', count: imageCount, icon: ImageIcon },
    { id: 'video', label: '视频', count: videoCount, icon: Film },
  ]

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-card/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="w-8 h-8 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-back text-gradient-foreground flex items-center justify-center shadow-sm shadow-primary/20">
            <Bot className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">{t('agentAssets.title')}</h1>
        </div>

        {total > 0 && (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {hasActiveFilter ? `${filteredCount} / ${total}` : `共 ${total} 项`}
          </span>
        )}
      </div>

      {/* 类型分类 Tabs + 比例筛选下拉框 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = mediaTypeFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onMediaTypeChange(tab.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                  active
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'opacity-70')} />
                <span>{tab.label}</span>
                <span className="text-[11px] opacity-65 tabular-nums">{tab.count}</span>
              </button>
            )
          })}
        </div>

        <StudioSelect
          className="w-[152px]"
          triggerClassName="h-8.5 text-xs"
          menuMinWidth={168}
          value={ratioFilter}
          options={AGENT_ASSET_RATIO_OPTIONS}
          onChange={onRatioFilterChange}
        />

        {hasActiveFilter && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex h-8.5 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </button>
        )}
      </div>
    </header>
  )
}
