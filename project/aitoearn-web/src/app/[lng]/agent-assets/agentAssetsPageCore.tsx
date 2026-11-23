/**
 * AgentAssetsPageCore - AI 生成素材详情页核心组件
 * 支持按类型（全部 / 图片 / 视频）与画面比例（竖版 / 横版 / 方图 / 具体比例）快速筛选
 */

'use client'

import type { AgentAssetTypeFilter } from './components/AgentAssetsHeader'
import type { MediaPreviewItem } from '@/components/common/MediaPreview'
import type { AssetVo } from '@/types/agent-asset'
import { Bot, Filter, Loader2, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import InfiniteScroll from 'react-infinite-scroll-component'
import Masonry from 'react-masonry-css'
import { getAgentAssets } from '@/api/ai/ai.api'
import { useTransClient } from '@/app/i18n/client'
import { MediaPreview } from '@/components/common/MediaPreview'
import { MediaDetailSidebar } from '@/components/draft-box/components/MediaDetailSidebar'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks'
import { getAssetMediaType } from '@/utils/agent/asset'
import { getOssUrl } from '@/utils/oss'
import { AgentAssetCard } from './components/AgentAssetCard'
import { AgentAssetCardSkeleton } from './components/AgentAssetCard/AgentAssetCardSkeleton'
import { AgentAssetsHeader } from './components/AgentAssetsHeader'

const PAGE_SIZE = 40

const MASONRY_BREAKPOINTS = {
  default: 5,
  1280: 4,
  1024: 3,
  768: 3,
  640: 2,
}

interface DetectedAssetDims {
  w: number
  h: number
  ratioLabel: string
  orientation: 'portrait' | 'landscape' | 'square'
}

function classifyDimensions(w: number, h: number): DetectedAssetDims {
  const r = w / h
  const orientation: 'portrait' | 'landscape' | 'square' = r < 0.92
    ? 'portrait'
    : r > 1.08
      ? 'landscape'
      : 'square'

  const known: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['4:5', 4 / 5],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
  ]
  let ratioLabel = `${r.toFixed(2)}:1`
  for (const [label, val] of known) {
    if (Math.abs(r - val) / val < 0.09) {
      ratioLabel = label
      break
    }
  }
  return { w, h, ratioLabel, orientation }
}

