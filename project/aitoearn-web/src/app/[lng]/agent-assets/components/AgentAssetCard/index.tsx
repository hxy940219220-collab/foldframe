/**
 * AgentAssetCard - AI 生成素材卡片组件
 * 展示单个 AI 生成素材，支持类型标签与真实画幅比例标签
 */

'use client'

import type { AssetVo } from '@/types/agent-asset'
import { Film, Image as ImageIcon, Play } from 'lucide-react'
import { memo, useCallback } from 'react'
import { OssImage } from '@/components/common/OssImage'
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail'
import { getAssetMediaType, getAssetThumbUrl } from '@/utils/agent/asset'
import { cn } from '@/utils/className'
import { formatSeconds } from '@/utils/format'
import { VideoPlaceholder } from './VideoPlaceholder'

interface AgentAssetCardProps {
  /** 素材数据 */
  asset: AssetVo
  /** 预览按钮无文件名时的可访问性文案 */
  previewLabel: string
  /** 检测到的画幅比例标签（如 9:16、16:9） */
  ratioLabel?: string
  /** 图片加载完成回调（上报真实像素尺寸供比例筛选） */
  onDimensionsDetected?: (assetId: string, width: number, height: number) => void
  /** 点击回调 */
  onClick?: (asset: AssetVo) => void
}

export const AgentAssetCard = memo(({
  asset,
  previewLabel,
  ratioLabel,
  onDimensionsDetected,
  onClick,
}: AgentAssetCardProps) => {
  const mediaType = getAssetMediaType(asset)
  const rawThumbUrl = getAssetThumbUrl(asset)
  const isVideo = mediaType === 'video'
  const autoThumbUrl = useVideoThumbnail(isVideo && !rawThumbUrl ? asset.url : null)
  const thumbUrl = rawThumbUrl || autoThumbUrl
  const hasThumb = Boolean(thumbUrl)
  const duration = asset.metadata?.duration

  const handleClick = useCallback(() => {
    onClick?.(asset)
  }, [asset, onClick])

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const nw = e.currentTarget.naturalWidth
      const nh = e.currentTarget.naturalHeight
      if (nw > 0 && nh > 0) {
        onDimensionsDetected?.(asset.id, nw, nh)
      }
    },
    [asset.id, onDimensionsDetected],
  )

  return (
    <button
      type="button"
      aria-label={asset.filename || previewLabel}
      className={cn(
        'group relative block w-full rounded-xl overflow-hidden bg-muted cursor-pointer min-h-[120px] text-left',
        'transition-all duration-200 border border-border/40',
        'hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
      onClick={handleClick}
    >
      {hasThumb ? (
        <div className="relative">
          <OssImage
            src={thumbUrl}
            alt={asset.filename || ''}
            width={400}
            height={300}
            onLoad={handleImageLoad}
            className="w-full h-auto block"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
          />

          {/* 视频播放图标 */}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-foreground/60 flex items-center justify-center group-hover:bg-foreground/80 transition-colors">
                <Play className="w-5 h-5 text-background fill-current ml-0.5" />
              </div>
            </div>
          )}

          {/* 左上角类型角标 */}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
            {isVideo ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
            {isVideo ? '视频' : '图片'}
          </span>

          {/* 左下角比例标签 */}
          {ratioLabel && (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums backdrop-blur-xs">
              {ratioLabel}
            </span>
          )}

          {/* 右下角视频时长 */}
          {isVideo && duration && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded-md text-[10px] font-medium text-white tabular-nums backdrop-blur-xs">
              {formatSeconds(Math.floor(duration))}
            </div>
          )}

          {/* 悬浮遮罩 */}
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
        </div>
      ) : (
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <VideoPlaceholder />

          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
            {isVideo ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
            {isVideo ? '视频' : '图片'}
          </span>

          {ratioLabel && (
            <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums backdrop-blur-xs">
              {ratioLabel}
            </span>
          )}

          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-foreground/60 flex items-center justify-center group-hover:bg-foreground/80 transition-colors">
                <Play className="w-5 h-5 text-background fill-current ml-0.5" />
              </div>
            </div>
          )}

          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/10 transition-colors" />
        </div>
      )}
    </button>
  )
})

AgentAssetCard.displayName = 'AgentAssetCard'
