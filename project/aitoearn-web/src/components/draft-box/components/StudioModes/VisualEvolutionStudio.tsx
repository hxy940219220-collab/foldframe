'use client'

import type { ImageModelType, VideoModelType } from '@/api/ai/ai.types'
import type { MediaPreviewItem } from '@/components/common/MediaPreview'
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Palette,
  RefreshCw,
  Shirt,
  Smile,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { apiCreateDraftGeneration, apiCreateImageTextDraft } from '@/api/ai/ai.api'
import { batchDeleteMedia, uploadToOss } from '@/api/materials/material.api'
import { MediaPreview } from '@/components/common/MediaPreview'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'
import { MediaDetailSidebar } from '../MediaDetailSidebar'
import { StudioSelect } from './StudioSelect'
import { useStudioModelsAndLibrary } from './useStudioModelsAndLibrary'

interface HistoryNode {
  id: string
  parentId: string | null
  step: number
  label: string
  url: string
  rawUrl?: string
  mediaId?: string
}

interface PresetOption {
  label: string
  prompt: string
}

interface RemixDimension {
  id: string
  title: string
  icon: typeof Camera
  accent: string
  badgeColor: string
  primaryLabel: string
  primaryOptions: PresetOption[]
  secondaryLabel?: string
  secondaryOptions?: PresetOption[]
  buildPrompt: (p1: PresetOption, p2?: PresetOption) => string
}