export function AgentAssetsPageCore() {
  const { t } = useTransClient('material')
  useDocumentTitle(t('agentAssets.title'))

  const [assets, setAssets] = useState<AssetVo[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // 类型与比例筛选状态
  const [mediaTypeFilter, setMediaTypeFilter] = useState<AgentAssetTypeFilter>('all')
  const [ratioFilter, setRatioFilter] = useState<string>('all')
  const [dimsMap, setDimsMap] = useState<Record<string, DetectedAssetDims>>({})
  const probedIdsRef = useRef<Set<string>>(new Set())

  // 预览弹窗状态
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)

  const recordAssetDims = useCallback((assetId: string, w: number, h: number) => {
    if (!w || !h) return
    setDimsMap((prev) => {
      const existing = prev[assetId]
      if (existing && existing.w === w && existing.h === h) return prev
      return { ...prev, [assetId]: classifyDimensions(w, h) }
    })
  }, [])

  // 从 metadata 提取或轻量后台探测未记录像素的素材尺寸，确保比例筛选准确无遗漏
  useEffect(() => {
    if (assets.length === 0) return
    let cancelled = false

    const metaUpdates: Record<string, DetectedAssetDims> = {}
    const toProbe: AssetVo[] = []

    for (const asset of assets) {
      if (probedIdsRef.current.has(asset.id)) continue
      const mw = asset.metadata?.width
      const mh = asset.metadata?.height
      if (mw && mh) {
        probedIdsRef.current.add(asset.id)
        metaUpdates[asset.id] = classifyDimensions(mw, mh)
      }
      else {
        toProbe.push(asset)
      }
    }

    if (Object.keys(metaUpdates).length > 0) {
      setDimsMap(prev => ({ ...metaUpdates, ...prev }))
    }

    for (const asset of toProbe) {
      probedIdsRef.current.add(asset.id)
      const mediaType = getAssetMediaType(asset)
      if (mediaType === 'video') {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.onloadedmetadata = () => {
          if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) {
            recordAssetDims(asset.id, video.videoWidth, video.videoHeight)
          }
          video.src = ''
        }
        video.src = getOssUrl(asset.url)
      }
      else {
        const img = new window.Image()
        img.onload = () => {
          if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
            recordAssetDims(asset.id, img.naturalWidth, img.naturalHeight)
          }
        }
        img.src = getOssUrl(asset.url)
      }
    }

    return () => {
      cancelled = true
    }
  }, [assets, recordAssetDims])

  const fetchAssets = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getAgentAssets({ page: 1, pageSize: PAGE_SIZE })
      if (result?.data) {
        const list = result.data.list || []
        const totalCount = result.data.total || 0
        setAssets(list)
        setTotal(totalCount)
        setPage(1)
        setHasMore(list.length < totalCount)
      }
    }
    catch (error) {
      console.error('Failed to fetch agent assets:', error)
    }
    finally {
      setIsLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore)
      return

    const nextPage = page + 1
    setIsLoadingMore(true)

    try {
      const result = await getAgentAssets({ page: nextPage, pageSize: PAGE_SIZE })
      if (result?.data) {
        const newList = result.data.list || []
        const totalCount = result.data.total || 0
        const combinedList = [...assets, ...newList]

        setAssets(combinedList)
        setTotal(totalCount)
        setPage(nextPage)
        setHasMore(combinedList.length < totalCount)
      }
    }
    catch (error) {
      console.error('Failed to load more agent assets:', error)
    }
    finally {
      setIsLoadingMore(false)
    }
  }, [page, assets, isLoadingMore, hasMore])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  const { imageCount, videoCount } = useMemo(() => {
    let img = 0
    let vid = 0
    for (const a of assets) {
      if (getAssetMediaType(a) === 'video') vid += 1
      else img += 1
    }
    return { imageCount: img, videoCount: vid }
  }, [assets])

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const isVideo = getAssetMediaType(asset) === 'video'
      if (mediaTypeFilter === 'image' && isVideo) return false
      if (mediaTypeFilter === 'video' && !isVideo) return false

      if (ratioFilter !== 'all') {
        const dims = dimsMap[asset.id]
        if (!dims) return false
        if (ratioFilter === 'portrait' || ratioFilter === 'landscape' || ratioFilter === 'square') {
          if (dims.orientation !== ratioFilter) return false
        }
        else if (dims.ratioLabel !== ratioFilter) {
          return false
        }
      }
      return true
    })
  }, [assets, mediaTypeFilter, ratioFilter, dimsMap])

  const hasActiveFilter = mediaTypeFilter !== 'all' || ratioFilter !== 'all'

  const handleResetFilters = useCallback(() => {
    setMediaTypeFilter('all')
    setRatioFilter('all')
  }, [])

  const handleAssetClick = useCallback(
    (asset: AssetVo) => {
      const index = filteredAssets.findIndex(a => a.id === asset.id)
      if (index !== -1) {
        setPreviewIndex(index)
        setPreviewOpen(true)
      }
    },
    [filteredAssets],
  )

  const previewItems = useMemo<MediaPreviewItem[]>(() => {
    return filteredAssets.map((asset) => {
      const mediaType = getAssetMediaType(asset)
      return {
        type: mediaType === 'video' ? 'video' : 'image',
        src: getOssUrl(asset.url),
        rawUrl: asset.url,
        title: asset.filename,
      }
    })
  }, [filteredAssets])

  return (
    <div className="min-h-full bg-background">
      {/* 顶部导航 + 类型与比例筛选栏 */}
      <AgentAssetsHeader
        total={total || assets.length}
        filteredCount={filteredAssets.length}
        imageCount={imageCount}
        videoCount={videoCount}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeChange={setMediaTypeFilter}
        ratioFilter={ratioFilter}
        onRatioFilterChange={setRatioFilter}
        hasActiveFilter={hasActiveFilter}
        onResetFilters={handleResetFilters}
      />

      {/* 主内容区 */}
      <main className="px-4 py-6">
        <div className="w-full mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 15 }).map((_, index) => (
                <AgentAssetCardSkeleton key={index} index={index} />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <Bot className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('agentAssets.noAssets')}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                {t('agentAssets.noAssetsDesc')}
              </p>
              <Button asChild className="cursor-pointer">
                <Link href="/">{t('agentAssets.goToChat')}</Link>
              </Button>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Filter className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-medium text-foreground mb-1.5">
                当前筛选条件下暂无匹配素材
              </h3>
              <p className="text-xs text-muted-foreground mb-5">
                可切换素材类型或调整画面比例条件查看全部素材
              </p>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 cursor-pointer" onClick={handleResetFilters}>
                <RotateCcw className="w-3.5 h-3.5" />
                重置全部筛选
              </Button>
            </div>
          ) : (
            <InfiniteScroll
              dataLength={filteredAssets.length}
              next={loadMore}
              hasMore={hasMore}
              scrollThreshold={0.8}
              loader={(
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
              endMessage={
                filteredAssets.length > 0 && (
                  <div className="flex justify-center py-8 text-muted-foreground text-sm">
                    {t('mediaManagement.loadedAll')}
                    {' · '}
                    {filteredAssets.length}
                    {' '}
                    {t('mediaManagement.resources')}
                  </div>
                )
              }
              scrollableTarget="main-content"
            >
              <Masonry
                breakpointCols={MASONRY_BREAKPOINTS}
                className="flex -ml-4 w-auto"
                columnClassName="pl-4 bg-clip-padding"
              >
                {filteredAssets.map(asset => (
                  <div key={asset.id} className="mb-4">
                    <AgentAssetCard
                      asset={asset}
                      ratioLabel={dimsMap[asset.id]?.ratioLabel}
                      onDimensionsDetected={recordAssetDims}
                      previewLabel={t('agentAssets.previewAsset')}
                      onClick={handleAssetClick}
                    />
                  </div>
                ))}
              </Masonry>
            </InfiniteScroll>
          )}
        </div>
      </main>

      {/* 媒体预览弹窗（附带生成详情侧边栏） */}
      <MediaPreview
        open={previewOpen}
        items={previewItems}
        initialIndex={previewIndex}
        onClose={() => setPreviewOpen(false)}
        renderSidebar={item => <MediaDetailSidebar item={item} onClosePreview={() => setPreviewOpen(false)} />}
      />
    </div>
  )
}
