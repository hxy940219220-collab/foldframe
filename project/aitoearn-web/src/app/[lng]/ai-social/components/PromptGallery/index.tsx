/**
 * PromptGallery - PostPilot 精选商业创作案例画廊
 * 展示真实商业视频与视觉大片，支持交互预览与一键填入 AI 对话发布
 */
'use client'

import type { PostPilotShowcaseItem } from './data'
import { ArrowUpRight, Film, Image as ImageIcon, Play, Sparkles, X } from 'lucide-react'
import { memo, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'
import { promptGalleryAssets } from './data'

export interface ApplyPromptData {
  prompt: string
  materials?: string[]
  mode: 'edit' | 'generate'
}

export interface PromptGalleryProps {
  onApplyPrompt?: (data: ApplyPromptData) => void
  className?: string
}

const PromptGallery = memo(({ onApplyPrompt, className }: PromptGalleryProps) => {
  const [selectedItem, setSelectedItem] = useState<PostPilotShowcaseItem | null>(null)

  const handleApply = useCallback((item: PostPilotShowcaseItem) => {
    onApplyPrompt?.({
      prompt: item.prompt,
      materials: item.materials,
      mode: 'generate',
    })
    setSelectedItem(null)
  }, [onApplyPrompt])

  return (
    <section className="mb-12 px-4 md:px-6 lg:px-8">
      <div className={cn('mx-auto w-full max-w-5xl', className)}>
        {/* 标题区域 */}
        <div className="mb-7 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            PostPilot 商业实战案例
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            精选创作示例
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            点击任意商业作品查看完整指令，一键套用到上方 AI 对话直接生成并发布
          </p>
        </div>

        {/* 3 列沉浸式视觉卡片 */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {promptGalleryAssets.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="group relative flex aspect-[4/5] cursor-pointer flex-col justify-end overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_8px_28px_-14px_rgba(31,27,75,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_18px_36px_-14px_rgba(67,56,202,0.3)]"
            >
              <img
                src={item.cover}
                alt={item.title}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* 顶部柔和标签 */}
              <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur-md">
                  {item.mediaType === 'video' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                  {item.category}
                </span>
                {item.mediaType === 'video' && (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#1F1B4B] shadow-md transition-transform group-hover:scale-110">
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  </span>
                )}
              </div>

              {/* 底部毛玻璃渐变信息层 */}
              <div className="relative z-10 bg-gradient-to-t from-black/82 via-black/45 to-transparent p-4 pt-14 text-white">
                <div className="text-[11px] font-medium text-white/75">{item.highlight}</div>
                <h3 className="mt-1 text-sm font-semibold leading-snug text-white">
                  {item.title}
                </h3>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[11px] text-white/70">查看指令详情</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleApply(item)
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#1F1B4B] shadow-sm transition-all hover:bg-white cursor-pointer"
                  >
                    一键复用
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 轻奢玻璃预览与一键复用弹窗 */}
        {selectedItem && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:grid-cols-[1.05fr_1fr]"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative flex min-h-[280px] items-center justify-center bg-zinc-950">
                {selectedItem.mediaType === 'video' && selectedItem.video
                  ? (
                      <video
                        src={selectedItem.video}
                        poster={selectedItem.cover}
                        controls
                        autoPlay
                        loop
                        className="max-h-[440px] w-full object-contain"
                      />
                    )
                  : (
                      <img
                        src={selectedItem.cover}
                        alt={selectedItem.title}
                        className="max-h-[440px] w-full object-contain"
                      />
                    )}
              </div>

              <div className="flex flex-col justify-between p-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
                        {selectedItem.category}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-foreground">
                        {selectedItem.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{selectedItem.highlight}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(null)}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/35 p-3">
                    <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">推荐创作指令</div>
                    <p className="text-xs leading-6 text-foreground">
                      {selectedItem.prompt}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedItem(null)}>
                    关闭
                  </Button>
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => handleApply(selectedItem)}>
                    <Sparkles className="h-3.5 w-3.5" />
                    一键填入对话
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
})

export default PromptGallery