const REMIX_DIMENSIONS: RemixDimension[] = [
  {
    id: 'camera',
    title: '换镜头角度',
    icon: Camera,
    accent: 'border-violet-500/25 bg-violet-500/[0.04]',
    badgeColor: 'text-violet-600 bg-violet-500/12',
    primaryLabel: '景别',
    primaryOptions: [
      { label: '半身构图', prompt: '半身中景构图，主体清晰居中' },
      { label: '近景特写', prompt: '面部与上半身近景特写，突出神态与细节' },
      { label: '全身构图', prompt: '完整全身入画，构图舒展大气' },
      { label: '远景大场面', prompt: '宏大远景环境构图，人物与背景空间呼应' },
    ],
    secondaryLabel: '角度',
    secondaryOptions: [
      { label: '平拍视角', prompt: '自然平视镜头，画面端正真实' },
      { label: '低机位仰拍', prompt: '电影感低机位微仰拍，突出人物气场与修长比例' },
      { label: '高机位俯拍', prompt: '高机位俯视角度，带来独特空间透视感' },
      { label: '侧面轮廓', prompt: '三分之二侧面角度，勾勒精致五官与轮廓线条' },
      { label: '广角张力', prompt: '适度广角镜头透视，增强电影画面层次与空间感' },
    ],
    buildPrompt: (p1, p2) => `保持参考图同一人物的面容、发型与核心特征，切换全新拍摄机位：${p1.prompt}，${p2?.prompt || ''}`,
  },
  {
    id: 'lighting',
    title: '换光影氛围',
    icon: Sun,
    accent: 'border-amber-500/25 bg-amber-500/[0.04]',
    badgeColor: 'text-amber-600 bg-amber-500/12',
    primaryLabel: '光线',
    primaryOptions: [
      { label: '日落黄金逆光', prompt: '温暖的黄昏日落金色逆光，发丝泛起柔和金边光晕' },
      { label: '清透自然日光', prompt: '明亮通透的清晨自然光线，肤色干净通透有呼吸感' },
      { label: '赛博霓虹夜光', prompt: '冷蓝与品红交织的都市霓虹夜景光线，氛围浓郁' },
      { label: '电影冷暖对比', prompt: '电影级冷暖双色体积光，明暗立体层次丰富' },
      { label: '高级棚拍柔光', prompt: '专业时尚影棚柔和主光与轮廓光，质感高级干净' },
    ],
    buildPrompt: p1 => `保持参考图人物与主体构图一致，重塑整体光线氛围为：${p1.prompt}`,
  },
  {
    id: 'scene',
    title: '换背景场景',
    icon: Sparkles,
    accent: 'border-sky-500/25 bg-sky-500/[0.04]',
    badgeColor: 'text-sky-600 bg-sky-500/12',
    primaryLabel: '场景',
    primaryOptions: [
      { label: '雨夜霓虹街头', prompt: '细雨微湿的现代都市霓虹夜景街道，地面水洼倒映绚丽灯光' },
      { label: '极简纯色影棚', prompt: '干净高级的极简浅灰纯色摄影棚背景，突出主体人物' },
      { label: '阳光咖啡馆', prompt: '午后洒满阳光的文艺木质咖啡馆窗边，温暖治愈氛围' },
      { label: '浪漫海边日落', prompt: '微风轻拂的晚霞海滩与闪耀海面，氛围浪漫开阔' },
      { label: '古风山水庭院', prompt: '意境悠远的东方古风亭台楼阁与薄雾花木背景' },
      { label: '未来科幻空间', prompt: '极具未来感的洁净科幻都市天台与流光建筑背景' },
    ],
    buildPrompt: p1 => `保持参考图同一人物外貌与风格一致，将背景自然替换为：${p1.prompt}，人物与新环境光影自然融合`,
  },
  {
    id: 'style',
    title: '换画风质感',
    icon: Palette,
    accent: 'border-pink-500/25 bg-pink-500/[0.04]',
    badgeColor: 'text-pink-600 bg-pink-500/12',
    primaryLabel: '风格',
    primaryOptions: [
      { label: '精绘厚涂动漫', prompt: '大师级日系二次元厚涂插画，发丝与布料细节精致华丽' },
      { label: '电影实拍写实', prompt: '超真实电影级真人摄影质感，自然皮肤纹理与浅景深虚化' },
      { label: '3D 盲盒手办', prompt: '精致可爱的 3D 盲盒公仔渲染风格，细腻磨砂与柔和光泽' },
      { label: '清新水彩手绘', prompt: '轻盈通透的手绘水彩插画质感，柔和笔触与晕染色彩' },
      { label: '复古胶片摄影', prompt: '90 年代经典胶片相机色调，柔和对比度与细腻胶片颗粒' },
    ],
    buildPrompt: p1 => `保留参考图人物特征与构图内容，将整体视觉风格重绘为：${p1.prompt}`,
  },
  {
    id: 'outfit',
    title: '换穿搭造型',
    icon: Shirt,
    accent: 'border-emerald-500/25 bg-emerald-500/[0.04]',
    badgeColor: 'text-emerald-600 bg-emerald-500/12',
    primaryLabel: '穿搭',
    primaryOptions: [
      { label: '高定机能风', prompt: '利落帅气的高定暗黑机能风外套与精致金属配饰' },
      { label: '极简日常通勤', prompt: '高级感极简都市针织衫与风衣日常穿搭，清爽耐看' },
      { label: '华丽暗夜礼服', prompt: '优雅华丽的暗色系轻纱礼服与精致首饰造型' },
      { label: '街头潮酷卫衣', prompt: '宽松有型的潮流连帽卫衣与街头时尚单品搭配' },
      { label: '新中式国风', prompt: '现代剪裁融合东方刺绣盘扣的新中式气质穿搭' },
    ],
    buildPrompt: p1 => `保持参考图同一人物的面容、发型与气质一致，为其更换全新穿搭造型：${p1.prompt}`,
  },
  {
    id: 'expression',
    title: '换表情动作',
    icon: Smile,
    accent: 'border-purple-500/25 bg-purple-500/[0.04]',
    badgeColor: 'text-purple-600 bg-purple-500/12',
    primaryLabel: '状态',
    primaryOptions: [
      { label: '自信微笑看镜头', prompt: '自然自信地微笑直视镜头，眼神灵动有感染力' },
      { label: '冷酷侧眸回望', prompt: '微微侧身回眸望向镜头，神情清冷酷飒' },
      { label: '元气开怀大笑', prompt: '灿烂开朗的笑容与轻松俏皮的手势动作，活力满满' },
      { label: '温柔低头浅笑', prompt: '微微低头浅笑，神态安静温柔，极具故事氛围' },
      { label: '动感跃动抓拍', prompt: '迈步转身或扬手瞬间的自然动态抓拍，衣摆发丝飘逸' },
    ],
    buildPrompt: p1 => `保持参考图同一人物的面容、穿搭与画风一致，调整人物表情与肢体动作：${p1.prompt}`,
  },
]

