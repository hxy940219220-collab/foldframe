'use client'

import type { CropResult, NormalizedRect } from './ImageCropModal'
import type { ImageModelType } from '@/api/ai/ai.types'
import {
  BadgeCheck,
  BatteryFull,
  Bookmark,
  Bot,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Crop,
  Expand,
  Film,
  FolderOpen,
  Hash,
  Heart,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsUp,
  Upload,
  WandSparkles,
  Wifi,
  X,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  apiCreateImageTextDraft,
  apiDraftTextAssist,
} from '@/api/ai/ai.api'
import { apiCreateMaterial, apiGetDraftInfo, uploadToOss } from '@/api/materials/material.api'
import { PubType } from '@/app/config/publishConfig'
import { getDraftPlatformMeta, SCHEDULE_DRAFT_STORAGE_KEY } from '@/components/PublishDialog/draftSchedule.util'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'
import { ImageCropModal } from './ImageCropModal'
import { StudioSelect } from './StudioSelect'
import { TextModelPicker } from '../TextModelPicker'
import { useStudioModelsAndLibrary } from './useStudioModelsAndLibrary'

type PublishKind = 'image' | 'video'
type PreviewPlatform = 'xhs' | 'douyin' | 'bilibili' | 'twitter' | 'instagram' | 'youtube' | 'wxSph'
type PhonePreviewTab = 'post' | 'cover'

interface RatioOption {
  id: string
  label: string
  ratioValue: number | null
  aspectClass?: string
}

interface SlideAsset {
  type: 'image' | 'video'
  url: string
  rawUrl: string
  originalUrl: string
  originalRawUrl: string
  naturalW?: number
  naturalH?: number
  cropBox?: NormalizedRect | null
  fitMode?: 'cover' | 'contain'
  focalX?: number
  focalY?: number
  isCropped?: boolean
}