const STYLE_CHIPS = ['保持人物一致', '电影质感', '高清细节']

function detectClosestAspectRatio(w: number, h: number): string {
  if (!w || !h) return '9:16'
  const r = w / h
  const candidates: Array<{ label: string, val: number }> = [
    { label: '9:16', val: 9 / 16 },
    { label: '3:4', val: 3 / 4 },
    { label: '1:1', val: 1 },
    { label: '4:3', val: 4 / 3 },
    { label: '16:9', val: 16 / 9 },
  ]
  let best = candidates[0]
  let minDiff = Math.abs(r - best.val)
  for (const c of candidates) {
    const diff = Math.abs(r - c.val)
    if (diff < minDiff) {
      minDiff = diff
      best = c
    }
  }
  return best.label
}

export function VisualEvolutionStudio({ groupId }: { groupId: string }) {
  const { catalog, images, refreshLibrary, pollTaskUntilDone } = useStudioModelsAndLibrary(groupId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [imageModel, setImageModel] = useState<string>('dreamina-5.0')
  const [videoModel, setVideoModel] = useState<string>('dreamina-seedance-2.0-fast')
  const [aspectRatio, setAspectRatio] = useState<string>('9:16')
  const [userLockedRatio, setUserLockedRatio] = useState(false)
  const [seedDim, setSeedDim] = useState<{ w: number, h: number } | null>(null)
  const [activeChips, setActiveChips] = useState<string[]>(['保持人物一致', '高清细节'])
  const [uploading, setUploading] = useState(false)

  // Editable per-card presets & custom prompts (user MUST click 生成 explicitly; never auto-fires on card click)
  const [primaryIdxMap, setPrimaryIdxMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(REMIX_DIMENSIONS.map(d => [d.id, 0])),
  )
  const [secondaryIdxMap, setSecondaryIdxMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(REMIX_DIMENSIONS.map(d => [d.id, 0])),
  )
  const [promptMap, setPromptMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      REMIX_DIMENSIONS.map(d => [d.id, d.buildPrompt(d.primaryOptions[0], d.secondaryOptions?.[0])]),
    ),
  )
  const [expandedCardId, setExpandedCardId] = useState<string | null>('camera')

  // History & active reference image
  const [history, setHistory] = useState<HistoryNode[]>([])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({})
  const [cardOutputs, setCardOutputs] = useState<Record<string, HistoryNode>>({})

  // Optional 2-image video transition in history strip
  const [bridgeIds, setBridgeIds] = useState<string[]>([])
  const [bridging, setBridging] = useState(false)
  const [bridgeVideoUrl, setBridgeVideoUrl] = useState<string | null>(null)

  // Lightbox preview
  const [previewItems, setPreviewItems] = useState<MediaPreviewItem[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)

  // Reference deletion with secondary confirmation
  const [deletedMediaIds, setDeletedMediaIds] = useState<string[]>([])
  const [deletingTarget, setDeletingTarget] = useState<{
    id: string
    mediaId?: string
    url: string
    label: string
  } | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const visibleImages = useMemo(
    () => images.filter(img => !deletedMediaIds.includes(img._id)),
    [images, deletedMediaIds],
  )

  useEffect(() => {
    if (catalog.imageModels.length > 0 && !catalog.imageModels.some(m => m.model === imageModel)) {
      setImageModel(catalog.imageModels[0].model)
    }
    if (catalog.videoModels.length > 0 && !catalog.videoModels.some(m => m.name === videoModel)) {
      setVideoModel(catalog.videoModels[0].name)
    }
  }, [catalog, imageModel, videoModel])

  useEffect(() => {
    if (history.length === 0 && visibleImages.length > 0) {
      const first = visibleImages[0]
      const root: HistoryNode = {
        id: `seed:${first._id}`,
        parentId: null,
        step: 0,
        label: '原参考图',
        url: getOssUrl(first.url),
        rawUrl: first.url,
        mediaId: first._id,
      }
      setHistory([root])
      setActiveNodeId(root.id)
    }
  }, [visibleImages, history.length])

  const activeNode = useMemo(
    () => history.find(n => n.id === activeNodeId) ?? history[0] ?? null,
    [history, activeNodeId],
  )

  const handleConfirmDeleteRef = async () => {
    if (!deletingTarget || deletingBusy) return
    setDeletingBusy(true)
    try {
      const target = deletingTarget
      if (target.mediaId) {
        await batchDeleteMedia([target.mediaId])
        setDeletedMediaIds(prev => (prev.includes(target.mediaId!) ? prev : [...prev, target.mediaId!]))
        void refreshLibrary()
      }

      const matchesTarget = (node: HistoryNode) =>
        node.id === target.id
        || (Boolean(target.mediaId) && node.mediaId === target.mediaId)
        || node.url === target.url

      const nextHistory = history.filter(n => !matchesTarget(n))
      setCardOutputs((prev) => {
        const cleaned: Record<string, HistoryNode> = {}
        Object.entries(prev).forEach(([k, v]) => {
          if (!matchesTarget(v)) cleaned[k] = v
        })
        return cleaned
      })
      setBridgeIds(prev => prev.filter(id => nextHistory.some(n => n.id === id)))

      const remainingLibrary = visibleImages.filter(img => img._id !== target.mediaId && getOssUrl(img.url) !== target.url)
      const deletingActive = activeNode ? matchesTarget(activeNode) : false

      if (deletingActive) {
        if (nextHistory.length > 0) {
          setHistory(nextHistory)
          setActiveNodeId(nextHistory[0].id)
        }
        else if (remainingLibrary.length > 0) {
          const fallback = remainingLibrary[0]
          const nextRoot: HistoryNode = {
            id: `seed:${fallback._id}`,
            parentId: null,
            step: 0,
            label: '原参考图',
            url: getOssUrl(fallback.url),
            rawUrl: fallback.url,
            mediaId: fallback._id,
          }
          setHistory([nextRoot])
          setActiveNodeId(nextRoot.id)
        }
        else {
          setHistory([])
          setActiveNodeId(null)
          setSeedDim(null)
        }
        setCardOutputs({})
      }
      else {
        setHistory(nextHistory)
      }

      setDeletingTarget(null)
      toast.success('已删除参考图')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '删除参考图失败')
    }
    finally {
      setDeletingBusy(false)
    }
  }

  const selectSeedFromLibrary = (img: (typeof images)[number]) => {
    const id = `seed:${img._id}`
    setUserLockedRatio(false)
    const existing = history.find(n => n.id === id)
    if (existing) {
      setActiveNodeId(existing.id)
      setCardOutputs({})
      return
    }
    const root: HistoryNode = {
      id,
      parentId: null,
      step: 0,
      label: '原参考图',
      url: getOssUrl(img.url),
      rawUrl: img.url,
      mediaId: img._id,
    }
    setHistory(prev => [root, ...prev.filter(n => n.id !== id)])
    setActiveNodeId(root.id)
    setCardOutputs({})
  }

  const handleUploadSeed = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const path = await uploadToOss(file)
      const root: HistoryNode = {
        id: `upload:${Date.now()}`,
        parentId: null,
        step: 0,
        label: '上传参考图',
        url: getOssUrl(path),
        rawUrl: path,
      }
      setUserLockedRatio(false)
      setHistory(prev => [root, ...prev])
      setActiveNodeId(root.id)
      setCardOutputs({})
      toast.success('已载入新参考图')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    }
    finally {
      setUploading(false)
    }
  }

  const updateDimensionPreset = (dim: RemixDimension, nextP1Idx: number, nextP2Idx?: number) => {
    const p1Idx = nextP1Idx
    const p2Idx = nextP2Idx ?? (secondaryIdxMap[dim.id] ?? 0)
    setPrimaryIdxMap(prev => ({ ...prev, [dim.id]: p1Idx }))
    if (nextP2Idx !== undefined) {
      setSecondaryIdxMap(prev => ({ ...prev, [dim.id]: p2Idx }))
    }
    const p1 = dim.primaryOptions[p1Idx] ?? dim.primaryOptions[0]
    const p2 = dim.secondaryOptions?.[p2Idx]
    setPromptMap(prev => ({ ...prev, [dim.id]: dim.buildPrompt(p1, p2) }))
  }

  const runDimension = async (dim: RemixDimension) => {
    if (!activeNode) {
      toast.warning('请先选择一张参考图')
      return
    }
    if (runningIds[dim.id]) return

    const basePrompt = (promptMap[dim.id] || '').trim()
    if (!basePrompt) {
      toast.warning('请输入或选择要调整的画面描述')
      return
    }

    const extra = activeChips.length > 0 ? `，${activeChips.join('、')}` : ''
    const fullPrompt = `${basePrompt}${extra}`
    const refUrl = activeNode.rawUrl || activeNode.url

    setRunningIds(prev => ({ ...prev, [dim.id]: true }))
    try {
      const res = await apiCreateImageTextDraft({
        quantity: 1,
        groupId,
        prompt: fullPrompt,
        imageModel: imageModel as ImageModelType,
        imageCount: 1,
        aspectRatio,
        imageSize: '2K',
        imageUrls: [refUrl],
        draftType: 'image',
      })
      if (res?.code !== 0) throw new Error(res?.message || '生成任务创建失败')
      const taskId = res.data?.taskIds?.[0]
      if (!taskId) throw new Error('未返回任务 ID')

      const done = await pollTaskUntilDone(taskId)
      if (done.status === 'failed') {
        throw new Error(done.errorMessage || '生成失败')
      }

      const resp = (done.response ?? {}) as Record<string, unknown>
      const outImg = (resp['imageUrls'] as string[] | undefined)?.[0]
      const mediaId = (resp['mediaIds'] as string[] | undefined)?.[0]
      if (!outImg) throw new Error('未返回图片结果')

      const p1Label = dim.primaryOptions[primaryIdxMap[dim.id] ?? 0]?.label || dim.title
      const child: HistoryNode = {
        id: `gen:${dim.id}:${Date.now()}`,
        parentId: activeNode.id,
        step: activeNode.step + 1,
        label: `${dim.title} · ${p1Label}`,
        url: getOssUrl(outImg),
        rawUrl: outImg,
        mediaId,
      }
      setHistory(prev => [...prev, child])
      setCardOutputs(prev => ({ ...prev, [dim.id]: child }))
      toast.success(`「${dim.title}」已生成`)
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    }
    finally {
      setRunningIds(prev => ({ ...prev, [dim.id]: false }))
    }
  }

  const runBatchFour = () => {
    if (!activeNode) {
      toast.warning('请先选择参考图')
      return
    }
    REMIX_DIMENSIONS.slice(0, 4).forEach(dim => { void runDimension(dim) })
  }

  const promoteAsReference = (node: HistoryNode) => {
    setActiveNodeId(node.id)
    setCardOutputs({})
    toast.success(`已设为当前参考图`)
  }

  const toggleBridgeSelect = (id: string) => {
    setBridgeIds((prev) => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const handleBridgeVideo = async () => {
    if (bridgeIds.length !== 2) return
    const first = history.find(n => n.id === bridgeIds[0])
    const last = history.find(n => n.id === bridgeIds[1])
    if (!first || !last) return

    setBridging(true)
    try {
      const res = await apiCreateDraftGeneration({
        quantity: 1,
        groupId,
        model: videoModel as VideoModelType,
        prompt: '从第一张画面平滑自然地过渡演绎到第二张画面，镜头运镜流畅，光影连贯',
        duration: 5,
        resolution: '720p',
        aspectRatio,
        imageUrls: [first.rawUrl || first.url, last.rawUrl || last.url],
        draftType: 'video',
      })
      if (res?.code !== 0) throw new Error(res?.message || '视频任务创建失败')
      const taskId = res.data?.taskIds?.[0]
      if (!taskId) throw new Error('未返回任务 ID')
      const done = await pollTaskUntilDone(taskId)
      if (done.status === 'failed') throw new Error(done.errorMessage || '过渡视频生成失败')
      const videoUrl = ((done.response ?? {}) as Record<string, unknown>)['videoUrl'] as string | undefined
      if (videoUrl) {
        setBridgeVideoUrl(getOssUrl(videoUrl))
        toast.success('过渡视频已生成并存入素材库')
      }
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    }
    finally {
      setBridging(false)
    }
  }

  const leftDims = REMIX_DIMENSIONS.slice(0, 3)
  const rightDims = REMIX_DIMENSIONS.slice(3, 6)

  const renderDimensionCard = (dim: RemixDimension) => {
    const Icon = dim.icon
    const isRunning = Boolean(runningIds[dim.id])
    const output = cardOutputs[dim.id]
    const isExpanded = expandedCardId === dim.id
    const p1Idx = primaryIdxMap[dim.id] ?? 0
    const p2Idx = secondaryIdxMap[dim.id] ?? 0

    return (
      <div
        key={dim.id}
        className={cn(
          'rounded-2xl border p-3 transition-all',
          dim.accent,
          isExpanded ? 'ring-1 ring-primary/35 shadow-sm' : 'hover:border-primary/35',
        )}
      >
        {/* 卡片头部：通俗名称 + 参考下拉选择器 + 展开提示词按钮 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', dim.badgeColor)}>
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <span className="truncate text-xs font-semibold text-foreground">{dim.title}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpandedCardId(isExpanded ? null : dim.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              提示词
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2.5 text-[11px]"
              disabled={isRunning || !activeNode}
              onClick={() => void runDimension(dim)}
            >
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
              {isRunning ? '生成中' : '生成'}
            </Button>
          </div>
        </div>

        {/* 参考选项下拉行（自定义自然下滑菜单，绝不遮挡按钮，左右间距对称） */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0 font-medium">{dim.primaryLabel}</span>
            <StudioSelect
              className="min-w-0 flex-1"
              triggerClassName="h-8 text-xs"
              value={String(p1Idx)}
              options={dim.primaryOptions.map((opt, idx) => ({ value: String(idx), label: opt.label }))}
              onChange={val => updateDimensionPreset(dim, Number(val))}
            />
          </div>

          {dim.secondaryOptions && dim.secondaryLabel && (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="shrink-0 font-medium">{dim.secondaryLabel}</span>
              <StudioSelect
                className="min-w-0 flex-1"
                triggerClassName="h-8 text-xs"
                value={String(p2Idx)}
                options={dim.secondaryOptions.map((opt, idx) => ({ value: String(idx), label: opt.label }))}
                onChange={val => updateDimensionPreset(dim, p1Idx, Number(val))}
              />
            </div>
          )}
        </div>

        {/* 可编辑提示词区（展开即可自由修改） */}
        {isExpanded && (
          <div className="mt-2">
            <textarea
              rows={2}
              value={promptMap[dim.id] || ''}
              onChange={e => setPromptMap(prev => ({ ...prev, [dim.id]: e.target.value }))}
              placeholder="可自由修改或补充画面要求…"
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground outline-none focus:border-primary"
            />
          </div>
        )}

        {/* 生成结果预览（严格 h-full w-full object-contain，绝不拉伸压缩变形！） */}
        {output && (
          <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2.5">
            <div className="relative h-44 w-full overflow-hidden rounded-xl border border-border/70 bg-muted/60 dark:bg-zinc-950/60 p-1">
              <img
                src={output.url}
                alt={output.label}
                className="h-full w-full object-contain"
              />
              <button
                type="button"
                title="查看大图"
                onClick={() => {
                  setPreviewItems([{
                    type: 'image',
                    src: output.url,
                    title: output.label,
                    mediaId: output.mediaId,
                    rawUrl: output.rawUrl,
                  }])
                  setPreviewOpen(true)
                }}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-7 flex-1 gap-1 text-[11px]"
                onClick={() => promoteAsReference(output)}
              >
                <Layers className="h-3 w-3" />
                设为当前参考图
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2.5 text-[11px]"
                disabled={isRunning}
                onClick={() => void runDimension(dim)}
              >
                <RefreshCw className="h-3 w-3" />
                重生成
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadSeed} />

      {/* 顶部简洁控制条（模型、生成比例、当前参考图真实尺寸数据、风格开关） */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <StudioSelect
            className="w-[180px]"
            menuMinWidth={200}
            value={imageModel}
            options={
              catalog.imageModels.length > 0
                ? catalog.imageModels.map(m => ({ value: m.model, label: m.displayName || m.model }))
                : [{ value: imageModel, label: imageModel === 'dreamina-5.0' ? '即梦 5.0 Lite (CLI)' : imageModel }]
            }
            onChange={setImageModel}
          />

          <StudioSelect
            className="w-[82px]"
            value={aspectRatio}
            options={['9:16', '3:4', '1:1', '16:9', '4:3'].map(r => ({ value: r, label: r }))}
            onChange={(val) => { setAspectRatio(val); setUserLockedRatio(true) }}
          />

          {seedDim && (
            <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-muted/45 px-2.5 text-[11px] font-medium text-muted-foreground">
              <span>原图</span>
              <span className="font-semibold text-foreground tabular-nums">{seedDim.w}×{seedDim.h}</span>
              <span>·</span>
              <span className="text-primary font-semibold">{detectClosestAspectRatio(seedDim.w, seedDim.h)}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {STYLE_CHIPS.map((chip) => {
              const on = activeChips.includes(chip)
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveChips(prev => (on ? prev.filter(x => x !== chip) : [...prev, chip]))}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                    on
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {chip}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            上传参考图
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={!activeNode} onClick={runBatchFour}>
            <Zap className="h-3.5 w-3.5" />
            批量生成 4 张
          </Button>
        </div>
      </div>

      {/* 素材库快选参考图（支持悬停删除并弹出二次确认） */}
      {visibleImages.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border/80 bg-card/80 px-3 py-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">选参考图：</span>
          {visibleImages.slice(0, 14).map((img) => {
            const url = getOssUrl(img.url)
            const isCurrent = activeNode?.url === url
            return (
              <div key={img._id} className="group/ref relative h-12 w-12 shrink-0">
                <button
                  type="button"
                  onClick={() => selectSeedFromLibrary(img)}
                  className={cn(
                    'h-full w-full overflow-hidden rounded-lg border-2 bg-muted/60 p-0.5 transition-all cursor-pointer',
                    isCurrent ? 'border-primary ring-2 ring-primary/30' : 'border-transparent opacity-85 hover:opacity-100',
                  )}
                >
                  <img src={url} alt="" className="h-full w-full object-contain" />
                </button>
                <button
                  type="button"
                  title="删除该参考图"
                  aria-label="删除参考图"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingTarget({
                      id: `seed:${img._id}`,
                      mediaId: img._id,
                      url,
                      label: img.title || '参考图',
                    })
                  }}
                  className="absolute -right-1 -top-1 z-10 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-zinc-900/80 text-white opacity-0 shadow-xs transition-all group-hover/ref:opacity-100 hover:bg-destructive cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 核心三栏二创舞台：左 3 项 | 中间完整原图（无多余标题、无截断、无两侧白边） | 右 3 项 */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-4 lg:items-center',
          seedDim && seedDim.w > seedDim.h * 1.15
            ? 'lg:grid-cols-[minmax(280px,1fr)_minmax(360px,480px)_minmax(280px,1fr)]'
            : 'lg:grid-cols-[1fr_minmax(260px,340px)_1fr]',
        )}
      >
        <div className="grid gap-3">
          {leftDims.map(renderDimensionCard)}
        </div>

        {/* 中心原图（直接按原比例完整呈现，绝无多余标题和顶部留白截断） */}
        <div className="flex items-center justify-center">
          {activeNode ? (
            <div className="group relative inline-flex max-w-full overflow-hidden rounded-2xl ring-2 ring-primary/35 shadow-lg">
              <img
                src={activeNode.url}
                alt={activeNode.label}
                onLoad={(e) => {
                  const nw = e.currentTarget.naturalWidth
                  const nh = e.currentTarget.naturalHeight
                  if (nw > 0 && nh > 0) {
                    setSeedDim({ w: nw, h: nh })
                    if (!userLockedRatio) {
                      setAspectRatio(detectClosestAspectRatio(nw, nh))
                    }
                  }
                }}
                className="block max-h-[540px] max-w-full w-auto h-auto"
              />
              <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="删除当前参考图"
                  aria-label="删除当前参考图"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-destructive cursor-pointer"
                  onClick={() => {
                    setDeletingTarget({
                      id: activeNode.id,
                      mediaId: activeNode.mediaId,
                      url: activeNode.url,
                      label: activeNode.label,
                    })
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="查看大图"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  onClick={() => {
                    setPreviewItems([{
                      type: 'image',
                      src: activeNode.url,
                      title: activeNode.label,
                      mediaId: activeNode.mediaId,
                      rawUrl: activeNode.rawUrl,
                    }])
                    setPreviewOpen(true)
                  }}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-[380px] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-primary/35 bg-primary/[0.03] p-6 text-center hover:border-primary cursor-pointer"
            >
              <ImageIcon className="h-9 w-9 text-primary/70" />
              <span className="text-sm font-semibold text-foreground">点击上传参考图</span>
            </button>
          )}
        </div>

        <div className="grid gap-3">
          {rightDims.map(renderDimensionCard)}
        </div>
      </div>

      {/* 底部历史版本记录（支持回切换参考图 / 勾选 2 张合成过渡视频） */}
      <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold">历史版本</h3>
          </div>
          <div className="flex items-center gap-2">
            <StudioSelect
              className="w-[190px]"
              triggerClassName="h-7.5 text-xs"
              value={videoModel}
              options={
                catalog.videoModels.length > 0
                  ? catalog.videoModels.map(v => ({ value: v.name, label: v.description || v.name }))
                  : [{ value: videoModel, label: videoModel }]
              }
              onChange={setVideoModel}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7.5 gap-1.5 text-xs"
              disabled={bridgeIds.length !== 2 || bridging}
              onClick={() => void handleBridgeVideo()}
            >
              {bridging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              {bridging ? '合成中…' : `选 2 张转视频 (${bridgeIds.length}/2)`}
            </Button>
          </div>
        </div>

        <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
          {history.map((node) => {
            const isActive = node.id === activeNode?.id
            const bridgeIdx = bridgeIds.indexOf(node.id)
            return (
              <div
                key={node.id}
                className={cn(
                  'relative flex w-28 shrink-0 flex-col overflow-hidden rounded-xl border bg-background transition-all',
                  isActive ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-primary/40',
                )}
              >
                <button
                  type="button"
                  title="勾选合成首尾帧视频"
                  onClick={() => toggleBridgeSelect(node.id)}
                  className={cn(
                    'absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold cursor-pointer',
                    bridgeIdx !== -1
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-white/70 bg-black/45 text-white hover:bg-black/70',
                  )}
                >
                  {bridgeIdx !== -1 ? (bridgeIdx === 0 ? '首' : '尾') : <Check className="h-3 w-3 opacity-60" />}
                </button>

                <div className="cursor-pointer" onClick={() => promoteAsReference(node)}>
                  <div className="h-28 w-full bg-muted/50 dark:bg-zinc-950/50 p-1">
                    <img src={node.url} alt={node.label} className="h-full w-full object-contain" />
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-[11px] font-medium text-foreground">{node.label}</div>
                  </div>
                </div>
              </div>
            )
          })}
          {history.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">暂无历史记录</p>
          )}
        </div>

        {bridgeVideoUrl && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.05] p-2.5">
            <video src={bridgeVideoUrl} controls className="h-28 rounded-lg bg-black" />
            <span className="text-xs font-semibold text-foreground">过渡视频已生成并保存至素材库</span>
          </div>
        )}
      </div>

      {/* 删除参考图二次确认弹窗 */}
      {deletingTarget && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => !deletingBusy && setDeletingTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h4 className="text-sm font-semibold text-foreground">确认删除该参考图？</h4>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {deletingTarget.mediaId
                    ? '删除后将同步从当前素材库移除，且无法恢复。'
                    : '删除后将从当前参考图列表中移除。'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/35 p-2.5">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-background p-0.5">
                <img src={deletingTarget.url} alt={deletingTarget.label} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{deletingTarget.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {deletingTarget.mediaId ? '来自素材库' : '临时上传参考图'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8.5 px-4 text-xs"
                disabled={deletingBusy}
                onClick={() => setDeletingTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8.5 gap-1.5 px-4 text-xs"
                disabled={deletingBusy}
                onClick={() => void handleConfirmDeleteRef()}
              >
                {deletingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deletingBusy ? '删除中…' : '确认删除'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <MediaPreview
        open={previewOpen}
        items={previewItems}
        onClose={() => setPreviewOpen(false)}
        renderSidebar={item => <MediaDetailSidebar item={item} groupId={groupId} onClosePreview={() => setPreviewOpen(false)} />}
      />
    </div>
  )
}