const PLATFORM_META: Record<PreviewPlatform, {
  label: string
  defaultRatioId: string
  ratios: RatioOption[]
  accountType: string
}> = {
  xhs: {
    label: '小红书',
    defaultRatioId: '3:4',
    ratios: [
      { id: '3:4', label: '3:4', ratioValue: 3 / 4, aspectClass: 'aspect-[3/4]' },
      { id: '1:1', label: '1:1', ratioValue: 1, aspectClass: 'aspect-square' },
      { id: '4:3', label: '4:3', ratioValue: 4 / 3, aspectClass: 'aspect-[4/3]' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'xhs',
  },
  douyin: {
    label: '抖音',
    defaultRatioId: '9:16',
    ratios: [
      { id: '9:16', label: '9:16', ratioValue: 9 / 16, aspectClass: 'aspect-[9/16]' },
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'douyin',
  },
  bilibili: {
    label: 'B站',
    defaultRatioId: '16:9',
    ratios: [
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: '3:4', label: '3:4', ratioValue: 3 / 4, aspectClass: 'aspect-[3/4]' },
      { id: '4:3', label: '4:3', ratioValue: 4 / 3, aspectClass: 'aspect-[4/3]' },
      { id: '1:1', label: '1:1', ratioValue: 1, aspectClass: 'aspect-square' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'bilibili',
  },
  twitter: {
    label: 'X',
    defaultRatioId: '16:9',
    ratios: [
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: '4:3', label: '4:3', ratioValue: 4 / 3, aspectClass: 'aspect-[4/3]' },
      { id: '1:1', label: '1:1', ratioValue: 1, aspectClass: 'aspect-square' },
      { id: '4:5', label: '4:5', ratioValue: 4 / 5, aspectClass: 'aspect-[4/5]' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'twitter',
  },
  instagram: {
    label: 'Instagram',
    defaultRatioId: '4:5',
    ratios: [
      { id: '4:5', label: '4:5', ratioValue: 4 / 5, aspectClass: 'aspect-[4/5]' },
      { id: '1:1', label: '1:1', ratioValue: 1, aspectClass: 'aspect-square' },
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'instagram',
  },
  youtube: {
    label: 'YouTube',
    defaultRatioId: '16:9',
    ratios: [
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: '9:16', label: '9:16', ratioValue: 9 / 16, aspectClass: 'aspect-[9/16]' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'youtube',
  },
  wxSph: {
    label: '视频号',
    defaultRatioId: '9:16',
    ratios: [
      { id: '9:16', label: '9:16', ratioValue: 9 / 16, aspectClass: 'aspect-[9/16]' },
      { id: '3:4', label: '3:4', ratioValue: 3 / 4, aspectClass: 'aspect-[3/4]' },
      { id: '16:9', label: '16:9', ratioValue: 16 / 9, aspectClass: 'aspect-video' },
      { id: 'original', label: '原图', ratioValue: null },
    ],
    accountType: 'wxSph',
  },
}

const REGEN_RATIO_CHOICES = ['3:4', '1:1', '4:3', '9:16', '16:9']

function formatRatioLabel(w?: number, h?: number): string {
  if (!w || !h) return ''
  const r = w / h
  const known: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['4:5', 4 / 5],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
  ]
  for (const [label, val] of known) {
    if (Math.abs(r - val) / val < 0.08) return label
  }
  return `${r.toFixed(2)}:1`
}

export function LivePreviewStudio({ groupId }: { groupId: string }) {
  const { catalog, images, videos, refreshLibrary, pollTaskUntilDone } = useStudioModelsAndLibrary(groupId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const refitPopoverRef = useRef<HTMLDivElement>(null)

  // Strict publish entry separation: 图文发布 (images only) vs 视频发布 (single video only)
  const [publishKind, setPublishKind] = useState<PublishKind>('image')
  const [platform, setPlatform] = useState<PreviewPlatform>('xhs')
  const [phoneTab, setPhoneTab] = useState<PhonePreviewTab>('post')
  const [frameRatioId, setFrameRatioId] = useState<string>('3:4')

  // Isolated media states for image-post vs video-post
  const [imageSlides, setImageSlides] = useState<SlideAsset[]>([])
  const [activeSlideIdx, setActiveSlideIdx] = useState(0)
  const [videoAsset, setVideoAsset] = useState<SlideAsset | null>(null)
  const imageSeededRef = useRef(false)
  const videoSeededRef = useRef(false)

  // Clean popovers & modals
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [refitPopoverOpen, setRefitPopoverOpen] = useState(false)
  const [cropModalOpen, setCropModalOpen] = useState(false)

  // Copywriting fields
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>(['AI创作', '灵感记录'])
  const [tagInput, setTagInput] = useState('')

  // Models & unified ratio-restructure prompt
  const [textModel, setTextModel] = useState<string>('agy:default')
  const [imageModel, setImageModel] = useState<string>('dreamina-5.0')
  const [refitTargetRatio, setRefitTargetRatio] = useState<string>('3:4')
  const [refitPrompt, setRefitPrompt] = useState('')
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)

  // Direct drag-to-pan focal framing (click without drag opens crop modal)
  const panDragRef = useRef<{
    startX: number
    startY: number
    startFX: number
    startFY: number
    moved: boolean
  } | null>(null)
  const [isDraggingFocus, setIsDraggingFocus] = useState(false)

  const platCfg = PLATFORM_META[platform]
  const activeRatioObj = useMemo(
    () => platCfg.ratios.find(r => r.id === frameRatioId) ?? platCfg.ratios[0],
    [platCfg, frameRatioId],
  )

  useEffect(() => {
    setFrameRatioId(PLATFORM_META[platform].defaultRatioId)
  }, [platform])

  useEffect(() => {
    if (activeRatioObj.ratioValue) {
      setRefitTargetRatio(activeRatioObj.id)
    }
    else {
      setRefitTargetRatio(platCfg.defaultRatioId)
    }
  }, [activeRatioObj, platCfg.defaultRatioId])

  useEffect(() => {
    if (catalog.defaultTextModel) setTextModel(catalog.defaultTextModel)
    if (catalog.imageModels.length > 0 && !catalog.imageModels.some(m => m.model === imageModel)) {
      setImageModel(catalog.imageModels[0].model)
    }
  }, [catalog, imageModel])

  const router = useRouter()
  const searchParams = useSearchParams()
  const hydratedDraftIdRef = useRef<string | null>(null)
  const [schedulingPublish, setSchedulingPublish] = useState(false)

  // 支持从「排版草稿箱」点「精修」回到排版工坊继续编辑
  useEffect(() => {
    const draftId = searchParams?.get('draftId')
    if (!draftId || hydratedDraftIdRef.current === draftId) return
    hydratedDraftIdRef.current = draftId

    const loadDraft = async () => {
      try {
        const res = await apiGetDraftInfo(draftId)
        const draft = res?.data
        if (!draft) return

        if (draft.title) setTitle(draft.title)
        if (draft.desc !== undefined) setCaption(draft.desc)
        if (Array.isArray(draft.topics) && draft.topics.length > 0) {
          setHashtags(draft.topics.map(tag => tag.replace(/^#+/, '')))
        }
        if (draft.accountTypes?.[0]) {
          const meta = getDraftPlatformMeta(draft.accountTypes[0])
          setPlatform(meta.composerKey)
        }

        const mediaList = draft.mediaList || []
        const firstVideo = mediaList.find(m => m.type === 'video')
        if (firstVideo) {
          videoSeededRef.current = true
          const fullUrl = getOssUrl(firstVideo.url)
          setPublishKind('video')
          setVideoAsset({
            type: 'video',
            url: fullUrl,
            rawUrl: firstVideo.url,
            originalUrl: fullUrl,
            originalRawUrl: firstVideo.url,
            fitMode: 'contain',
          })
        }
        else {
          const imgList = mediaList.filter(m => m.type === 'img')
          if (imgList.length > 0) {
            imageSeededRef.current = true
            setPublishKind('image')
            setImageSlides(imgList.map((m) => {
              const fullUrl = getOssUrl(m.url)
              return {
                type: 'image' as const,
                url: fullUrl,
                rawUrl: m.url,
                originalUrl: fullUrl,
                originalRawUrl: m.url,
                fitMode: 'cover' as const,
                focalX: 50,
                focalY: 50,
              }
            }))
            setActiveSlideIdx(0)
          }
        }
        toast.info('已载入排版草稿，可直接精修或一键排期发布')
      }
      catch {}
    }
    void loadDraft()
  }, [searchParams])

  // Seed default first image / video once from material library
  useEffect(() => {
    if (!imageSeededRef.current && imageSlides.length === 0 && images.length > 0) {
      imageSeededRef.current = true
      const fullUrl = getOssUrl(images[0].url)
      setImageSlides([{
        type: 'image',
        url: fullUrl,
        rawUrl: images[0].url,
        originalUrl: fullUrl,
        originalRawUrl: images[0].url,
        fitMode: 'cover',
        focalX: 50,
        focalY: 50,
      }])
    }
  }, [images, imageSlides.length])

  useEffect(() => {
    if (!videoSeededRef.current && !videoAsset && videos.length > 0) {
      videoSeededRef.current = true
      const fullUrl = getOssUrl(videos[0].url)
      setVideoAsset({
        type: 'video',
        url: fullUrl,
        rawUrl: videos[0].url,
        originalUrl: fullUrl,
        originalRawUrl: videos[0].url,
        fitMode: 'contain',
      })
    }
  }, [videos, videoAsset])

  // Close popovers on outside click
  useEffect(() => {
    if (!addMenuOpen && !refitPopoverOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false)
      }
      if (refitPopoverOpen && refitPopoverRef.current && !refitPopoverRef.current.contains(target)) {
        const el = e.target as HTMLElement
        if (!el.closest('[role="listbox"]')) {
          setRefitPopoverOpen(false)
        }
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [addMenuOpen, refitPopoverOpen])

  const currentSlide: SlideAsset | null = publishKind === 'video'
    ? videoAsset
    : (imageSlides[activeSlideIdx] ?? null)

  const handleSwitchPublishKind = (next: PublishKind) => {
    if (next === publishKind) return
    setPublishKind(next)
    setAddMenuOpen(false)
    setRefitPopoverOpen(false)
    if (next === 'video' && platform === 'xhs') {
      setPlatform('douyin')
    }
    else if (next === 'image' && platform === 'douyin') {
      setPlatform('xhs')
    }
  }

  const updateCurrentSlide = (patch: Partial<SlideAsset>) => {
    if (publishKind === 'video') {
      setVideoAsset(prev => (prev ? { ...prev, ...patch } : prev))
    }
    else {
      setImageSlides(prev => prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, ...patch } : s)))
    }
  }

  const ratioMismatch = useMemo(() => {
    if (publishKind !== 'image' || !currentSlide || !currentSlide.naturalW || !currentSlide.naturalH) return null
    if (!activeRatioObj.ratioValue) return null
    const actualRatio = currentSlide.naturalW / currentSlide.naturalH
    const targetRatio = activeRatioObj.ratioValue
    const diff = Math.abs(actualRatio / targetRatio - 1)
    if (diff <= 0.12) return null
    return {
      actualLabel: formatRatioLabel(currentSlide.naturalW, currentSlide.naturalH),
      targetLabel: activeRatioObj.id,
    }
  }, [publishKind, currentSlide, activeRatioObj])

  // Drag inside preview image to adjust focal point; plain click opens crop modal
  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (publishKind !== 'image' || !currentSlide || currentSlide.type !== 'image') return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setIsDraggingFocus(true)
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startFX: currentSlide.focalX ?? 50,
      startFY: currentSlide.focalY ?? 50,
      moved: false,
    }
  }

  useEffect(() => {
    if (!isDraggingFocus) return
    const canPan = (currentSlide?.fitMode ?? 'cover') === 'cover' && Boolean(activeRatioObj.ratioValue)
    const onMove = (e: MouseEvent) => {
      const drag = panDragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        drag.moved = true
      }
      if (!canPan || !drag.moved) return
      const nextFX = Math.max(0, Math.min(100, Math.round(drag.startFX - dx * 0.4)))
      const nextFY = Math.max(0, Math.min(100, Math.round(drag.startFY - dy * 0.4)))
      setImageSlides(prev => prev.map((s, idx) => (idx === activeSlideIdx ? { ...s, focalX: nextFX, focalY: nextFY } : s)))
    }
    const onUp = () => {
      const drag = panDragRef.current
      panDragRef.current = null
      setIsDraggingFocus(false)
      if (drag && !drag.moved && currentSlide?.type === 'image') {
        setCropModalOpen(true)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDraggingFocus, activeSlideIdx, currentSlide, activeRatioObj.ratioValue])

  const handleTextAssist = async (mode: 'title' | 'caption' | 'script' | 'hashtags') => {
    const baseTopic = topic.trim() || title.trim() || '高质量视觉创作分享'
    setBusySlot(mode)
    try {
      const res = await apiDraftTextAssist({
        mode,
        topic: baseTopic,
        platform: platCfg.label,
        currentText: mode === 'title' ? title : caption,
        model: textModel,
      })
      if (res?.code !== 0 || !res.data) {
        throw new Error(res?.message || '文本生成失败')
      }
      if (mode === 'title' && res.data.text) {
        setTitle(res.data.text)
        toast.success('已生成标题')
      }
      else if ((mode === 'caption' || mode === 'script') && res.data.text) {
        setCaption(res.data.text)
        toast.success(mode === 'script' ? '已生成脚本' : '已生成正文')
      }
      else if (mode === 'hashtags' && res.data.text) {
        const parsed = res.data.text
          .split(/[\n,，、\s]+/)
          .map(s => s.replace(/^#+/, '').trim())
          .filter(Boolean)
          .slice(0, 8)
        if (parsed.length > 0) {
          setHashtags(parsed)
          toast.success('已推荐标签')
        }
      }
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 生成失败')
    }
    finally {
      setBusySlot(null)
    }
  }

  // Unified Ratio + Prompt Refit action (replaces scattered AI 换图 & mismatch banner)
  const handleRegenerateFitRatio = async () => {
    if (publishKind !== 'image' || !currentSlide || currentSlide.type !== 'image') return
    const targetRatio = refitTargetRatio || (activeRatioObj.ratioValue ? activeRatioObj.id : platCfg.defaultRatioId)
    const promptText = [
      `保持参考图人物特征、画风与光影一致，按 ${targetRatio} 比例重新构图并自然延展边缘，避免主体被裁切`,
      refitPrompt.trim(),
    ].filter(Boolean).join('，')

    setBusySlot('refit')
    try {
      const res = await apiCreateImageTextDraft({
        quantity: 1,
        groupId,
        prompt: promptText,
        imageModel: imageModel as ImageModelType,
        imageCount: 1,
        aspectRatio: targetRatio,
        imageSize: '2K',
        imageUrls: [currentSlide.originalRawUrl],
        draftType: 'image',
      })
      if (res?.code !== 0) throw new Error(res?.message || '比例重构失败')
      const taskId = res.data?.taskIds?.[0]
      if (!taskId) throw new Error('未返回任务 ID')
      const done = await pollTaskUntilDone(taskId)
      if (done.status === 'failed') throw new Error(done.errorMessage || '比例重构失败')
      const imgUrl = (((done.response ?? {}) as Record<string, unknown>)['imageUrls'] as string[] | undefined)?.[0]
      if (!imgUrl) throw new Error('未返回生成图片')
      const fullUrl = getOssUrl(imgUrl)
      updateCurrentSlide({
        url: fullUrl,
        rawUrl: imgUrl,
        originalUrl: fullUrl,
        originalRawUrl: imgUrl,
        cropBox: null,
        isCropped: false,
        focalX: 50,
        focalY: 50,
        naturalW: undefined,
        naturalH: undefined,
      })
      if (platCfg.ratios.some(r => r.id === targetRatio)) {
        setFrameRatioId(targetRatio)
      }
      setRefitPopoverOpen(false)
      toast.success(`已按 ${targetRatio} 比例重构画面`)
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '比例重构失败')
    }
    finally {
      setBusySlot(null)
    }
  }

  const handleApplyCrop = async (result: CropResult) => {
    try {
      const croppedFile = new File([result.blob], `cropped-${Date.now()}.png`, { type: 'image/png' })
      const uploadedPath = await uploadToOss(croppedFile)
      const uploadedUrl = getOssUrl(uploadedPath)
      updateCurrentSlide({
        url: uploadedUrl,
        rawUrl: uploadedPath,
        naturalW: result.width,
        naturalH: result.height,
        cropBox: result.cropBox,
        isCropped: true,
        focalX: 50,
        focalY: 50,
      })
      toast.success(`裁剪已应用 (${result.width}×${result.height})`)
    }
    catch {
      updateCurrentSlide({
        url: result.previewUrl,
        naturalW: result.width,
        naturalH: result.height,
        cropBox: result.cropBox,
        isCropped: true,
        focalX: 50,
        focalY: 50,
      })
    }
  }

  const handleResetCropToOriginal = () => {
    if (!currentSlide) return
    updateCurrentSlide({
      url: currentSlide.originalUrl,
      rawUrl: currentSlide.originalRawUrl,
      cropBox: null,
      isCropped: false,
      focalX: 50,
      focalY: 50,
      naturalW: undefined,
      naturalH: undefined,
    })
    toast.success('已还原原图')
  }

  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isVid = file.type.startsWith('video/')
    if (publishKind === 'image' && isVid) {
      toast.warning('当前为「图文发布」模式，请上传图片或切换至「视频发布」')
      return
    }
    if (publishKind === 'video' && !isVid) {
      toast.warning('当前为「视频发布」模式，请上传视频文件')
      return
    }

    setBusySlot('upload')
    try {
      const path = await uploadToOss(file)
      const fullUrl = getOssUrl(path)
      if (publishKind === 'video') {
        setVideoAsset({
          type: 'video',
          url: fullUrl,
          rawUrl: path,
          originalUrl: fullUrl,
          originalRawUrl: path,
          fitMode: 'contain',
        })
      }
      else {
        if (imageSlides.length >= 18) {
          toast.warning('最多支持添加 18 张图片')
          return
        }
        setImageSlides(prev => [...prev, {
          type: 'image',
          url: fullUrl,
          rawUrl: path,
          originalUrl: fullUrl,
          originalRawUrl: path,
          fitMode: 'cover',
          focalX: 50,
          focalY: 50,
        }])
        setActiveSlideIdx(imageSlides.length)
      }
      toast.success('已添加到发布预览')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    }
    finally {
      setBusySlot(null)
    }
  }

  const handlePickFromLibrary = (item: { url: string, rawUrl: string }) => {
    if (publishKind === 'video') {
      setVideoAsset({
        type: 'video',
        url: item.url,
        rawUrl: item.rawUrl,
        originalUrl: item.url,
        originalRawUrl: item.rawUrl,
        fitMode: 'contain',
      })
      setAssetPickerOpen(false)
      toast.success('已选择视频素材')
    }
    else {
      if (imageSlides.length >= 18) {
        toast.warning('最多支持添加 18 张图片')
        return
      }
      setImageSlides(prev => [...prev, {
        type: 'image',
        url: item.url,
        rawUrl: item.rawUrl,
        originalUrl: item.url,
        originalRawUrl: item.rawUrl,
        fitMode: 'cover',
        focalX: 50,
        focalY: 50,
      }])
      setActiveSlideIdx(imageSlides.length)
      toast.success('已加入发布队列')
    }
  }

  const handleAddTag = () => {
    const clean = tagInput.replace(/^#+/, '').trim()
    if (!clean) return
    if (!hashtags.includes(clean)) setHashtags(prev => [...prev, clean])
    setTagInput('')
  }

  const saveCurrentDraftRecord = async () => {
    if (!title.trim()) {
      toast.warning('请填写标题')
      return null
    }
    const mediaPayload = publishKind === 'video'
      ? (videoAsset ? [{ url: videoAsset.rawUrl, type: 'video' as const }] : [])
      : imageSlides.map(s => ({ url: s.rawUrl, type: 'img' as const }))

    if (mediaPayload.length === 0) {
      toast.warning(publishKind === 'video' ? '请先添加视频素材' : '请先添加至少一张图片')
      return null
    }

    const cover = publishKind === 'image' ? imageSlides[0]?.rawUrl : undefined
    const res = await apiCreateMaterial({
      groupId,
      title: title.trim(),
      desc: caption.trim(),
      topics: hashtags,
      type: publishKind === 'video' ? PubType.VIDEO : PubType.ImageText,
      ...(cover ? { coverUrl: cover } : {}),
      mediaList: mediaPayload,
      accountTypes: [platCfg.accountType],
    })
    if (res?.code !== 0) throw new Error(res?.message || '保存草稿失败')
    await refreshLibrary()

    const createdId = (res?.data as any)?.id || (res?.data as any)?._id || `draft-${Date.now()}`
    return {
      id: String(createdId),
      groupId,
      title: title.trim(),
      desc: caption.trim(),
      topics: hashtags,
      type: publishKind === 'video' ? PubType.VIDEO : PubType.ImageText,
      coverUrl: cover,
      mediaList: mediaPayload.map(m => ({ ...m })),
      status: 0 as const,
      accountTypes: [platCfg.accountType],
      createdAt: new Date().toISOString(),
    }
  }

  const handleSaveAsDraft = async () => {
    setSavingDraft(true)
    try {
      const saved = await saveCurrentDraftRecord()
      if (!saved) return
      toast.success('已存入排版草稿箱，可在发布排期随时一键选用')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '保存草稿失败')
    }
    finally {
      setSavingDraft(false)
    }
  }

  const handleOneClickSchedulePublish = async () => {
    setSchedulingPublish(true)
    try {
      const saved = await saveCurrentDraftRecord()
      if (!saved) return
      try {
        sessionStorage.setItem(SCHEDULE_DRAFT_STORAGE_KEY, JSON.stringify(saved))
      }
      catch {}
      toast.success('已同步到排版草稿箱，正在打开排期发布…')
      router.push(`/accounts?action=scheduleDraft&draftId=${encodeURIComponent(saved.id)}`)
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '保存并跳转排期失败')
    }
    finally {
      setSchedulingPublish(false)
    }
  }

  const imageModelOptions = useMemo(() => (
    catalog.imageModels.length > 0
      ? catalog.imageModels.map(m => ({ value: m.model, label: m.displayName || m.model }))
      : [{ value: imageModel, label: imageModel === 'dreamina-5.0' ? '即梦 5.0 Lite (CLI)' : imageModel }]
  ), [catalog.imageModels, imageModel])

  const isHorizontalFrame = Boolean(
    (activeRatioObj.ratioValue && activeRatioObj.ratioValue > 1.1)
    || (!activeRatioObj.ratioValue && currentSlide?.naturalW && currentSlide?.naturalH && currentSlide.naturalW > currentSlide.naturalH * 1.1),
  )

  const bodyIsScript = publishKind === 'video' || platform === 'douyin'

  return (
    <div className="mx-auto max-w-[1400px]">
      <input
        ref={fileInputRef}
        type="file"
        accept={publishKind === 'video' ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={handleUploadLocalFile}
      />

      {/* 清爽两栏布局：左侧精简素材+文案编辑，右侧适中尺寸手机预览 + 独立竖排比例工具栏 */}
      <div
        className={cn(
          'grid grid-cols-1 gap-6 lg:items-start',
          isHorizontalFrame
            ? 'lg:grid-cols-[minmax(440px,1fr)_480px]'
            : 'lg:grid-cols-[minmax(480px,1fr)_440px]',
        )}
      >
        {/* ================= 左侧：严格区分图文/视频的精简编辑区 ================= */}
        <div className="space-y-4">
          {/* 卡片 1：发布类型入口 + 精简素材编辑条 */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {/* 严格入口区分：图文发布 | 视频发布 */}
                <div className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => handleSwitchPublishKind('image')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                      publishKind === 'image'
                        ? 'bg-card text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-primary" />
                    图文发布
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPublishKind('video')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                      publishKind === 'video'
                        ? 'bg-card text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Film className="h-3.5 w-3.5 text-primary" />
                    视频发布
                  </button>
                </div>

                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {publishKind === 'video' ? (videoAsset ? '1/1' : '0/1') : `${imageSlides.length}/18`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {currentSlide?.naturalW && currentSlide?.naturalH && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {currentSlide.naturalW}×{currentSlide.naturalH}
                    {currentSlide.isCropped ? ' · 已裁剪' : ''}
                  </span>
                )}
                {publishKind === 'image' && currentSlide?.isCropped && (
                  <button
                    type="button"
                    onClick={handleResetCropToOriginal}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Expand className="h-3 w-3" />
                    还原原图
                  </button>
                )}
              </div>
            </div>

            {/* 唯一「+」号方框 + 编号素材胶片条 */}
            <div className="flex items-center gap-2.5 overflow-x-visible pb-0.5">
              {/* 唯一的 + 方框：点击选择从本地上传 或 从资产库选择 */}
              <div ref={addMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  disabled={busySlot === 'upload'}
                  onClick={() => setAddMenuOpen(v => !v)}
                  className={cn(
                    'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/30 text-muted-foreground transition-all cursor-pointer',
                    addMenuOpen
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary hover:text-primary',
                  )}
                >
                  {busySlot === 'upload'
                    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    : <Plus className="h-5 w-5" />}
                  <span className="text-[11px] font-medium">
                    {publishKind === 'video' ? (videoAsset ? '替换视频' : '添加视频') : '添加图片'}
                  </span>
                </button>

                {addMenuOpen && (
                  <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-44 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false)
                        fileInputRef.current?.click()
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5 text-primary" />
                      从本地上传
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddMenuOpen(false)
                        setAssetPickerOpen(true)
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                      从资产库选择
                    </button>
                  </div>
                )}
              </div>

              {/* 素材列表（图文显示多张图；视频仅显示单个视频） */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-0.5">
                {publishKind === 'image' ? (
                  imageSlides.map((s, idx) => {
                    const active = idx === activeSlideIdx
                    return (
                      <div
                        key={idx}
                        onClick={() => setActiveSlideIdx(idx)}
                        className={cn(
                          'group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 bg-muted/50 p-0.5 transition-all cursor-pointer',
                          active ? 'border-primary ring-2 ring-primary/25' : 'border-border/80 opacity-85 hover:opacity-100',
                        )}
                      >
                        <img src={s.url} alt="" className="h-full w-full rounded-lg object-contain" />
                        <span className="absolute left-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-black/65 px-1 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setImageSlides(prev => prev.filter((_, i) => i !== idx))
                            setActiveSlideIdx(0)
                          }}
                          className="absolute right-1 top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-destructive cursor-pointer"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )
                  })
                ) : videoAsset ? (
                  <div className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border-2 border-primary bg-black p-0.5 ring-2 ring-primary/25">
                    <video src={videoAsset.url} muted playsInline className="h-full w-full rounded-lg object-contain" />
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      视频
                    </span>
                    <button
                      type="button"
                      onClick={() => setVideoAsset(null)}
                      className="absolute right-1 top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-destructive cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">点击左侧「+」从本地上传或从资产库选择视频</span>
                )}
              </div>
            </div>
          </div>

          {/* 卡片 2：清爽写作卡（标题 + 正文/脚本 + 标签 + 文案模型） */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
            {/* 标题输入行 */}
            <div className="flex items-center gap-3 border-b border-border/70 pb-3">
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="填写标题会有更多赞哦…"
                className="min-w-0 flex-1 bg-transparent text-base font-bold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                disabled={busySlot !== null}
                onClick={() => void handleTextAssist('title')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {busySlot === 'title' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                智能标题
              </button>
            </div>

            {/* 正文 / 脚本输入区 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {bodyIsScript ? '口播脚本 / 字幕' : '正文内容'}
                </span>
                <button
                  type="button"
                  disabled={busySlot !== null}
                  onClick={() => void handleTextAssist(bodyIsScript ? 'script' : 'caption')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-xs hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {busySlot === 'caption' || busySlot === 'script'
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Bot className="h-3 w-3" />}
                  {bodyIsScript ? 'AI 写脚本' : 'AI 写正文'}
                </button>
              </div>
              <textarea
                rows={7}
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={bodyIsScript ? '填写短视频口播文案或分镜…' : '填写正文内容，右侧手机会实时同步呈现排版效果…'}
                className="w-full resize-none rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-primary focus:bg-background"
              />
            </div>

            {/* 话题标签行 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">话题标签</span>
                <button
                  type="button"
                  disabled={busySlot !== null}
                  onClick={() => void handleTextAssist('hashtags')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-xs hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {busySlot === 'hashtags' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Hash className="h-3 w-3" />}
                  AI 荐标签
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-muted/20 px-2.5 py-2">
                {hashtags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground/85"
                  >
                    <span className="text-muted-foreground">#</span>
                    {tag}
                    <button
                      type="button"
                      className="ml-0.5 text-muted-foreground hover:text-destructive cursor-pointer"
                      onClick={() => setHashtags(prev => prev.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="+ 回车添加标签"
                  className="h-6 min-w-[100px] flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* 精简配置行：创作主题 + 文案模型（拿掉散乱的画面微调/生图/视频模型堆砌） */}
            <div className="grid grid-cols-1 gap-3 border-t border-border/70 pt-3.5 sm:grid-cols-[1fr_210px]">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">创作主题 / 卖点</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="输入主题用于 AI 写作与标签推荐…"
                  className="h-8.5 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">文案模型</label>
                <TextModelPicker
                  variant="field"
                  value={textModel}
                  models={catalog.textModels}
                  groups={catalog.textModelGroups}
                  onChange={setTextModel}
                  side="top"
                  align="end"
                  testId="live-preview-text-model"
                />
              </div>
            </div>

            {/* 底部主操作：AI 一键写文案 + 存入草稿箱 + 一键排期发布 */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border/70 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9.5 gap-1.5 rounded-full px-4 text-xs font-medium cursor-pointer"
                disabled={busySlot !== null}
                onClick={async () => {
                  await handleTextAssist('title')
                  await handleTextAssist(bodyIsScript ? 'script' : 'caption')
                  await handleTextAssist('hashtags')
                }}
              >
                {busySlot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                一键生成整篇文案
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="composer-save-draft"
                className="h-9.5 gap-1.5 rounded-full px-5 text-xs font-medium cursor-pointer"
                disabled={savingDraft || schedulingPublish}
                onClick={() => void handleSaveAsDraft()}
              >
                {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5 text-primary" />}
                存入草稿箱
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="composer-oneclick-publish"
                className="h-9.5 gap-1.5 rounded-full px-6 text-xs font-semibold shadow-md cursor-pointer"
                disabled={savingDraft || schedulingPublish}
                onClick={() => void handleOneClickSchedulePublish()}
              >
                {schedulingPublish ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                一键排期发布
              </Button>
            </div>
          </div>
        </div>

        {/* ================= 右侧：精简顶部 + 完整可见仿真手机 + 右侧竖排比例工具栏 ================= */}
        <div className="flex flex-col items-center space-y-3 lg:sticky lg:top-16">
          {/* 顶部平台切换 + 帖子/封面预览 */}
          <div className="flex w-full flex-col gap-2 px-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                data-testid="composer-platform-switcher"
                className="inline-flex flex-wrap items-center gap-0.5 rounded-2xl border border-border bg-card p-0.5 shadow-2xs"
              >
                {(['xhs', 'douyin', 'bilibili', 'twitter', 'instagram', 'youtube', 'wxSph'] as const).map(key => (
                  <button
                    key={key}
                    type="button"
                    data-testid={`composer-platform-${key}`}
                    onClick={() => setPlatform(key)}
                    className={cn(
                      'rounded-xl px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                      platform === key
                        ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {PLATFORM_META[key].label}
                  </button>
                ))}
              </div>

              <div className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setPhoneTab('post')}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                    phoneTab === 'post' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  成片预览
                </button>
                <button
                  type="button"
                  onClick={() => setPhoneTab('cover')}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                    phoneTab === 'cover' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  封面流
                </button>
              </div>
            </div>
          </div>

          {/* 主体横排：[适中比例仿真 iPhone] + [右侧竖排比例与画幅工具栏] */}
          <div className="flex w-full items-start justify-center gap-3">
            {/* 仿真 iPhone 手机框（精准高度控制，一屏完整显示，绝不底部截断） */}
            <div
              className={cn(
                'relative shrink-0 rounded-[40px] bg-zinc-900 p-[9px] shadow-[0_20px_50px_rgb(15_23_42/0.22)] ring-1 ring-white/15 transition-all',
                isHorizontalFrame ? 'w-[388px]' : 'w-[346px]',
              )}
            >
              <div
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-[31px]',
                  (platform === 'douyin' || platform === 'wxSph') && phoneTab === 'post'
                    ? 'bg-[#0b0c10] text-white'
                    : 'bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100',
                )}
              >
                {/* iOS 状态栏 + 灵动岛 */}
                <div className="relative flex h-8 shrink-0 items-center justify-between px-5 pt-0.5 text-[10px] font-semibold">
                  <span>9:41</span>
                  <div className="absolute left-1/2 top-2 h-4 w-20 -translate-x-1/2 rounded-full bg-zinc-950" />
                  <div className="flex items-center gap-1">
                    <Wifi className="h-3 w-3" />
                    <BatteryFull className="h-3.5 w-3.5" />
                  </div>
                </div>

                {phoneTab === 'cover' ? (
                  /* ================= 封面预览（双列发现页瀑布流） ================= */
                  <div className="h-[578px] overflow-y-auto bg-zinc-50 dark:bg-zinc-900/60 p-2.5 space-y-2">
                    <div className="flex items-center justify-center gap-5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <span>关注</span>
                      <span className="border-b-2 border-rose-500 pb-0.5 font-bold text-foreground">发现</span>
                      <span>附近</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="overflow-hidden rounded-xl border border-primary/40 bg-card shadow-xs">
                        <div className={cn('relative w-full overflow-hidden bg-muted/40', activeRatioObj.aspectClass || 'aspect-[3/4]')}>
                          {currentSlide ? (
                            currentSlide.type === 'video' ? (
                              <video src={currentSlide.url} muted playsInline className="h-full w-full object-cover bg-black" />
                            ) : (
                              <img
                                src={currentSlide.url}
                                alt="cover"
                                style={{ objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` }}
                                className={cn('h-full w-full', (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain')}
                              />
                            )
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">待添加封面</div>
                          )}
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
                            我的作品
                          </span>
                        </div>
                        <div className="p-2 space-y-1">
                          <div className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">
                            {title.trim() || '这里将展示你的爆款标题'}
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">P</span>
                              PostPilot
                            </span>
                            <span className="inline-flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" /> 1.2k</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 opacity-65">
                        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                          <div className="aspect-[3/4] bg-gradient-to-br from-slate-200 to-slate-300 dark:from-zinc-800 dark:to-zinc-700" />
                          <div className="p-2 space-y-1">
                            <div className="h-2.5 w-4/5 rounded bg-muted" />
                            <div className="h-2 w-1/2 rounded bg-muted/70" />
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                          <div className="aspect-square bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-700" />
                          <div className="p-2 space-y-1">
                            <div className="h-2.5 w-3/4 rounded bg-muted" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (platform === 'douyin' || platform === 'wxSph') ? (
                  /* ================= 抖音 / 微信视频号 沉浸全屏预览 ================= */
                  <div className="relative flex h-[578px] flex-col justify-between bg-black text-white">
                    <div
                      onMouseDown={handlePreviewMouseDown}
                      className={cn(
                        'group/stage absolute inset-0 select-none',
                        publishKind === 'image' && currentSlide?.type === 'image'
                          ? (isDraggingFocus ? 'cursor-grabbing' : 'cursor-pointer')
                          : '',
                      )}
                    >
                      {currentSlide ? (
                        currentSlide.type === 'video' ? (
                          <video
                            src={currentSlide.url}
                            controls
                            autoPlay
                            loop
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const vw = e.currentTarget.videoWidth
                              const vh = e.currentTarget.videoHeight
                              if (vw && vh && (currentSlide.naturalW !== vw || currentSlide.naturalH !== vh)) {
                                updateCurrentSlide({ naturalW: vw, naturalH: vh })
                              }
                            }}
                            className="h-full w-full object-contain bg-black"
                          />
                        ) : (
                          <img
                            src={currentSlide.url}
                            alt={platform === 'wxSph' ? 'wechat channels' : 'douyin'}
                            draggable={false}
                            onLoad={(e) => {
                              const nw = e.currentTarget.naturalWidth
                              const nh = e.currentTarget.naturalHeight
                              if (nw && nh && (currentSlide.naturalW !== nw || currentSlide.naturalH !== nh)) {
                                updateCurrentSlide({ naturalW: nw, naturalH: nh })
                              }
                            }}
                            style={{ objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` }}
                            className={cn('h-full w-full', (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain')}
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-white/50">
                          {publishKind === 'video' ? '请在左侧添加视频' : '请在左侧添加图片'}
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 flex items-center justify-center gap-4 pt-2 text-[11px] font-semibold drop-shadow">
                      {platform === 'wxSph' ? (
                        <>
                          <span className="opacity-65">关注</span>
                          <span className="opacity-65">朋友</span>
                          <span className="border-b-2 border-emerald-400 pb-0.5">推荐</span>
                        </>
                      ) : (
                        <>
                          <span className="opacity-65">关注</span>
                          <span className="border-b-2 border-white pb-0.5">推荐</span>
                        </>
                      )}
                    </div>

                    <div className="relative z-10 mt-auto flex items-end justify-between bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3.5 pb-4 pt-14 pointer-events-none">
                      <div className="max-w-[78%] space-y-1">
                        <div className="text-xs font-bold">{platform === 'wxSph' ? 'PostPilot 创作者 · 视频号' : '@PostPilot 创作者'}</div>
                        <div className="text-[11px] font-semibold leading-snug">{title.trim() || '短视频标题预览'}</div>
                        <div className="line-clamp-2 text-[10px] leading-relaxed text-white/85">
                          {caption.trim() || '短视频文案预览…'}
                        </div>
                        {hashtags.length > 0 && (
                          <div className={cn('flex flex-wrap gap-1 text-[10px] font-medium', platform === 'wxSph' ? 'text-emerald-300' : 'text-amber-300')}>
                            {hashtags.map((t, i) => <span key={i}>#{t}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-3 text-[9px]">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold', platform === 'wxSph' ? 'bg-emerald-600' : 'bg-primary')}>P</div>
                        <div className="flex flex-col items-center gap-0.5"><Heart className={cn('h-5 w-5', platform === 'wxSph' ? 'fill-amber-400 text-amber-400' : 'fill-rose-500 text-rose-500')} />1.2w</div>
                        <div className="flex flex-col items-center gap-0.5"><MessageCircle className="h-5 w-5" />326</div>
                        <div className="flex flex-col items-center gap-0.5"><Star className="h-5 w-5" />1.8k</div>
                        <div className="flex flex-col items-center gap-0.5"><Share2 className="h-4.5 w-4.5" />转发</div>
                      </div>
                    </div>
                  </div>
                ) : platform === 'twitter' ? (
                  /* ================= X (Twitter) 原生信息流高保真预览 ================= */
                  <div className="flex h-[578px] flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                    {/* X 顶部栏 */}
                    <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2">
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-bold tracking-tight">帖子</span>
                      <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-semibold text-white dark:bg-white dark:text-zinc-900">
                        X
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
                      {/* 作者头 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                            P
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-xs font-bold leading-tight">
                              <span>PostPilot Studio</span>
                              <BadgeCheck className="h-3.5 w-3.5 fill-[#1D9BF0] text-white" />
                            </div>
                            <div className="text-[10.5px] text-muted-foreground">@PostPilot_AI</div>
                          </div>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </div>

                      {/* 推文正文与话题 */}
                      <div className="space-y-1.5 text-[12.5px] leading-relaxed">
                        {title.trim() && <div className="font-semibold">{title.trim()}</div>}
                        <div className="whitespace-pre-line text-foreground/90 line-clamp-5">
                          {caption.trim() || <span className="text-muted-foreground/55">在左侧输入推文文案，支持自动适配 X 语感与话题标签…</span>}
                        </div>
                        {hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {hashtags.slice(0, 6).map((tag, idx) => (
                              <span key={idx} className="text-[11.5px] font-medium text-[#1D9BF0]">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* X 圆角媒体卡片 */}
                      <div
                        onMouseDown={handlePreviewMouseDown}
                        className={cn(
                          'group/stage relative w-full overflow-hidden rounded-2xl border border-border/70 bg-zinc-100 dark:bg-zinc-900 select-none',
                          activeRatioObj.aspectClass
                            ? cn(activeRatioObj.aspectClass, 'max-h-[270px]')
                            : 'h-[210px]',
                          publishKind === 'image' && currentSlide?.type === 'image'
                            ? (isDraggingFocus ? 'cursor-grabbing' : 'cursor-pointer')
                            : '',
                        )}
                      >
                        {currentSlide ? (
                          currentSlide.type === 'video' ? (
                            <video src={currentSlide.url} controls autoPlay loop muted playsInline className="h-full w-full bg-black object-contain" />
                          ) : (
                            <img
                              src={currentSlide.url}
                              alt="x post media"
                              draggable={false}
                              style={activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? { objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` } : undefined}
                              className={cn('h-full w-full', activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain')}
                            />
                          )
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">待添加配图或视频</div>
                        )}
                        {publishKind === 'image' && imageSlides.length > 1 && (
                          <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                            {activeSlideIdx + 1}/{imageSlides.length}
                          </span>
                        )}
                      </div>

                      {/* 时间戳与字数提示 */}
                      <div className="flex items-center justify-between border-b border-border/60 pb-2 text-[10.5px] text-muted-foreground">
                        <span>上午 9:41 · PostPilot Web</span>
                        <span className="tabular-nums font-medium">{(title + caption).length} / 280 字</span>
                      </div>

                      {/* X 原生互动栏 */}
                      <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> 42</span>
                        <span className="inline-flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> 128</span>
                        <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> 1.4K</span>
                        <span className="inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> 316</span>
                        <Share2 className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                ) : platform === 'bilibili' ? (
                  /* ================= B站 (Bilibili) 视频/动态高保真预览 ================= */
                  <div className="flex h-[578px] flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                    {/* B站 播放器 / 封面区 */}
                    <div
                      onMouseDown={handlePreviewMouseDown}
                      className={cn(
                        'group/stage relative w-full overflow-hidden bg-zinc-950 select-none',
                        activeRatioObj.aspectClass
                          ? cn(activeRatioObj.aspectClass, 'max-h-[260px]')
                          : 'h-[205px]',
                        publishKind === 'image' && currentSlide?.type === 'image'
                          ? (isDraggingFocus ? 'cursor-grabbing' : 'cursor-pointer')
                          : '',
                      )}
                    >
                      {currentSlide ? (
                        currentSlide.type === 'video' ? (
                          <video src={currentSlide.url} controls autoPlay loop muted playsInline className="h-full w-full bg-black object-contain" />
                        ) : (
                          <img
                            src={currentSlide.url}
                            alt="bilibili cover"
                            draggable={false}
                            style={activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? { objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` } : undefined}
                            className={cn('h-full w-full', activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain')}
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-white/60">待添加 B站 封面或视频</div>
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded bg-[#FB7299] px-1.5 py-0.5 text-[9.5px] font-bold text-white shadow">
                        bilibili
                      </span>
                      <span className="absolute bottom-2 right-2.5 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[9.5px] text-white backdrop-blur">
                        <Play className="h-2.5 w-2.5 fill-white" /> 2.4万播放 · 186弹幕
                      </span>
                    </div>

                    {/* B站 简介 / 评论 Tab 条 */}
                    <div className="flex items-center gap-6 border-b border-border/60 px-4 py-2 text-[11px] font-semibold">
                      <span className="border-b-2 border-[#FB7299] pb-1 text-[#FB7299]">简介</span>
                      <span className="pb-1 text-muted-foreground">评论 128</span>
                      <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-normal text-muted-foreground">点我发弹幕</span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
                      {/* UP主栏 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FB7299] text-xs font-bold text-white">P</div>
                          <div>
                            <div className="text-xs font-semibold text-foreground">PostPilot 创作者</div>
                            <div className="text-[10px] text-muted-foreground">12.6万粉丝 · 48投稿</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-[#FB7299] px-3 py-1 text-[10.5px] font-semibold text-white">
                          + 关注
                        </span>
                      </div>

                      {/* 标题与简介 */}
                      <div className="space-y-1.5">
                        <div className="text-[13px] font-bold leading-snug line-clamp-2">
                          {title.trim() || <span className="font-normal text-muted-foreground/55">B站高点击标题实时预览…</span>}
                        </div>
                        <div className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line line-clamp-3">
                          {caption.trim() || '视频简介与分P说明会同步显示在这里…'}
                        </div>
                        {hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {hashtags.slice(0, 5).map((tag, idx) => (
                              <span key={idx} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* B站一键三连栏 */}
                      <div className="grid grid-cols-4 gap-2 rounded-xl border border-border/60 bg-muted/30 py-2.5 text-center text-[10px] text-muted-foreground">
                        <div className="flex flex-col items-center gap-1 text-[#FB7299] font-medium">
                          <ThumbsUp className="h-4 w-4" />
                          <span>3.6千</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <CircleDollarSign className="h-4 w-4" />
                          <span>1.2千</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Star className="h-4 w-4" />
                          <span>2.8千</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Share2 className="h-4 w-4" />
                          <span>转发</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : platform === 'youtube' ? (
                  /* ================= YouTube 移动端高保真预览 ================= */
                  <div className="flex h-[578px] flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                    <div
                      onMouseDown={handlePreviewMouseDown}
                      className={cn(
                        'group/stage relative w-full overflow-hidden bg-black select-none',
                        activeRatioObj.aspectClass
                          ? cn(activeRatioObj.aspectClass, 'max-h-[270px]')
                          : 'h-[205px]',
                        publishKind === 'image' && currentSlide?.type === 'image'
                          ? (isDraggingFocus ? 'cursor-grabbing' : 'cursor-pointer')
                          : '',
                      )}
                    >
                      {currentSlide ? (
                        currentSlide.type === 'video' ? (
                          <video src={currentSlide.url} controls autoPlay loop muted playsInline className="h-full w-full bg-black object-contain" />
                        ) : (
                          <img
                            src={currentSlide.url}
                            alt="youtube preview"
                            draggable={false}
                            style={activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? { objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` } : undefined}
                            className={cn('h-full w-full', activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain')}
                          />
                        )
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-white/60">待添加 YouTube 封面或视频</div>
                      )}
                      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[9.5px] font-medium text-white">
                        00:15
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
                      <div className="space-y-1">
                        <div className="text-[13.5px] font-bold leading-snug line-clamp-2">
                          {title.trim() || <span className="font-normal text-muted-foreground/55">YouTube Video Title Preview</span>}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">18K views · Just now</div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">P</div>
                          <div>
                            <div className="text-xs font-semibold">PostPilot Studio</div>
                            <div className="text-[10px] text-muted-foreground">45.2K subscribers</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-zinc-900 px-3 py-1 text-[10.5px] font-semibold text-white dark:bg-white dark:text-zinc-900">
                          Subscribe
                        </span>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto text-[10.5px] font-medium">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><ThumbsUp className="h-3.5 w-3.5" /> 1.6K</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><Share2 className="h-3.5 w-3.5" /> Share</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5"><Bookmark className="h-3.5 w-3.5" /> Save</span>
                      </div>

                      <div className="rounded-xl bg-muted/60 p-2.5 text-[11px] leading-relaxed text-foreground/85 space-y-1">
                        <div className="whitespace-pre-line line-clamp-4">
                          {caption.trim() || '视频简介与时间戳将同步呈现在 YouTube 详情卡片中…'}
                        </div>
                        {hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5 text-[#065FD4]">
                            {hashtags.slice(0, 5).map((tag, idx) => <span key={idx}>#{tag}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ================= 小红书 / Instagram 高保真笔记预览 ================= */
                  <div className="flex flex-col">
                    {/* App 顶部作者栏 */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                      <div className="flex items-center gap-2">
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#14151a] text-[10px] font-bold text-white">
                          P
                        </div>
                        <span className="text-[11px] font-semibold">PostPilot 创作者</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {platform === 'xhs' ? (
                          <>
                            <span className="rounded-full border border-rose-500 px-2 py-0.5 text-[9px] font-semibold text-rose-500">
                              关注
                            </span>
                            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </>
                        ) : (
                          <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* 主图 / 视频预览区：直接拖动调整取景位置，单击直接调出自由裁剪 */}
                    <div
                      onMouseDown={handlePreviewMouseDown}
                      className={cn(
                        'group/stage relative w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900 select-none',
                        activeRatioObj.aspectClass
                          ? cn(activeRatioObj.aspectClass, 'max-h-[404px]')
                          : 'h-[372px]',
                        publishKind === 'image' && currentSlide?.type === 'image'
                          ? (isDraggingFocus ? 'cursor-grabbing' : 'cursor-pointer')
                          : '',
                      )}
                    >
                      {currentSlide ? (
                        currentSlide.type === 'video' ? (
                          <video
                            src={currentSlide.url}
                            controls
                            autoPlay
                            loop
                            muted
                            playsInline
                            onLoadedMetadata={(e) => {
                              const vw = e.currentTarget.videoWidth
                              const vh = e.currentTarget.videoHeight
                              if (vw && vh && (currentSlide.naturalW !== vw || currentSlide.naturalH !== vh)) {
                                updateCurrentSlide({ naturalW: vw, naturalH: vh })
                              }
                            }}
                            className="h-full w-full bg-black object-contain"
                          />
                        ) : (
                          <img
                            src={currentSlide.url}
                            alt="note preview"
                            draggable={false}
                            onLoad={(e) => {
                              const nw = e.currentTarget.naturalWidth
                              const nh = e.currentTarget.naturalHeight
                              if (nw && nh && (currentSlide.naturalW !== nw || currentSlide.naturalH !== nh)) {
                                updateCurrentSlide({ naturalW: nw, naturalH: nh })
                              }
                            }}
                            style={
                              activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover'
                                ? { objectPosition: `${currentSlide.focalX ?? 50}% ${currentSlide.focalY ?? 50}%` }
                                : undefined
                            }
                            className={cn(
                              'h-full w-full',
                              activeRatioObj.aspectClass && (currentSlide.fitMode ?? 'cover') === 'cover' ? 'object-cover' : 'object-contain',
                            )}
                          />
                        )
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                          {publishKind === 'video' ? <Film className="h-8 w-8 opacity-40" /> : <ImageIcon className="h-8 w-8 opacity-40" />}
                          <span className="text-[11px]">
                            {publishKind === 'video' ? '请在左侧点击「+」添加视频' : '请在左侧点击「+」添加图片'}
                          </span>
                        </div>
                      )}

                      {/* 页码角标 */}
                      {publishKind === 'image' && imageSlides.length > 1 && (
                        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                          {activeSlideIdx + 1}/{imageSlides.length}
                        </span>
                      )}

                      {/* 悬停轻提示（平时不遮挡画面，悬停即知支持拖动与点击裁剪） */}
                      {publishKind === 'image' && currentSlide?.type === 'image' && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center opacity-0 transition-opacity group-hover/stage:opacity-100">
                          <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                            拖动微调画面 · 点击自由裁剪
                          </span>
                        </div>
                      )}

                      {/* 多图左右切换 */}
                      {publishKind === 'image' && imageSlides.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveSlideIdx(i => (i - 1 + imageSlides.length) % imageSlides.length)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/stage:opacity-100 hover:bg-black/75 cursor-pointer"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveSlideIdx(i => (i + 1) % imageSlides.length)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/stage:opacity-100 hover:bg-black/75 cursor-pointer"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* 多图圆点指示器 */}
                    {publishKind === 'image' && imageSlides.length > 1 && (
                      <div className="flex items-center justify-center gap-1 pt-1.5">
                        {imageSlides.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveSlideIdx(idx)}
                            className={cn(
                              'h-1.5 rounded-full transition-all cursor-pointer',
                              idx === activeSlideIdx ? 'w-3 bg-rose-500' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700',
                            )}
                          />
                        ))}
                      </div>
                    )}

                    {/* 标题 + 正文 + 标签实时预览 */}
                    <div className="space-y-1 px-3.5 py-2.5 min-h-[100px]">
                      <div className="text-[13px] font-bold leading-snug line-clamp-1">
                        {title.trim() || <span className="font-normal text-muted-foreground/50">帖子标题实时预览</span>}
                      </div>
                      <div className="text-[11px] leading-relaxed text-foreground/85 whitespace-pre-line line-clamp-3">
                        {caption.trim() || <span className="text-muted-foreground/50">正文内容会同步显示在这里…</span>}
                      </div>
                      {hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {hashtags.slice(0, 6).map((tag, idx) => (
                            <span key={idx} className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 底部评论互动栏 */}
                    <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2 text-[10px] text-muted-foreground">
                      <div className="flex-1 rounded-full bg-muted/70 px-2.5 py-1 text-[10px] text-muted-foreground/80">
                        说点什么…
                      </div>
                      <span className="inline-flex items-center gap-0.5"><Heart className="h-3.5 w-3.5" /> 赞</span>
                      <span className="inline-flex items-center gap-0.5"><Bookmark className="h-3.5 w-3.5" /> 藏</span>
                      <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3.5 w-3.5" /> 评</span>
                    </div>
                  </div>
                )}

                {/* iPhone 底部手势横条 */}
                <div className="flex h-4 shrink-0 items-center justify-center">
                  <div className={cn('h-1 w-24 rounded-full', (platform === 'douyin' || platform === 'wxSph') && phoneTab === 'post' ? 'bg-white/40' : 'bg-zinc-900/25 dark:bg-white/25')} />
                </div>
              </div>
            </div>

            {/* ================= 手机右侧竖排比例与画幅工具栏 ================= */}
            <div className="flex w-[64px] shrink-0 flex-col gap-2.5 pt-2">
              {/* 竖排比例切换卡片 */}
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-xs">
                <span className="py-0.5 text-[10px] font-semibold text-muted-foreground">比例</span>
                {platCfg.ratios.map((r) => {
                  const active = frameRatioId === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setFrameRatioId(r.id)}
                      className={cn(
                        'w-full rounded-xl py-1.5 text-[11px] font-medium transition-all cursor-pointer tabular-nums',
                        active
                          ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>

              {/* 竖排画幅与整合比例重构工具（仅图文模式显示） */}
              {publishKind === 'image' && currentSlide?.type === 'image' && (
                <div ref={refitPopoverRef} className="relative flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-xs">
                  {activeRatioObj.ratioValue !== null && (
                    <button
                      type="button"
                      title={(currentSlide.fitMode ?? 'cover') === 'cover' ? '切换为完整显示（不裁切边缘）' : '切换为铺满画幅'}
                      onClick={() => updateCurrentSlide({ fitMode: (currentSlide.fitMode ?? 'cover') === 'cover' ? 'contain' : 'cover' })}
                      className="flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                    >
                      {(currentSlide.fitMode ?? 'cover') === 'cover'
                        ? <Minimize2 className="h-3.5 w-3.5" />
                        : <Maximize2 className="h-3.5 w-3.5" />}
                      <span>{(currentSlide.fitMode ?? 'cover') === 'cover' ? '完整' : '铺满'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    title="自由框选裁剪"
                    onClick={() => setCropModalOpen(true)}
                    className="flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <Crop className="h-3.5 w-3.5" />
                    <span>裁剪</span>
                  </button>

                  {/* 统一整合入口：比例调整 + 重构提示词 */}
                  <button
                    type="button"
                    title="按目标比例重构画面与提示词"
                    onClick={() => setRefitPopoverOpen(v => !v)}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors cursor-pointer',
                      refitPopoverOpen
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    {ratioMismatch && !refitPopoverOpen && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card" />
                    )}
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>调比例</span>
                  </button>

                  {/* 整合后的「比例重构」浮层（比例选择 + 调整提示词 + 模型 + 裁剪/重生成） */}
                  {refitPopoverOpen && (
                    <div className="absolute right-[calc(100%+10px)] bottom-0 z-50 w-72 rounded-2xl border border-border bg-popover p-3.5 shadow-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">比例重构</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRefitPopoverOpen(false)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {ratioMismatch && (
                        <div className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          当前原图 {ratioMismatch.actualLabel}，目标画幅 {ratioMismatch.targetLabel}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">目标比例</span>
                        <div className="grid grid-cols-5 gap-1">
                          {REGEN_RATIO_CHOICES.map(r => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRefitTargetRatio(r)}
                              className={cn(
                                'rounded-lg border py-1 text-[11px] font-medium transition-colors cursor-pointer',
                                refitTargetRatio === r
                                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">调整提示词（可选）</label>
                        <textarea
                          rows={2}
                          value={refitPrompt}
                          onChange={e => setRefitPrompt(e.target.value)}
                          placeholder="如：顶部留白放标题、保持主体完整居中…"
                          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">生图模型</label>
                        <StudioSelect
                          className="w-full"
                          triggerClassName="h-8 text-xs"
                          value={imageModel}
                          options={imageModelOptions}
                          onChange={setImageModel}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-3 text-xs"
                          onClick={() => {
                            setRefitPopoverOpen(false)
                            setCropModalOpen(true)
                          }}
                        >
                          <Crop className="h-3.5 w-3.5" />
                          手动裁剪
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs"
                          disabled={busySlot !== null}
                          onClick={() => void handleRegenerateFitRatio()}
                        >
                          {busySlot === 'refit'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Sparkles className="h-3.5 w-3.5" />}
                          重构 {refitTargetRatio}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 从资产库选择弹窗（按图文/视频严格隔离，不混选） */}
      {assetPickerOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setAssetPickerOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  {publishKind === 'video' ? '从资产库选择视频' : '从资产库选择图片'}
                </h3>
                <span className="text-xs text-muted-foreground">
                  ({publishKind === 'video' ? videos.length : images.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAssetPickerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {publishKind === 'image' ? (
                images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {images.map((img) => {
                      const url = getOssUrl(img.url)
                      const selectedCount = imageSlides.filter(s => s.originalRawUrl === img.url).length
                      return (
                        <button
                          key={img._id}
                          type="button"
                          onClick={() => handlePickFromLibrary({ url, rawUrl: img.url })}
                          className={cn(
                            'group relative aspect-[3/4] overflow-hidden rounded-xl border bg-muted/50 p-1 transition-all cursor-pointer',
                            selectedCount > 0
                              ? 'border-primary ring-2 ring-primary/25'
                              : 'border-border hover:border-primary/60',
                          )}
                        >
                          <img src={url} alt="" className="h-full w-full rounded-lg object-contain" />
                          {selectedCount > 0 && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-muted-foreground">
                    资产库暂无图片素材，请先在「视觉创作」生成或从本地上传
                  </div>
                )
              ) : (
                videos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {videos.map((vid) => {
                      const url = getOssUrl(vid.url)
                      const isSelected = videoAsset?.originalRawUrl === vid.url
                      return (
                        <button
                          key={vid._id}
                          type="button"
                          onClick={() => handlePickFromLibrary({ url, rawUrl: vid.url })}
                          className={cn(
                            'relative aspect-[9/16] overflow-hidden rounded-xl border bg-black p-1 transition-all cursor-pointer',
                            isSelected
                              ? 'border-primary ring-2 ring-primary/25'
                              : 'border-border hover:border-primary/60',
                          )}
                        >
                          <video src={url} muted playsInline className="h-full w-full rounded-lg object-contain" />
                          {isSelected && (
                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="py-16 text-center text-xs text-muted-foreground">
                    资产库暂无视频素材，请先在「视觉创作」生成或从本地上传
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {publishKind === 'image' ? `已选 ${imageSlides.length}/18 张图片` : (videoAsset ? '已选 1 个视频' : '请选择 1 个视频')}
              </span>
              <Button type="button" size="sm" className="h-8 px-4 text-xs" onClick={() => setAssetPickerOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 自由框选裁剪弹窗 */}
      {publishKind === 'image' && currentSlide?.type === 'image' && (
        <ImageCropModal
          open={cropModalOpen}
          imageUrl={currentSlide.originalUrl}
          recommendedRatioLabel={activeRatioObj.ratioValue ? activeRatioObj.id : platCfg.defaultRatioId}
          recommendedRatioValue={activeRatioObj.ratioValue ?? (platCfg.ratios[0].ratioValue ?? 3 / 4)}
          initialCrop={currentSlide.cropBox}
          onClose={() => setCropModalOpen(false)}
          onResetOriginal={handleResetCropToOriginal}
          onApply={handleApplyCrop}
        />
      )}
    </div>
  )
}
