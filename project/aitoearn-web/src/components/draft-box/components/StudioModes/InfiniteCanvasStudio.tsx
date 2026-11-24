'use client'

import type { DraftMediaGenerationMeta } from '@/api/ai/ai.api'
import type { DraftGenerationTask, ImageModelType, SSEMessage, VideoModelType } from '@/api/ai/ai.types'
import type { MediaPreviewItem } from '@/components/common/MediaPreview'
import {
  ArrowUp,
  Check,
  Clock,
  Copy,
  FileText,
  Film,
  FolderOpen,
  Hand,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  Maximize,
  Maximize2,
  Minus,
  MousePointerClick,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  agentApi,
  apiCreateDraftGeneration,
  apiCreateImageTextDraft,
  apiGetDraftGenerationList,
  apiGetDraftMediaMeta,
} from '@/api/ai/ai.api'
import { uploadToOss } from '@/api/materials/material.api'
import { MediaPreview } from '@/components/common/MediaPreview'
import { Button } from '@/components/ui/button'
import { usePlanDetailStore } from '@/store/draft-box/planDetailStore'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'
import type { AgentAttachmentItem, AgentMediaConfig, CanvasAgentMsgItem } from './CanvasAgentDrawer'
import { AgentPrismMark, CanvasAgentDrawer } from './CanvasAgentDrawer'
import { MediaDetailSidebar } from '../MediaDetailSidebar'
import { StudioSelect } from './StudioSelect'
import { TextModelPicker } from '../TextModelPicker'
import { useStudioModelsAndLibrary } from './useStudioModelsAndLibrary'

interface CanvasPos {
  x: number
  y: number
}

interface NodeDimensions {
  natW: number
  natH: number
  tileW: number
  tileH: number
}

interface GeneratorNodeData {
  id: string
  x: number
  y: number
  kind: 'image' | 'video' | 'draft'
  prompt: string
  model: string
  aspectRatio: string
  imageSize: string
  imageCount: number
  duration: number
  sourceNodeIds: string[]
  status: 'idle' | 'running' | 'done' | 'error'
  errorText?: string
}

/** Direct peer-to-peer reference link: image↔image, video↔video, image↔video */
interface PeerLink {
  id: string
  fromId: string
  toId: string
}

type CanvasAgentMsg = CanvasAgentMsgItem

interface DraggingWire {
  sourceId: string
  startX: number
  startY: number
  curX: number
  curY: number
}

interface SpawnMenuState {
  sourceId: string
  canvasX: number
  canvasY: number
  screenX: number
  screenY: number
}

const DEFAULT_TILE_W = 220
const DEFAULT_TILE_H = 260
const GEN_NODE_W = 300
const GEN_NODE_H = 256

const metaCache = new Map<string, DraftMediaGenerationMeta>()

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function computeTileSize(natW: number, natH: number): NodeDimensions {
  if (!natW || !natH) {
    return { natW: 0, natH: 0, tileW: DEFAULT_TILE_W, tileH: DEFAULT_TILE_H }
  }
  const ratio = natW / natH
  let tileW: number
  let tileH: number
  if (ratio >= 1.15) {
    tileW = 300
    tileH = Math.round(clamp(tileW / ratio, 148, 240))
  }
  else if (ratio <= 0.85) {
    tileH = 304
    tileW = Math.round(clamp(tileH * ratio, 168, 236))
  }
  else {
    tileW = 236
    tileH = Math.round(236 / ratio)
  }
  return { natW, natH, tileW, tileH }
}

function formatAspectTag(w?: number, h?: number): string {
  if (!w || !h) return ''
  const r = w / h
  const known: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['3:4', 3 / 4],
    ['4:5', 4 / 5],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
    ['21:9', 21 / 9],
  ]
  for (const [label, val] of known) {
    if (Math.abs(r - val) / val < 0.08) return label
  }
  return `${r.toFixed(2)}:1`
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>)\]]+/g) || []
  return matches.filter(u => /\.(?:png|jpe?g|webp|gif|mp4|mov|webm)(?:\?|$)/i.test(u) || u.includes('/oss/') || u.includes('/minio/'))
}

interface InfiniteCanvasStudioProps {
  groupId: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function InfiniteCanvasStudio({
  groupId,
  isFullscreen = false,
  onToggleFullscreen,
}: InfiniteCanvasStudioProps) {
  const { catalog, images, videos, drafts, refreshLibrary, pollTaskUntilDone } = useStudioModelsAndLibrary(groupId)
  const openDraftDetail = usePlanDetailStore(state => state.openDraftDetailDialog)

  // Pan & Zoom state (smooth, damped, cursor-anchored)
  const [pan, setPan] = useState({ x: 56, y: 68 })
  const [zoom, setZoom] = useState(0.9)
  const [wheelMode, setWheelMode] = useState<'zoom' | 'pan'>('zoom')
  const [isPanning, setIsPanning] = useState(false)
  const panOriginRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ w: 1200, h: 760 })
  const viewportReadyRef = useRef(false)
  const userInteractedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        viewportReadyRef.current = true
        setViewportSize({ w: el.clientWidth, h: el.clientHeight })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const viewRef = useRef({ pan, zoom, wheelMode })
  viewRef.current = { pan, zoom, wheelMode }

  // Node positions, measured natural dimensions, generated nodes & bidirectional peer links
  const storageKey = `foldframe:canvas-pos:v2:${groupId}`
  const [positions, setPositions] = useState<Record<string, CanvasPos>>({})
  const [nodeDims, setNodeDims] = useState<Record<string, NodeDimensions>>({})
  const [genNodes, setGenNodes] = useState<GeneratorNodeData[]>([])
  const [peerLinks, setPeerLinks] = useState<PeerLink[]>([])
  const [outputLinks, setOutputLinks] = useState<Array<{ genId: string, targetNodeId: string }>>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null)

  // Dragging node / dragging wire / quick spawn menu
  const draggingNodeRef = useRef<{ id: string, isGen: boolean, sx: number, sy: number, nx: number, ny: number, moved: boolean } | null>(null)
  const [draggingWire, setDraggingWire] = useState<DraggingWire | null>(null)
  const draggingWireRef = useRef<DraggingWire | null>(null)
  draggingWireRef.current = draggingWire
  const [spawnMenu, setSpawnMenu] = useState<SpawnMenuState | null>(null)

  // Left-side drawer: 'assets' (资产库) or 'history' (生成历史)
  const [leftDrawer, setLeftDrawer] = useState<'assets' | 'history' | null>(null)
  const [assetFilter, setAssetFilter] = useState<'all' | 'image' | 'video' | 'draft'>('all')
  const [historyTasks, setHistoryTasks] = useState<DraftGenerationTask[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Dreamina-style bottom editable composer dock for the selected image/video node
  const [selectedMeta, setSelectedMeta] = useState<DraftMediaGenerationMeta | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [dockMode, setDockMode] = useState<'image' | 'video'>('image')
  const [dockPrompt, setDockPrompt] = useState('')
  const [dockModel, setDockModel] = useState('dreamina-5.0')
  const [dockRatio, setDockRatio] = useState('9:16')
  const [dockQuality, setDockQuality] = useState('2K')
  const [dockCount, setDockCount] = useState(1)
  const [dockDuration, setDockDuration] = useState(5)
  const [dockExtraRefIds, setDockExtraRefIds] = useState<string[]>([])
  const [dockRefPickerOpen, setDockRefPickerOpen] = useState(false)
  const [dockRunning, setDockRunning] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Lightbox preview & upload
  const [previewItems, setPreviewItems] = useState<MediaPreviewItem[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Embedded Agent Chat Drawer (collapsed by default)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentInput, setAgentInput] = useState('')
  const [agentTaskId, setAgentTaskId] = useState<string | undefined>(undefined)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentAttachments, setAgentAttachments] = useState<AgentAttachmentItem[]>([])
  const [agentTextModel, setAgentTextModel] = useState<string>('agy:default')
  const [agentMediaConfig, setAgentMediaConfig] = useState<AgentMediaConfig>({
    activeTab: 'image',
    imageModel: 'auto',
    videoModel: 'auto',
    aspectRatio: 'auto',
    imageQuality: 'auto',
    videoQuality: 'auto',
    videoDuration: 5,
  })
  const [agentMessages, setAgentMessages] = useState<CanvasAgentMsg[]>([])
  const agentAbortRef = useRef<(() => void) | null>(null)
  const agentScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (catalog.defaultTextModel && agentTextModel === 'agy:default') {
      setAgentTextModel(catalog.defaultTextModel)
    }
  }, [catalog.defaultTextModel, agentTextModel])

  // Unified library nodes
  const libraryNodes = useMemo(() => {
    const list: Array<{
      id: string
      kind: 'image' | 'video' | 'draft'
      title: string
      url?: string
      rawUrl?: string
      mediaId?: string
      desc?: string
      topics?: string[]
      createdAt?: string
      draftRaw?: (typeof drafts)[number]
    }> = []

    images.forEach((img) => {
      list.push({
        id: `img:${img._id}`,
        kind: 'image',
        title: img.title || '图片',
        url: getOssUrl(img.url),
        rawUrl: img.url,
        mediaId: img._id,
        createdAt: img.createdAt,
      })
    })

    videos.forEach((vid) => {
      list.push({
        id: `vid:${vid._id}`,
        kind: 'video',
        title: vid.title || '视频',
        url: getOssUrl(vid.url),
        rawUrl: vid.url,
        mediaId: vid._id,
        createdAt: vid.createdAt,
      })
    })

    drafts.forEach((d) => {
      list.push({
        id: `draft:${d.id}`,
        kind: 'draft',
        title: d.title || '文本草稿',
        url: d.coverUrl ? getOssUrl(d.coverUrl) : undefined,
        rawUrl: d.coverUrl,
        desc: d.desc,
        topics: d.topics,
        createdAt: d.createdAt,
        draftRaw: d,
      })
    })
    return list
  }, [images, videos, drafts])

  // Load persisted node positions cleanly (always hydrates stored positions on mount/reload)
  useEffect(() => {
    let stored: Record<string, CanvasPos> = {}
    if (typeof window !== 'undefined') {
      try {
        stored = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
      }
      catch {}
    }

    setPositions((prev) => {
      const next = { ...stored, ...prev }
      let changed = false
      libraryNodes.forEach((node, idx) => {
        if (!next[node.id]) {
          const col = idx % 4
          const row = Math.floor(idx / 4)
          next[node.id] = { x: col * 260, y: row * 340 }
          changed = true
        }
      })
      const hydratedNewKeys = Object.keys(next).some(k => !prev[k])
      if (changed && typeof window !== 'undefined') {
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      }
      return (changed || hydratedNewKeys) ? next : prev
    })
  }, [libraryNodes, storageKey])

  const persistPositions = useCallback((next: Record<string, CanvasPos>) => {
    setPositions(next)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
    }
  }, [storageKey])

  // Load generation history when opening the history drawer
  useEffect(() => {
    if (leftDrawer !== 'history') return
    let active = true
    setHistoryLoading(true)
    apiGetDraftGenerationList(1, 30)
      .then((res) => {
        if (active) setHistoryTasks(res?.data?.list ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => { active = false }
  }, [leftDrawer])

  // Selected node & automatic Dreamina-style dock hydration (prompt, model, ratio, quality, count)
  const selectedNode = useMemo(
    () => libraryNodes.find(n => n.id === selectedNodeId) ?? null,
    [libraryNodes, selectedNodeId],
  )

  useEffect(() => {
    if (!selectedNode || selectedNode.kind === 'draft') {
      setSelectedMeta(null)
      setMetaLoading(false)
      setDockRefPickerOpen(false)
      return
    }

    const defaultMode = selectedNode.kind === 'video' ? 'video' : 'image'
    setDockMode(defaultMode)
    setDockExtraRefIds([])
    setDockRefPickerOpen(false)

    // Pre-sync aspect ratio from measured natural dimensions
    const dims = nodeDims[selectedNode.id]
    if (dims?.natW && dims?.natH) {
      const tag = formatAspectTag(dims.natW, dims.natH)
      if (['9:16', '3:4', '1:1', '4:3', '16:9', '21:9'].includes(tag)) {
        setDockRatio(tag)
      }
    }

    // Default model & quality
    if (defaultMode === 'image') {
      setDockModel(catalog.imageModels[0]?.model || 'dreamina-5.0')
      setDockQuality('2K')
      setDockCount(1)
    }
    else {
      setDockModel(catalog.videoModels[0]?.name || 'dreamina-seedance-2.0-fast')
      setDockQuality('720p')
      setDockDuration(5)
    }

    const cacheKey = selectedNode.mediaId || selectedNode.rawUrl || selectedNode.url || ''
    if (!cacheKey) return

    const applyMeta = (meta: DraftMediaGenerationMeta) => {
      setSelectedMeta(meta)
      setDockPrompt(meta.prompt || '')
      if (meta.aspectRatio && ['9:16', '3:4', '1:1', '4:3', '16:9', '21:9'].includes(meta.aspectRatio)) {
        setDockRatio(meta.aspectRatio)
      }
      if (defaultMode === 'image') {
        if (meta.model && catalog.imageModels.some(m => m.model === meta.model)) {
          setDockModel(meta.model)
        }
        if (meta.imageSize) setDockQuality(meta.imageSize.toUpperCase())
        if (meta.imageCount && meta.imageCount >= 1 && meta.imageCount <= 4) setDockCount(meta.imageCount)
      }
      else {
        if (meta.model && catalog.videoModels.some(m => m.name === meta.model)) {
          setDockModel(meta.model)
        }
        if (meta.resolution) setDockQuality(meta.resolution)
        if (meta.duration) setDockDuration(meta.duration)
      }
    }

    const cached = metaCache.get(cacheKey)
    if (cached) {
      applyMeta(cached)
      setMetaLoading(false)
      return
    }

    let active = true
    setMetaLoading(true)
    setDockPrompt('')
    apiGetDraftMediaMeta({
      mediaId: selectedNode.mediaId,
      url: selectedNode.rawUrl || selectedNode.url,
    })
      .then((res) => {
        if (!active) return
        if (res?.data) {
          metaCache.set(cacheKey, res.data)
          applyMeta(res.data)
        }
        else {
          setSelectedMeta(null)
        }
      })
      .catch(() => {
        if (active) setSelectedMeta(null)
      })
      .finally(() => {
        if (active) setMetaLoading(false)
      })
    return () => { active = false }
  }, [selectedNode, catalog.imageModels, catalog.videoModels, nodeDims])

  // Switch dock mode cleanly between 生图片 / 生视频
  const handleSwitchDockMode = (nextMode: 'image' | 'video') => {
    setDockMode(nextMode)
    if (nextMode === 'image') {
      setDockModel(catalog.imageModels[0]?.model || 'dreamina-5.0')
      setDockQuality('2K')
    }
    else {
      setDockModel(catalog.videoModels[0]?.name || 'dreamina-seedance-2.0-fast')
      setDockQuality('720p')
    }
  }

  // Non-passive native wheel listener: smooth, damped, cursor-anchored
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-canvas-scroll="true"]')) return
      e.preventDefault()

      const { pan: curPan, zoom: curZoom, wheelMode: mode } = viewRef.current
      userInteractedRef.current = true
      const isPinch = e.ctrlKey || e.metaKey
      const isMostlyHorizontal = !isPinch && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.1

      if (!isPinch && (mode === 'pan' || isMostlyHorizontal)) {
        setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
        return
      }

      let rawDy = e.deltaY
      if (e.deltaMode === 1) rawDy *= 18
      else if (e.deltaMode === 2) rawDy *= 120

      const clampedDy = isPinch ? clamp(rawDy, -22, 22) : clamp(rawDy, -44, 44)
      const sensitivity = isPinch ? 0.0042 : 0.0014
      const scaleFactor = Math.exp(-clampedDy * sensitivity)
      const nextZoom = clamp(Math.round(curZoom * scaleFactor * 1000) / 1000, 0.25, 2.5)
      if (Math.abs(nextZoom - curZoom) < 0.0005) return

      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const ratio = nextZoom / curZoom

      setZoom(nextZoom)
      setPan({
        x: Math.round((mouseX - (mouseX - curPan.x) * ratio) * 10) / 10,
        y: Math.round((mouseY - (mouseY - curPan.y) * ratio) * 10) / 10,
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomAroundCenter = useCallback((deltaRatio: number) => {
    userInteractedRef.current = true
    const el = viewportRef.current
    const rect = el?.getBoundingClientRect()
    const cx = rect ? rect.width / 2 : 500
    const cy = rect ? rect.height / 2 : 340
    setZoom((prevZoom) => {
      const nextZoom = clamp(Math.round(prevZoom * deltaRatio * 100) / 100, 0.25, 2.5)
      const ratio = nextZoom / prevZoom
      setPan(prevPan => ({
        x: Math.round((cx - (cx - prevPan.x) * ratio) * 10) / 10,
        y: Math.round((cy - (cy - prevPan.y) * ratio) * 10) / 10,
      }))
      return nextZoom
    })
  }, [])

  const fitCanvasToContent = useCallback(() => {
    const el = viewportRef.current
    if (!el) {
      setPan({ x: 56, y: 56 })
      setZoom(0.9)
      return
    }
    const boxes: Array<{ x: number, y: number, w: number, h: number }> = []
    libraryNodes.forEach((n) => {
      const p = positions[n.id]
      if (!p) return
      const d = nodeDims[n.id]
      boxes.push({ x: p.x, y: p.y, w: d?.tileW ?? DEFAULT_TILE_W, h: d?.tileH ?? DEFAULT_TILE_H })
    })
    genNodes.forEach((g) => {
      boxes.push({ x: g.x, y: g.y, w: GEN_NODE_W, h: GEN_NODE_H })
    })
    if (boxes.length === 0) {
      setPan({ x: 56, y: 56 })
      setZoom(0.9)
      return
    }
    const minX = Math.min(...boxes.map(b => b.x))
    const minY = Math.min(...boxes.map(b => b.y))
    const maxX = Math.max(...boxes.map(b => b.x + b.w))
    const maxY = Math.max(...boxes.map(b => b.y + b.h))
    const contentW = Math.max(200, maxX - minX)
    const contentH = Math.max(200, maxY - minY)
    const rect = el.getBoundingClientRect()
    const padX = 72
    const padTop = 56
    const padBottom = 104
    const availW = Math.max(240, rect.width - padX * 2)
    const availH = Math.max(240, rect.height - padTop - padBottom)
    const nextZoom = clamp(Math.min(availW / contentW, availH / contentH, 1.02), 0.35, 1.02)
    setZoom(Math.round(nextZoom * 100) / 100)
    setPan({
      x: Math.round((rect.width - contentW * nextZoom) / 2 - minX * nextZoom),
      y: Math.round(padTop - minY * nextZoom),
    })
  }, [genNodes, libraryNodes, nodeDims, positions])

  // Auto-center the initial canvas content horizontally (and balanced vertically) until the user manually pans/zooms
  useEffect(() => {
    if (userInteractedRef.current || !viewportReadyRef.current) return
    if (libraryNodes.length === 0 && genNodes.length === 0) return

    const boxes: Array<{ x: number, y: number, w: number, h: number }> = []
    libraryNodes.forEach((n) => {
      const p = positions[n.id]
      if (!p) return
      const d = nodeDims[n.id]
      boxes.push({
        x: p.x,
        y: p.y,
        w: n.kind === 'draft' ? 248 : (d?.tileW ?? DEFAULT_TILE_W),
        h: n.kind === 'draft' ? 200 : (d?.tileH ?? DEFAULT_TILE_H),
      })
    })
    genNodes.forEach((g) => {
      boxes.push({ x: g.x, y: g.y, w: GEN_NODE_W, h: GEN_NODE_H })
    })
    if (boxes.length === 0 || boxes.length < libraryNodes.length) return

    const minX = Math.min(...boxes.map(b => b.x))
    const minY = Math.min(...boxes.map(b => b.y))
    const maxX = Math.max(...boxes.map(b => b.x + b.w))
    const maxY = Math.max(...boxes.map(b => b.y + b.h))
    const contentW = Math.max(200, maxX - minX)
    const contentH = Math.max(200, maxY - minY)

    const availW = Math.max(320, viewportSize.w - 140)
    const nextZoom = clamp(Math.round(Math.min(0.9, availW / contentW) * 100) / 100, 0.45, 0.9)
    const centeredX = Math.round((viewportSize.w - contentW * nextZoom) / 2 - minX * nextZoom)
    const centeredY = contentH * nextZoom <= viewportSize.h - 150
      ? Math.max(48, Math.round((viewportSize.h - 86 - contentH * nextZoom) / 2 - minY * nextZoom))
      : Math.round(48 - minY * nextZoom)

    setZoom(nextZoom)
    setPan({ x: centeredX, y: centeredY })
  }, [genNodes, libraryNodes, nodeDims, positions, viewportSize.h, viewportSize.w])

  const handleAutoArrange = useCallback(() => {
    const next: Record<string, CanvasPos> = {}
    let curX = 0
    let curY = 0
    let rowMaxH = 0
    let colCount = 0
    let maxRowRight = 0
    libraryNodes.forEach((node) => {
      const dims = nodeDims[node.id]
      const w = node.kind === 'draft' ? 248 : (dims?.tileW ?? DEFAULT_TILE_W)
      const h = node.kind === 'draft' ? 220 : (dims?.tileH ?? DEFAULT_TILE_H)
      if (colCount >= 4) {
        curX = 0
        curY += rowMaxH + 34
        rowMaxH = 0
        colCount = 0
      }
      next[node.id] = { x: curX, y: curY }
      maxRowRight = Math.max(maxRowRight, curX + w)
      curX += w + 34
      rowMaxH = Math.max(rowMaxH, h)
      colCount += 1
    })
    const totalH = curY + rowMaxH
    persistPositions(next)
    setGenNodes(prev => prev.map((g, idx) => ({ ...g, x: Math.max(1060, maxRowRight + 60), y: idx * 290 })))
    const vpW = viewportRef.current?.clientWidth || viewportSize.w || 1200
    const vpH = viewportRef.current?.clientHeight || viewportSize.h || 760
    const nextZoom = clamp(Math.round(Math.min(0.88, (vpW - 140) / Math.max(320, maxRowRight)) * 100) / 100, 0.45, 0.88)
    const centeredX = Math.round((vpW - maxRowRight * nextZoom) / 2)
    const centeredY = totalH * nextZoom <= vpH - 150
      ? Math.max(48, Math.round((vpH - 86 - totalH * nextZoom) / 2))
      : 48
    userInteractedRef.current = true
    setPan({ x: centeredX, y: centeredY })
    setZoom(nextZoom)
    toast.success('已按原比例居中整理画布')
  }, [libraryNodes, nodeDims, persistPositions, viewportSize.h, viewportSize.w])

  // Bring / focus any node from Assets or History drawer into the visible canvas center
  const focusNodeOnCanvas = useCallback((nodeId: string) => {
    userInteractedRef.current = true
    const pos = positions[nodeId]
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (pos) {
      const d = nodeDims[nodeId]
      const cx = pos.x + (d?.tileW ?? DEFAULT_TILE_W) / 2
      const cy = pos.y + (d?.tileH ?? DEFAULT_TILE_H) / 2
      setPan({
        x: Math.round(rect.width / 2 - cx * zoom),
        y: Math.round(rect.height / 2 - cy * zoom - 40),
      })
      setSelectedNodeId(nodeId)
    }
    else {
      const nx = Math.round((-pan.x + rect.width / 2 - DEFAULT_TILE_W / 2) / zoom)
      const ny = Math.round((-pan.y + rect.height / 2 - DEFAULT_TILE_H / 2) / zoom)
      persistPositions({ ...positions, [nodeId]: { x: nx, y: ny } })
      setSelectedNodeId(nodeId)
    }
  }, [nodeDims, pan.x, pan.y, persistPositions, positions, zoom])

  const getNodeAnchors = useCallback((nodeId: string): { left: CanvasPos, right: CanvasPos } | null => {
    const p = positions[nodeId]
    if (!p) return null
    const d = nodeDims[nodeId]
    const w = nodeId.startsWith('draft:') ? 248 : (d?.tileW ?? DEFAULT_TILE_W)
    const h = nodeId.startsWith('draft:') ? 200 : (d?.tileH ?? DEFAULT_TILE_H)
    return {
      left: { x: p.x, y: p.y + h / 2 },
      right: { x: p.x + w, y: p.y + h / 2 },
    }
  }, [nodeDims, positions])

  const spawnGeneratorNode = useCallback((
    kind: 'image' | 'video' | 'draft',
    sourceId?: string,
    opts?: { x?: number, y?: number, initialPrompt?: string },
  ) => {
    const defaultModel = kind === 'image'
      ? (catalog.imageModels[0]?.model || 'dreamina-5.0')
      : kind === 'video'
        ? (catalog.videoModels[0]?.name || 'dreamina-seedance-2.0-fast')
        : (catalog.defaultTextModel || 'agy:default')

    const anchors = sourceId ? getNodeAnchors(sourceId) : null
    const el = viewportRef.current
    const rect = el?.getBoundingClientRect()
    const centerX = rect ? Math.round((-pan.x + rect.width / 2 - GEN_NODE_W / 2) / zoom) : 280
    const centerY = rect ? Math.round((-pan.y + rect.height / 2 - GEN_NODE_H / 2 - 40) / zoom) : 120

    const x = opts?.x ?? (anchors ? anchors.right.x + 96 : centerX)
    const y = opts?.y ?? (anchors ? Math.max(0, anchors.right.y - GEN_NODE_H / 2) : centerY)

    const sourceDim = sourceId ? nodeDims[sourceId] : undefined
    const autoRatio = sourceDim ? (formatAspectTag(sourceDim.natW, sourceDim.natH) || '9:16') : '9:16'
    const validRatio = ['9:16', '3:4', '1:1', '16:9', '4:3'].includes(autoRatio) ? autoRatio : '9:16'

    const node: GeneratorNodeData = {
      id: `gen:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x,
      y,
      kind,
      prompt: opts?.initialPrompt ?? '',
      model: defaultModel,
      aspectRatio: validRatio,
      imageSize: kind === 'video' ? '720p' : '2K',
      imageCount: 1,
      duration: 5,
      sourceNodeIds: sourceId ? [sourceId] : [],
      status: 'idle',
    }
    setGenNodes(prev => [...prev, node])
    setSpawnMenu(null)
  }, [catalog, getNodeAnchors, nodeDims, pan.x, pan.y, zoom])

  // Start dragging wire from any image/video node's right `+` port
  const handleStartWireDrag = (e: React.MouseEvent, sourceId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const anchors = getNodeAnchors(sourceId)
    if (!anchors) return
    const nextWire: DraggingWire = {
      sourceId,
      startX: anchors.right.x,
      startY: anchors.right.y,
      curX: anchors.right.x + 2,
      curY: anchors.right.y,
    }
    draggingWireRef.current = nextWire
    setDraggingWire(nextWire)
    setSpawnMenu(null)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-canvas-node="true"], [data-canvas-ui="true"]')) return
    setSelectedNodeId(null)
    setSpawnMenu(null)
    setIsPanning(true)
    panOriginRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (draggingWireRef.current && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect()
      const cx = (e.clientX - rect.left - pan.x) / zoom
      const cy = (e.clientY - rect.top - pan.y) / zoom
      setDraggingWire(prev => (prev ? { ...prev, curX: cx, curY: cy } : null))
      return
    }

    const drag = draggingNodeRef.current
    if (drag) {
      const rawDx = e.clientX - drag.sx
      const rawDy = e.clientY - drag.sy
      if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) drag.moved = true
      const dx = rawDx / zoom
      const dy = rawDy / zoom
      if (drag.isGen) {
        setGenNodes(prev => prev.map(n => (n.id === drag.id ? { ...n, x: drag.nx + dx, y: drag.ny + dy } : n)))
      }
      else {
        setPositions(prev => ({ ...prev, [drag.id]: { x: drag.nx + dx, y: drag.ny + dy } }))
      }
      return
    }

    if (isPanning) {
      userInteractedRef.current = true
      const dx = e.clientX - panOriginRef.current.mx
      const dy = e.clientY - panOriginRef.current.my
      setPan({ x: panOriginRef.current.px + dx, y: panOriginRef.current.py + dy })
    }
  }

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    const wire = draggingWireRef.current
    if (wire && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect()
      const dropCanvasX = (e.clientX - rect.left - pan.x) / zoom
      const dropCanvasY = (e.clientY - rect.top - pan.y) / zoom

      // 1) Dropped onto an existing Generator Node
      const targetGen = genNodes.find(g =>
        dropCanvasX >= g.x - 24
        && dropCanvasX <= g.x + GEN_NODE_W + 12
        && dropCanvasY >= g.y - 16
        && dropCanvasY <= g.y + GEN_NODE_H + 24,
      )

      if (targetGen) {
        setGenNodes(prev => prev.map((g) => {
          if (g.id !== targetGen.id || g.sourceNodeIds.includes(wire.sourceId)) return g
          return { ...g, sourceNodeIds: [...g.sourceNodeIds, wire.sourceId] }
        }))
        toast.success('已连线接入该生成节点作为参考')
      }
      else {
        // 2) Dropped onto ANY other image or video node (supports Image↔Image, Video↔Video, Image↔Video!)
        const targetMedia = libraryNodes.find((n) => {
          if (n.id === wire.sourceId || n.kind === 'draft') return false
          const p = positions[n.id]
          if (!p) return false
          const d = nodeDims[n.id]
          const w = d?.tileW ?? DEFAULT_TILE_W
          const h = d?.tileH ?? DEFAULT_TILE_H
          return dropCanvasX >= p.x - 20 && dropCanvasX <= p.x + w + 12 && dropCanvasY >= p.y - 12 && dropCanvasY <= p.y + h + 12
        })

        if (targetMedia) {
          const exists = peerLinks.some(l => l.fromId === wire.sourceId && l.toId === targetMedia.id)
          if (!exists) {
            setPeerLinks(prev => [...prev, { id: `peer:${wire.sourceId}->${targetMedia.id}`, fromId: wire.sourceId, toId: targetMedia.id }])
          }
          setSelectedNodeId(targetMedia.id)
          toast.success('已建立节点参考连线，已自动加入目标素材参考栏')
        }
        else {
          // 3) Dropped on blank canvas (or clicked `+` handle) -> open quick pull-out menu right here!
          const draggedDist = Math.hypot(dropCanvasX - wire.startX, dropCanvasY - wire.startY)
          const menuCanvasX = draggedDist > 30 ? dropCanvasX : wire.startX + 90
          const menuCanvasY = draggedDist > 30 ? dropCanvasY : wire.startY
          setSpawnMenu({
            sourceId: wire.sourceId,
            canvasX: menuCanvasX,
            canvasY: menuCanvasY,
            screenX: clamp(e.clientX - rect.left, 16, rect.width - 196),
            screenY: clamp(e.clientY - rect.top, 48, rect.height - 170),
          })
        }
      }

      setDraggingWire(null)
      setHoveredTargetId(null)
      return
    }

    if (draggingNodeRef.current) {
      if (!draggingNodeRef.current.isGen && draggingNodeRef.current.moved) {
        persistPositions(positions)
      }
      draggingNodeRef.current = null
    }
    setIsPanning(false)
  }

  const startNodeDrag = (e: React.MouseEvent, id: string, isGen: boolean, nx: number, ny: number) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select, [data-port="true"]')) return
    e.stopPropagation()
    draggingNodeRef.current = { id, isGen, sx: e.clientX, sy: e.clientY, nx, ny, moved: false }
  }

  // Gather ALL connected reference assets (images AND videos!) for a node or generator
  const collectReferenceAssets = useCallback((sourceIds: string[]) => {
    const imgUrls: string[] = []
    const vidUrls: string[] = []
    for (const sid of sourceIds) {
      const node = libraryNodes.find(l => l.id === sid)
      if (!node) continue
      const u = node.rawUrl || node.url
      if (!u) continue
      if (node.kind === 'image' && !imgUrls.includes(u)) imgUrls.push(u)
      else if (node.kind === 'video' && !vidUrls.includes(u)) vidUrls.push(u)
    }
    return { imgUrls, vidUrls }
  }, [libraryNodes])

  // All reference node IDs active in the Dreamina-style dock (the selected asset + peer-wired incoming nodes + manually added refs)
  const dockRefIds = useMemo(() => {
    if (!selectedNode || selectedNode.kind === 'draft') return []
    const incoming = peerLinks.filter(l => l.toId === selectedNode.id).map(l => l.fromId)
    return [...new Set([selectedNode.id, ...incoming, ...dockExtraRefIds])]
  }, [dockExtraRefIds, peerLinks, selectedNode])

  // Run generation directly from the Dreamina-style floating bottom dock (图1)
  const runSelectedDockGenerate = async () => {
    if (!selectedNode) return
    if (!dockPrompt.trim()) {
      toast.warning('请输入提示词')
      return
    }
    setDockRunning(true)
    const { imgUrls, vidUrls } = collectReferenceAssets(dockRefIds)
    try {
      let taskId: string | undefined
      if (dockMode === 'image') {
        const res = await apiCreateImageTextDraft({
          quantity: 1,
          groupId,
          prompt: dockPrompt.trim(),
          imageModel: dockModel as ImageModelType,
          imageCount: dockCount,
          aspectRatio: dockRatio,
          imageSize: dockQuality,
          imageUrls: imgUrls.length > 0 ? imgUrls : undefined,
          draftType: 'image',
        })
        if (res?.code !== 0) throw new Error(res?.message || '生图任务创建失败')
        taskId = res.data?.taskIds?.[0]
      }
      else {
        const res = await apiCreateDraftGeneration({
          quantity: 1,
          groupId,
          model: dockModel as VideoModelType,
          prompt: dockPrompt.trim(),
          duration: dockDuration,
          resolution: dockQuality,
          aspectRatio: dockRatio,
          imageUrls: imgUrls.length > 0 ? imgUrls : undefined,
          videoUrls: vidUrls.length > 0 ? vidUrls : undefined,
          draftType: 'video',
        })
        if (res?.code !== 0) throw new Error(res?.message || '生视频任务创建失败')
        taskId = res.data?.taskIds?.[0]
      }

      if (!taskId) throw new Error('未返回任务 ID')
      const completed = await pollTaskUntilDone(taskId)
      if (completed.status === 'failed') {
        throw new Error(completed.errorMessage || '生成失败')
      }

      const rawResp = (completed.response ?? {}) as Record<string, unknown>
      const newIds: string[] = []
      if (Array.isArray(rawResp['mediaIds'])) {
        for (const mid of rawResp['mediaIds'] as string[]) {
          newIds.push(`${dockMode === 'video' ? 'vid' : 'img'}:${mid}`)
        }
      }
      else if (typeof rawResp['mediaId'] === 'string') {
        newIds.push(`${dockMode === 'video' ? 'vid' : 'img'}:${rawResp['mediaId']}`)
      }

      if (newIds.length > 0) {
        const srcPos = positions[selectedNode.id] ?? { x: 0, y: 0 }
        const srcDim = nodeDims[selectedNode.id]
        const baseX = srcPos.x + (srcDim?.tileW ?? DEFAULT_TILE_W) + 96
        setPositions((prev) => {
          const next = { ...prev }
          newIds.forEach((rid, idx) => {
            next[rid] = { x: baseX + idx * 250, y: srcPos.y }
          })
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
          }
          return next
        })
        setPeerLinks(prev => [
          ...prev,
          ...newIds.map(rid => ({ id: `peer:${selectedNode.id}->${rid}`, fromId: selectedNode.id, toId: rid })),
        ])
        setSelectedNodeId(newIds[0])
      }
      toast.success(dockMode === 'video' ? '视频已生成并连线添加到画布右侧' : '图片已生成并连线添加到画布右侧')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    }
    finally {
      setDockRunning(false)
    }
  }

  // Run workflow Generator Node (supports image, video, draft + image/video multi-ref!)
  const runGeneratorNode = async (gen: GeneratorNodeData) => {
    if (!gen.prompt.trim()) {
      toast.warning('请输入生成提示词')
      return
    }
    setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, status: 'running', errorText: undefined } : n)))

    const { imgUrls, vidUrls } = collectReferenceAssets(gen.sourceNodeIds)

    try {
      let taskId: string | undefined
      if (gen.kind === 'image') {
        const res = await apiCreateImageTextDraft({
          quantity: 1,
          groupId,
          prompt: gen.prompt.trim(),
          imageModel: gen.model as ImageModelType,
          imageCount: gen.imageCount,
          aspectRatio: gen.aspectRatio,
          imageSize: gen.imageSize,
          imageUrls: imgUrls.length > 0 ? imgUrls : undefined,
          draftType: 'image',
        })
        if (res?.code !== 0) throw new Error(res?.message || '生图片任务创建失败')
        taskId = res.data?.taskIds?.[0]
      }
      else if (gen.kind === 'video') {
        const res = await apiCreateDraftGeneration({
          quantity: 1,
          groupId,
          model: gen.model as VideoModelType,
          prompt: gen.prompt.trim(),
          duration: gen.duration,
          resolution: gen.imageSize,
          aspectRatio: gen.aspectRatio,
          imageUrls: imgUrls.length > 0 ? imgUrls : undefined,
          videoUrls: vidUrls.length > 0 ? vidUrls : undefined,
          draftType: 'video',
        })
        if (res?.code !== 0) throw new Error(res?.message || '生视频任务创建失败')
        taskId = res.data?.taskIds?.[0]
      }
      else {
        const res = await apiCreateImageTextDraft({
          quantity: 1,
          groupId,
          prompt: gen.prompt.trim(),
          imageModel: (catalog.imageModels[0]?.model || 'dreamina-5.0') as ImageModelType,
          plannerModel: gen.model,
          imageCount: 3,
          imageUrls: imgUrls.length > 0 ? imgUrls : undefined,
          draftType: 'draft',
        })
        if (res?.code !== 0) throw new Error(res?.message || '生文本任务创建失败')
        taskId = res.data?.taskIds?.[0]
      }

      if (!taskId) throw new Error('未返回任务 ID')
      const completed = await pollTaskUntilDone(taskId)
      if (completed.status === 'failed') {
        throw new Error(completed.errorMessage || '节点执行失败')
      }

      const rawResp = (completed.response ?? {}) as Record<string, unknown>
      const newResultNodeIds: string[] = []
      if (Array.isArray(rawResp['mediaIds'])) {
        for (const mid of rawResp['mediaIds'] as string[]) {
          newResultNodeIds.push(`${gen.kind === 'video' ? 'vid' : 'img'}:${mid}`)
        }
      }
      else if (typeof rawResp['mediaId'] === 'string') {
        newResultNodeIds.push(`${gen.kind === 'video' ? 'vid' : 'img'}:${rawResp['mediaId']}`)
      }
      else if (typeof rawResp['materialId'] === 'string') {
        newResultNodeIds.push(`draft:${rawResp['materialId']}`)
      }

      if (newResultNodeIds.length > 0) {
        setPositions((prev) => {
          const next = { ...prev }
          newResultNodeIds.forEach((rid, idx) => {
            next[rid] = { x: gen.x + GEN_NODE_W + 96, y: gen.y + idx * 320 }
          })
          if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
          }
          return next
        })
        setOutputLinks(prev => [
          ...prev,
          ...newResultNodeIds.map(rid => ({ genId: gen.id, targetNodeId: rid })),
        ])
      }

      setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, status: 'done' } : n)))
      toast.success('生成完成，结果已自动连线放到节点右侧')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, status: 'error', errorText: msg } : n)))
      toast.error(msg)
    }
  }

  const handleUploadReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const uploadedPath = await uploadToOss(file)
      const fullUrl = getOssUrl(uploadedPath)
      const isVid = file.type.startsWith('video/')
      spawnGeneratorNode(isVid ? 'video' : 'image', undefined, {
        initialPrompt: `基于上传素材创作：${fullUrl}`,
      })
      toast.success('素材已上传并在画布创建节点')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败')
    }
    finally {
      setUploading(false)
    }
  }

  // Embedded Native Agent Chat via SSE
  const sendAgentMessage = async (customText?: string) => {
    const text = (customText ?? agentInput).trim()
    if ((!text && agentAttachments.length === 0) || agentBusy) return

    const snapshotAttachments = [...agentAttachments]
    const contextLines: string[] = []
    for (const att of snapshotAttachments) {
      const kindLabel = att.kind === 'video' ? '视频' : '图片'
      const srcLabel = att.source === 'canvas' ? '画布@引用' : '本地上传附件'
      contextLines.push(`${srcLabel}${kindLabel}（${att.title}）：${att.rawUrl || att.url}`)
    }
    if (selectedNode && !snapshotAttachments.some(a => a.nodeId === selectedNode.id)) {
      if (selectedNode.kind === 'image') contextLines.push(`画布当前选中图片（${selectedNode.title}）：${selectedNode.rawUrl || selectedNode.url}`)
      else if (selectedNode.kind === 'video') contextLines.push(`画布当前选中视频（${selectedNode.title}）：${selectedNode.rawUrl || selectedNode.url}`)
      else contextLines.push(`画布当前选中草稿（${selectedNode.title}）：${(selectedNode.desc || '').slice(0, 260)}`)
    }

    const prefLines: string[] = []
    if (agentTextModel && agentTextModel !== 'agy:default') {
      prefLines.push(`文本偏好模型：${agentTextModel}`)
    }
    if (agentMediaConfig.imageModel !== 'auto') prefLines.push(`优先图片模型：${agentMediaConfig.imageModel}`)
    if (agentMediaConfig.videoModel !== 'auto') prefLines.push(`优先视频模型：${agentMediaConfig.videoModel}`)
    if (agentMediaConfig.aspectRatio !== 'auto') prefLines.push(`画面比例：${agentMediaConfig.aspectRatio}`)
    if (agentMediaConfig.activeTab === 'image' && agentMediaConfig.imageQuality !== 'auto') {
      prefLines.push(`图片清晰度：${agentMediaConfig.imageQuality}`)
    }
    if (agentMediaConfig.activeTab === 'video') {
      if (agentMediaConfig.videoQuality !== 'auto') prefLines.push(`视频清晰度：${agentMediaConfig.videoQuality}`)
      prefLines.push(`视频时长：${agentMediaConfig.videoDuration}秒`)
    }

    const headerParts: string[] = []
    if (contextLines.length > 0) headerParts.push(`[参考素材与画布上下文]\n${contextLines.join('\n')}`)
    if (prefLines.length > 0) headerParts.push(`[生成参数偏好]\n${prefLines.join('；')}`)
    const effectiveUserText = text || '请基于我附带的参考素材帮我构思并生成高质量视觉延展方案'
    const finalPrompt = headerParts.length > 0
      ? `${headerParts.join('\n\n')}\n\n[用户指令]\n${effectiveUserText}`
      : effectiveUserText

    const userMsg: CanvasAgentMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: effectiveUserText,
      attachments: snapshotAttachments,
    }
    const botId = `a-${Date.now()}`
    setAgentMessages(prev => [
      ...prev,
      userMsg,
      { id: botId, role: 'assistant', text: '', tools: [], mediaUrls: [], streaming: true },
    ])
    setAgentInput('')
    setAgentAttachments([])
    setAgentBusy(true)

    try {
      const abort = await agentApi.createTaskWithSSE(
        { prompt: finalPrompt, taskId: agentTaskId, includePartialMessages: true },
        (msg: SSEMessage) => {
          if (msg.type === 'init' && msg.taskId) {
            setAgentTaskId(msg.taskId)
          }
          else if (msg.type === 'text' && msg.message) {
            const chunk = typeof msg.message === 'string' ? msg.message : ''
            if (chunk) setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, text: m.text + chunk } : m)))
          }
          else if (msg.type === 'stream_event' && msg.message && typeof msg.message === 'object') {
            const ev = (msg.message as unknown as Record<string, unknown>)['event'] as Record<string, unknown> | undefined
            const delta = ev?.['delta'] as Record<string, unknown> | undefined
            if (ev?.['type'] === 'content_block_delta' && delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
              setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, text: m.text + (delta['text'] as string) } : m)))
            }
          }
          else if (msg.type === 'message' && msg.message) {
            const inner = msg.message as unknown as Record<string, unknown>
            const content = inner['content']
            if (typeof content === 'string') {
              const urls = extractUrlsFromText(content)
              setAgentMessages(prev => prev.map(m => (m.id === botId
                ? { ...m, text: m.text || content, mediaUrls: [...new Set([...(m.mediaUrls || []), ...urls])] }
                : m)))
            }
            else if (Array.isArray(content)) {
              for (const block of content as Array<Record<string, unknown>>) {
                if (block['type'] === 'text' && typeof block['text'] === 'string') {
                  const urls = extractUrlsFromText(block['text'])
                  setAgentMessages(prev => prev.map(m => (m.id === botId
                    ? {
                        ...m,
                        text: m.text ? (m.text.includes(block['text'] as string) ? m.text : `${m.text}\n${block['text']}`) : (block['text'] as string),
                        mediaUrls: [...new Set([...(m.mediaUrls || []), ...urls])],
                      }
                    : m)))
                }
                else if (block['type'] === 'tool_use' && typeof block['name'] === 'string') {
                  setAgentMessages(prev => prev.map(m => (m.id === botId
                    ? { ...m, tools: [...new Set([...(m.tools || []), block['name'] as string])] }
                    : m)))
                }
              }
            }
          }
          else if (msg.type === 'result') {
            const raw = JSON.stringify(msg)
            const urls = extractUrlsFromText(raw)
            const resultObj = (msg.message && typeof msg.message === 'object')
              ? (msg.message as unknown as Record<string, unknown>)
              : undefined
            const resultText = typeof resultObj?.['message'] === 'string' ? resultObj['message'] as string : ''
            setAgentMessages(prev => prev.map(m => (m.id === botId
              ? { ...m, text: m.text || resultText, mediaUrls: [...new Set([...(m.mediaUrls || []), ...urls])] }
              : m)))
          }
          else if (msg.type === 'done') {
            setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, streaming: false } : m)))
            setAgentBusy(false)
            void refreshLibrary()
          }
          else if (msg.type === 'error') {
            const errTxt = typeof msg.message === 'string' ? msg.message : 'Agent 执行异常'
            setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, text: m.text || errTxt, streaming: false } : m)))
            setAgentBusy(false)
          }
        },
        (err) => {
          setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, text: m.text || `连接中断：${err.message}`, streaming: false } : m)))
          setAgentBusy(false)
        },
        () => {
          setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, streaming: false } : m)))
          setAgentBusy(false)
          void refreshLibrary()
        },
      )
      agentAbortRef.current = abort
      setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, streaming: false } : m)))
      setAgentBusy(false)
    }
    catch (err) {
      setAgentMessages(prev => prev.map(m => (m.id === botId ? { ...m, text: `调用失败：${err instanceof Error ? err.message : String(err)}`, streaming: false } : m)))
      setAgentBusy(false)
    }
  }

  useEffect(() => {
    agentScrollRef.current?.scrollTo({ top: agentScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [agentMessages])

  useEffect(() => {
    return () => { agentAbortRef.current?.() }
  }, [])

  // Compute ALL SVG Bézier wires:
  // 1) source -> generator node
  // 2) generator node -> generated result
  // 3) peer-to-peer image↔image / video↔video / image↔video reference links!
  const wirePaths = useMemo(() => {
    const list: Array<{ id: string, d: string, color: string, peerLinkId?: string, midX: number, midY: number }> = []

    for (const gen of genNodes) {
      for (const sid of gen.sourceNodeIds) {
        const anchors = getNodeAnchors(sid)
        if (!anchors) continue
        const x1 = anchors.right.x
        const y1 = anchors.right.y
        const x2 = gen.x
        const y2 = gen.y + 44
        const cx = Math.max(60, Math.abs(x2 - x1) * 0.45)
        list.push({
          id: `in:${sid}->${gen.id}`,
          d: `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`,
          color: '#7c3aed',
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
        })
      }
    }

    for (const link of outputLinks) {
      const gen = genNodes.find(g => g.id === link.genId)
      const targetAnchors = getNodeAnchors(link.targetNodeId)
      if (!gen || !targetAnchors) continue
      const x1 = gen.x + GEN_NODE_W
      const y1 = gen.y + GEN_NODE_H / 2
      const x2 = targetAnchors.left.x
      const y2 = targetAnchors.left.y
      const cx = Math.max(60, Math.abs(x2 - x1) * 0.45)
      list.push({
        id: `out:${link.genId}->${link.targetNodeId}`,
        d: `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`,
        color: '#8b5cf6',
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
      })
    }

    for (const pl of peerLinks) {
      const fromAnchors = getNodeAnchors(pl.fromId)
      const toAnchors = getNodeAnchors(pl.toId)
      if (!fromAnchors || !toAnchors) continue
      const x1 = fromAnchors.right.x
      const y1 = fromAnchors.right.y
      const x2 = toAnchors.left.x
      const y2 = toAnchors.left.y
      const cx = Math.max(60, Math.abs(x2 - x1) * 0.45)
      list.push({
        id: pl.id,
        d: `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`,
        color: '#2563eb',
        peerLinkId: pl.id,
        midX: (x1 + x2) / 2,
        midY: (y1 + y2) / 2,
      })
    }

    return list
  }, [genNodes, getNodeAnchors, outputLinks, peerLinks])

  const liveWirePath = useMemo(() => {
    if (!draggingWire) return null
    const { startX: x1, startY: y1, curX: x2, curY: y2 } = draggingWire
    const cx = Math.max(52, Math.abs(x2 - x1) * 0.45)
    return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`
  }, [draggingWire])

  const filteredAssets = useMemo(() => {
    if (assetFilter === 'all') return libraryNodes
    return libraryNodes.filter(n => n.kind === assetFilter)
  }, [assetFilter, libraryNodes])

  // Position the Dreamina-style editable prompt dock directly beneath the clicked image/video (follows drag/pan/zoom!)
  const selectedDockPos = useMemo(() => {
    if (!selectedNode || selectedNode.kind === 'draft') return null
    const pos = positions[selectedNode.id]
    if (!pos) return null
    const dims = nodeDims[selectedNode.id]
    const tileW = dims?.tileW ?? DEFAULT_TILE_W
    const tileH = dims?.tileH ?? DEFAULT_TILE_H
    const vpW = viewportSize.w || 1200
    const vpH = viewportSize.h || 760
    const dockW = Math.min(590, Math.max(320, vpW - 32))
    const dockH = 216
    const nodeCenterX = pan.x + (pos.x + tileW / 2) * zoom
    const nodeBottomY = pan.y + (pos.y + tileH) * zoom
    const left = clamp(Math.round(nodeCenterX - dockW / 2), 16, Math.max(16, vpW - dockW - 16))
    const maxTop = Math.max(16, vpH - dockH - 74)
    const top = clamp(Math.round(nodeBottomY + 12), 16, maxTop)
    const arrowLeft = clamp(Math.round(nodeCenterX - left), 28, dockW - 28)
    return { left, top, width: dockW, arrowLeft, attachedBelow: Math.abs(top - Math.round(nodeBottomY + 12)) < 10 }
  }, [selectedNode, positions, nodeDims, pan.x, pan.y, zoom, viewportSize.w, viewportSize.h])

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPrompt(true)
      toast.success('提示词已复制')
      setTimeout(() => setCopiedPrompt(false), 1600)
    }
    catch {}
  }

  return (
    <div
      className={cn(
        'relative flex w-full overflow-hidden border border-border bg-card shadow-sm',
        isFullscreen ? 'h-full rounded-none border-0' : 'h-[calc(100vh-116px)] min-h-[600px] rounded-2xl',
      )}
    >
      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUploadReference} />

      {/* 左侧滑出抽屉：资产库 / 生成历史 */}
      {leftDrawer && (
        <aside
          data-canvas-scroll="true"
          className="z-25 flex w-[300px] shrink-0 flex-col border-r border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              {leftDrawer === 'assets' ? <FolderOpen className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-primary" />}
              <span>{leftDrawer === 'assets' ? '资产库' : '生成历史'}</span>
            </div>
            <button
              type="button"
              onClick={() => setLeftDrawer(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {leftDrawer === 'assets' ? (
            <>
              <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2">
                {([
                  ['all', '全部'],
                  ['image', '图片'],
                  ['video', '视频'],
                  ['draft', '文本'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAssetFilter(key)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer',
                      assetFilter === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                >
                  <Upload className="h-3 w-3" />
                  上传
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-2">
                  {filteredAssets.map(node => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => focusNodeOnCanvas(node.id)}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-muted/40 text-left hover:border-primary cursor-pointer"
                    >
                      {node.kind === 'image' && node.url ? (
                        <div className="h-28 w-full bg-muted/60 p-1">
                          <img src={node.url} alt={node.title} className="h-full w-full object-contain" />
                        </div>
                      ) : node.kind === 'video' && node.url ? (
                        <div className="relative h-28 w-full bg-black p-1">
                          <video src={node.url} muted playsInline className="h-full w-full object-contain" />
                          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">视频</span>
                        </div>
                      ) : (
                        <div className="flex h-28 flex-col justify-between p-2.5">
                          <div className="text-[11px] font-semibold line-clamp-2 text-foreground">{node.title}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-2">{node.desc}</div>
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 rounded bg-primary/90 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 group-hover:opacity-100">
                        定位
                      </span>
                    </button>
                  ))}
                  {filteredAssets.length === 0 && (
                    <div className="col-span-2 py-10 text-center text-xs text-muted-foreground">暂无该类资产</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  加载记录…
                </div>
              ) : historyTasks.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">暂无生成历史</div>
              ) : (
                historyTasks.map((task) => {
                  const resp = (typeof task.response === 'object' && task.response ? task.response : {}) as Record<string, unknown>
                  const thumb = (Array.isArray(resp['imageUrls']) && typeof resp['imageUrls'][0] === 'string')
                    ? getOssUrl(resp['imageUrls'][0] as string)
                    : (typeof resp['coverUrl'] === 'string' ? getOssUrl(resp['coverUrl'] as string) : null)
                  const mediaIds = Array.isArray(resp['mediaIds']) ? (resp['mediaIds'] as string[]) : (typeof resp['mediaId'] === 'string' ? [resp['mediaId'] as string] : [])
                  const isVid = Boolean(resp['videoUrl'])
                  const firstCanvasId = mediaIds[0]
                    ? `${isVid ? 'vid' : 'img'}:${mediaIds[0]}`
                    : (typeof resp['materialId'] === 'string' ? `draft:${resp['materialId']}` : null)

                  return (
                    <div
                      key={task.id}
                      className="rounded-xl border border-border bg-background p-2.5 space-y-1.5 hover:border-primary/40"
                    >
                      <div className="flex items-start gap-2">
                        {thumb && (
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted p-0.5">
                            <img src={thumb} alt="" className="h-full w-full object-contain" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-medium',
                              task.status === 'success' ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                                : task.status === 'failed' ? 'bg-destructive/12 text-destructive'
                                  : 'bg-primary/12 text-primary',
                            )}
                            >
                              {task.status === 'success' ? '已完成' : task.status === 'failed' ? '失败' : '生成中'}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {task.request?.imageModel || task.request?.model || task.request?.plannerModel || ''}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-snug text-foreground line-clamp-2">
                            {task.request?.prompt || (typeof resp['title'] === 'string' ? resp['title'] : '无提示词')}
                          </p>
                        </div>
                      </div>
                      {firstCanvasId && (
                        <button
                          type="button"
                          onClick={() => focusNodeOnCanvas(firstCanvasId)}
                          className="w-full rounded-lg border border-border bg-muted/40 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 hover:text-primary cursor-pointer"
                        >
                          在画布中定位
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </aside>
      )}

      {/* 主无限画布区 */}
      <div
        ref={viewportRef}
        className={cn(
          'relative flex-1 overflow-hidden select-none',
          draggingWire ? 'cursor-crosshair' : isPanning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{
          backgroundColor: 'var(--background)',
          backgroundImage: 'radial-gradient(color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1px)',
          backgroundSize: `${Math.round(24 * zoom)}px ${Math.round(24 * zoom)}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => {
          draggingNodeRef.current = null
          setIsPanning(false)
        }}
      >
        {/* 右上角极简入口：全屏（非全屏态）+ AI Agent 开关 */}
        <div
          data-canvas-ui="true"
          className="absolute right-3.5 top-3 z-20 flex items-center gap-2"
        >
          {onToggleFullscreen && !isFullscreen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl bg-card/95 px-2.5 text-xs shadow-sm backdrop-blur"
              onClick={onToggleFullscreen}
            >
              <Maximize className="h-3.5 w-3.5" />
              全屏画布
            </Button>
          )}
          {!agentOpen && (
            <Button
              type="button"
              size="sm"
              data-testid="open-canvas-agent-btn"
              className="h-8 gap-1.5 rounded-xl px-3 text-xs shadow-sm"
              onClick={() => setAgentOpen(true)}
            >
              <AgentPrismMark className="h-3.5 w-3.5" />
              创作副驾
            </Button>
          )}
        </div>

        {/* 无限画布世界坐标层 */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0"
        >
          {/* SVG 贝塞尔连线层（支持图片↔图片、视频↔视频、图片↔视频、素材→生成节点） */}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width="1" height="1">
            {wirePaths.map(w => (
              <path
                key={w.id}
                d={w.d}
                fill="none"
                stroke={w.color}
                strokeWidth={2.4}
                strokeLinecap="round"
              />
            ))}
            {liveWirePath && (
              <path
                d={liveWirePath}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2.8}
                strokeDasharray="6 5"
                strokeLinecap="round"
              />
            )}
          </svg>

          {/* 资产节点（图片/视频按原比例完整展示，两侧均有连接口支持互相连线参考） */}
          {libraryNodes.map((node) => {
            const pos = positions[node.id] ?? { x: 0, y: 0 }
            const dims = nodeDims[node.id]
            const isSelected = selectedNodeId === node.id
            const isWireTarget = Boolean(draggingWire && draggingWire.sourceId !== node.id && hoveredTargetId === node.id && node.kind !== 'draft')
            const tileW = node.kind === 'draft' ? 248 : (dims?.tileW ?? DEFAULT_TILE_W)

            return (
              <div
                key={node.id}
                data-canvas-node="true"
                style={{ left: pos.x, top: pos.y, width: tileW }}
                onMouseEnter={() => draggingWire && node.kind !== 'draft' && setHoveredTargetId(node.id)}
                onMouseLeave={() => hoveredTargetId === node.id && setHoveredTargetId(null)}
                className={cn(
                  'group absolute transition-shadow',
                  isSelected ? 'z-20' : 'z-10 hover:z-15',
                )}
                onMouseDown={e => startNodeDrag(e, node.id, false, pos.x, pos.y)}
                onClick={(e) => {
                  e.stopPropagation()
                  if (draggingNodeRef.current?.moved) return
                  setSelectedNodeId(node.id)
                  setSpawnMenu(null)
                }}
              >
                {/* 选中时顶部极简操作浮标（大图预览 / 取消） */}
                {isSelected && node.kind !== 'draft' && (
                  <div
                    data-canvas-ui="true"
                    className="absolute -top-9 right-0 z-30 flex items-center gap-1 rounded-lg border border-border bg-card/95 px-1.5 py-0.5 shadow-md backdrop-blur"
                    onClick={e => e.stopPropagation()}
                  >
                    {dims && dims.natW > 0 && (
                      <span className="px-1.5 text-[10px] font-medium text-muted-foreground">
                        {dims.natW}×{dims.natH} · {formatAspectTag(dims.natW, dims.natH)}
                      </span>
                    )}
                    <button
                      type="button"
                      title="全屏查看大图"
                      onClick={() => {
                        setPreviewItems([{
                          type: node.kind === 'video' ? 'video' : 'image',
                          src: node.url || '',
                          title: node.title,
                          mediaId: node.mediaId,
                          rawUrl: node.rawUrl,
                        }])
                        setPreviewOpen(true)
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* 左侧输入连线端口（任意图片/视频均可被连入作为参考！） */}
                {node.kind !== 'draft' && (
                  <div
                    title="将其他图片或视频拖线至此作为参考"
                    className={cn(
                      'pointer-events-none absolute -left-3 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card bg-blue-600 text-white shadow transition-all',
                      isWireTarget
                        ? 'opacity-100 scale-125 ring-4 ring-blue-500/30'
                        : draggingWire && draggingWire.sourceId !== node.id
                          ? 'opacity-100 scale-100'
                          : 'opacity-0 scale-75 group-hover:opacity-80',
                    )}
                  >
                    <Link2 className="h-3 w-3" />
                  </div>
                )}

                {/* 视觉主体 */}
                {node.kind === 'image' && node.url ? (
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-2xl bg-muted/40 shadow-sm transition-all',
                      isWireTarget
                        ? 'ring-3 ring-blue-500 ring-offset-2 ring-offset-background shadow-xl'
                        : isSelected
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xl'
                          : 'ring-1 ring-border/70 group-hover:ring-primary/50 group-hover:shadow-md',
                    )}
                  >
                    <img
                      src={node.url}
                      alt={node.title}
                      draggable={false}
                      onLoad={(e) => {
                        const nw = e.currentTarget.naturalWidth
                        const nh = e.currentTarget.naturalHeight
                        if (nw && nh && nodeDims[node.id]?.natW !== nw) {
                          setNodeDims(prev => ({ ...prev, [node.id]: computeTileSize(nw, nh) }))
                        }
                      }}
                      className="block w-full h-auto"
                    />
                  </div>
                ) : node.kind === 'video' && node.url ? (
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-2xl bg-black shadow-sm transition-all',
                      isWireTarget
                        ? 'ring-3 ring-blue-500 ring-offset-2 ring-offset-background shadow-xl'
                        : isSelected
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xl'
                          : 'ring-1 ring-border/70 group-hover:ring-primary/50',
                    )}
                  >
                    <video
                      src={node.url}
                      muted
                      playsInline
                      onLoadedMetadata={(e) => {
                        const vw = e.currentTarget.videoWidth
                        const vh = e.currentTarget.videoHeight
                        if (vw && vh && nodeDims[node.id]?.natW !== vw) {
                          setNodeDims(prev => ({ ...prev, [node.id]: computeTileSize(vw, vh) }))
                        }
                      }}
                      className="block w-full h-auto"
                    />
                    <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                      视频
                    </span>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm transition-all cursor-pointer',
                      isSelected ? 'border-primary ring-2 ring-primary/25 shadow-lg' : 'border-border hover:border-primary/40',
                    )}
                    onDoubleClick={() => node.draftRaw && openDraftDetail(node.draftRaw)}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                      <FileText className="h-3.5 w-3.5" />
                      <span className="truncate">{node.title}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-5 whitespace-pre-line">
                      {node.desc || '双击打开编辑'}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (node.draftRaw) openDraftDetail(node.draftRaw) }}
                      className="mt-2.5 w-full rounded-lg border border-border/80 bg-muted/40 py-1 text-[11px] font-medium text-foreground hover:bg-muted cursor-pointer"
                    >
                      编辑文本
                    </button>
                  </div>
                )}

                {/* 右侧输出连线端口（图片与视频均可拖出连线到另一张图、另一个视频或任意生成节点！） */}
                {node.kind !== 'draft' && (
                  <button
                    type="button"
                    data-port="true"
                    title="按住拖线连接到其他图片/视频/节点，或点击直接引出新节点"
                    onMouseDown={e => handleStartWireDrag(e, node.id)}
                    className={cn(
                      'absolute -right-3.5 top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-all hover:scale-115 cursor-crosshair',
                      isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100',
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}

          {/* 工作流生成节点（生图片 / 生视频 / 生文本） */}
          {genNodes.map((gen) => {
            const isDropTarget = Boolean(draggingWire && hoveredTargetId === gen.id)
            return (
              <div
                key={gen.id}
                data-canvas-node="true"
                style={{ left: gen.x, top: gen.y, width: GEN_NODE_W }}
                onMouseEnter={() => draggingWire && setHoveredTargetId(gen.id)}
                onMouseLeave={() => hoveredTargetId === gen.id && setHoveredTargetId(null)}
                className={cn(
                  'absolute z-20 rounded-2xl border-2 bg-card shadow-lg transition-all',
                  isDropTarget ? 'border-primary ring-4 ring-primary/25 scale-[1.02]' : 'border-primary/45',
                )}
                onMouseDown={e => startNodeDrag(e, gen.id, true, gen.x, gen.y)}
                onClick={e => e.stopPropagation()}
              >
                <div
                  className={cn(
                    'absolute -left-3 top-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card shadow transition-transform',
                    draggingWire ? 'bg-primary text-white scale-115' : 'bg-primary/80 text-white',
                  )}
                >
                  <Link2 className="h-3 w-3" />
                </div>

                <div className="flex items-center justify-between border-b border-border/70 bg-primary/[0.06] px-3 py-2 rounded-t-2xl">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <StudioSelect
                      value={gen.kind}
                      options={[
                        { value: 'image', label: '生图片' },
                        { value: 'video', label: '生视频' },
                        { value: 'draft', label: '生文本' },
                      ]}
                      triggerClassName="h-7 border-transparent bg-transparent pl-1.5 pr-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                      onChange={(val) => {
                        const nextKind = val as GeneratorNodeData['kind']
                        const nextModel = nextKind === 'image'
                          ? (catalog.imageModels[0]?.model || 'dreamina-5.0')
                          : nextKind === 'video'
                            ? (catalog.videoModels[0]?.name || 'dreamina-seedance-2.0-fast')
                            : (catalog.defaultTextModel || 'agy:default')
                        setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, kind: nextKind, model: nextModel, imageSize: nextKind === 'video' ? '720p' : '2K' } : n)))
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer"
                    onClick={() => setGenNodes(prev => prev.filter(n => n.id !== gen.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5 p-3">
                  {gen.sourceNodeIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {gen.sourceNodeIds.map((sid, idx) => {
                        const src = libraryNodes.find(n => n.id === sid)
                        const tag = src?.kind === 'video' ? `参考视频` : (gen.kind === 'video' && gen.sourceNodeIds.length >= 2 ? (idx === 0 ? '首帧' : '尾帧') : `参考图 ${idx + 1}`)
                        return (
                          <span key={sid} className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/8 pl-1 pr-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {src?.kind === 'video'
                              ? <Film className="h-3.5 w-3.5" />
                              : src?.url && <img src={src.url} alt="" className="h-4 w-4 rounded object-cover" />}
                            <span>{tag}</span>
                            <button
                              type="button"
                              className="hover:text-destructive cursor-pointer"
                              onClick={() => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, sourceNodeIds: n.sourceNodeIds.filter(x => x !== sid) } : n)))}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  <textarea
                    rows={3}
                    data-canvas-scroll="true"
                    className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs leading-relaxed outline-none focus:border-primary"
                    placeholder={gen.kind === 'draft' ? '输入文案主题…' : '输入提示词…'}
                    value={gen.prompt}
                    onChange={e => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, prompt: e.target.value } : n)))}
                  />

                  <div className="flex flex-wrap items-center gap-1.5">
                    {gen.kind === 'draft'
                      ? (
                          <TextModelPicker
                            variant="compact"
                            triggerClassName="min-w-[140px] flex-1"
                            value={gen.model}
                            models={catalog.textModels}
                            groups={catalog.textModelGroups}
                            onChange={val => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, model: val } : n)))}
                            side="bottom"
                            align="start"
                          />
                        )
                      : (
                          <StudioSelect
                            className="min-w-[120px] flex-1"
                            triggerClassName="h-7.5 text-[11px]"
                            menuMinWidth={190}
                            value={gen.model}
                            options={
                              gen.kind === 'image'
                                ? (catalog.imageModels.length > 0
                                    ? catalog.imageModels.map(m => ({ value: m.model, label: m.displayName || m.model }))
                                    : [{ value: gen.model, label: gen.model === 'dreamina-5.0' ? '即梦 5.0 Lite (CLI)' : gen.model }])
                                : (catalog.videoModels.length > 0
                                    ? catalog.videoModels.map(m => ({ value: m.name, label: m.description || m.name }))
                                    : [{ value: gen.model, label: gen.model }])
                            }
                            onChange={val => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, model: val } : n)))}
                          />
                        )}

                    {gen.kind !== 'draft' && (
                      <>
                        <StudioSelect
                          className="w-[74px]"
                          triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                          value={gen.aspectRatio}
                          options={['9:16', '3:4', '1:1', '16:9', '4:3'].map(r => ({ value: r, label: r }))}
                          onChange={val => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, aspectRatio: val } : n)))}
                        />
                        <StudioSelect
                          className="w-[70px]"
                          triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                          value={gen.imageSize}
                          options={(gen.kind === 'video' ? ['720p', '1080p'] : ['2K', '4K']).map(q => ({ value: q, label: q }))}
                          onChange={val => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, imageSize: val } : n)))}
                        />
                        {gen.kind === 'image' && (
                          <StudioSelect
                            className="w-[66px]"
                            triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                            value={String(gen.imageCount)}
                            options={[1, 2, 3, 4].map(c => ({ value: String(c), label: `${c}张` }))}
                            onChange={val => setGenNodes(prev => prev.map(n => (n.id === gen.id ? { ...n, imageCount: Number(val) } : n)))}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {gen.errorText && (
                    <p className="rounded-lg bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{gen.errorText}</p>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full gap-1.5 text-xs"
                    disabled={gen.status === 'running'}
                    onClick={() => void runGeneratorNode(gen)}
                  >
                    {gen.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {gen.status === 'running' ? '生成中…' : '运行节点'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 拖线松开在空白处的「引出节点」菜单 */}
        {spawnMenu && (
          <div
            data-canvas-ui="true"
            style={{ left: spawnMenu.screenX, top: spawnMenu.screenY }}
            className="absolute z-30 w-44 overflow-hidden rounded-xl border border-border bg-card/98 p-1.5 shadow-xl backdrop-blur"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => spawnGeneratorNode('image', spawnMenu.sourceId, { x: spawnMenu.canvasX, y: spawnMenu.canvasY - 44 })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
            >
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              生图片
            </button>
            <button
              type="button"
              onClick={() => spawnGeneratorNode('video', spawnMenu.sourceId, { x: spawnMenu.canvasX, y: spawnMenu.canvasY - 44 })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
            >
              <Film className="h-3.5 w-3.5 text-violet-500" />
              生视频
            </button>
            <button
              type="button"
              onClick={() => spawnGeneratorNode('draft', spawnMenu.sourceId, { x: spawnMenu.canvasX, y: spawnMenu.canvasY - 44 })}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-emerald-500" />
              生文本
            </button>
          </div>
        )}

        {/* 参考图1（即梦画布风格）：紧跟选中图片/视频正下方弹出，随拖动/平移/缩放实时跟随 */}
        {selectedNode && selectedNode.kind !== 'draft' && selectedDockPos && (
          <div
            data-canvas-ui="true"
            data-canvas-scroll="true"
            style={{
              left: selectedDockPos.left,
              top: selectedDockPos.top,
              width: selectedDockPos.width,
            }}
            onClick={e => e.stopPropagation()}
            className="absolute z-30 rounded-2xl border border-border/90 bg-card/98 p-3.5 shadow-2xl backdrop-blur animate-in fade-in-0 zoom-in-95 duration-150"
          >
            {selectedDockPos.attachedBelow && (
              <div
                style={{ left: selectedDockPos.arrowLeft }}
                className="pointer-events-none absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-border/90 bg-card"
              />
            )}
            {/* 顶部参考素材条（支持多图/视频参考 + 点击 + 号新增参考） */}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                {dockRefIds.map((rid, idx) => {
                  const refNode = libraryNodes.find(n => n.id === rid)
                  if (!refNode) return null
                  const isPrimary = rid === selectedNode.id
                  return (
                    <div key={rid} className="group/ref relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50">
                      {refNode.kind === 'video' ? (
                        <video src={refNode.url} muted playsInline className="h-full w-full object-cover bg-black" />
                      ) : (
                        <img src={refNode.url} alt="" className="h-full w-full object-cover" />
                      )}
                      <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded bg-black/70 px-1 text-[9px] font-bold text-white">
                        {refNode.kind === 'video' ? '视' : idx + 1}
                      </span>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            setDockExtraRefIds(prev => prev.filter(x => x !== rid))
                            setPeerLinks(prev => prev.filter(l => !(l.fromId === rid && l.toId === selectedNode.id)))
                          }}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-white opacity-0 group-hover/ref:opacity-100 cursor-pointer"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  )
                })}

                <div className="relative">
                  <button
                    type="button"
                    title="添加更多图片或视频作为参考"
                    onClick={() => setDockRefPickerOpen(v => !v)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground hover:border-primary hover:text-primary cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  {dockRefPickerOpen && (
                    <div className="absolute bottom-13 left-0 z-40 w-64 rounded-xl border border-border bg-card p-2 shadow-xl">
                      <div className="mb-1.5 text-[11px] font-semibold text-foreground">添加参考图片 / 视频</div>
                      <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto">
                        {libraryNodes
                          .filter(n => n.kind !== 'draft' && !dockRefIds.includes(n.id))
                          .map(n => (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => {
                                setDockExtraRefIds(prev => [...prev, n.id])
                                setPeerLinks(prev => (prev.some(l => l.fromId === n.id && l.toId === selectedNode.id)
                                  ? prev
                                  : [...prev, { id: `peer:${n.id}->${selectedNode.id}`, fromId: n.id, toId: selectedNode.id }]))
                                setDockRefPickerOpen(false)
                              }}
                              className="relative h-12 overflow-hidden rounded-lg border border-border bg-muted hover:border-primary cursor-pointer"
                            >
                              {n.kind === 'video'
                                ? <video src={n.url} muted playsInline className="h-full w-full object-cover bg-black" />
                                : <img src={n.url} alt="" className="h-full w-full object-cover" />}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {dockPrompt && (
                  <button
                    type="button"
                    title="复制提示词"
                    onClick={() => void handleCopyPrompt(dockPrompt)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  type="button"
                  title="关闭"
                  onClick={() => setSelectedNodeId(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* 中间可编辑提示词输入框 */}
            <div className="relative">
              <textarea
                rows={3}
                value={dockPrompt}
                onChange={e => setDockPrompt(e.target.value)}
                placeholder={metaLoading ? '正在读取原图提示词…' : '编辑提示词，基于上方参考素材继续生成图片或视频…'}
                className="w-full resize-none rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-primary focus:bg-background"
              />
            </div>

            {/* 底部单行可编辑参数栏：模式 | 模型 | 尺寸 | 画质 | 数量 + 右侧立即生成按钮 */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center rounded-lg bg-muted/70 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleSwitchDockMode('image')}
                    className={cn('rounded-md px-2 py-1 font-medium cursor-pointer', dockMode === 'image' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground')}
                  >
                    生图片
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchDockMode('video')}
                    className={cn('rounded-md px-2 py-1 font-medium cursor-pointer', dockMode === 'video' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground')}
                  >
                    生视频
                  </button>
                </div>

                {/* 模型 */}
                <StudioSelect
                  className="max-w-[175px]"
                  triggerClassName="h-7.5 text-[11px]"
                  menuMinWidth={190}
                  value={dockModel}
                  options={
                    dockMode === 'image'
                      ? (catalog.imageModels.length > 0
                          ? catalog.imageModels.map(m => ({ value: m.model, label: m.displayName || m.model }))
                          : [{ value: dockModel, label: dockModel === 'dreamina-5.0' ? '即梦 5.0 Lite (CLI)' : dockModel }])
                      : (catalog.videoModels.length > 0
                          ? catalog.videoModels.map(m => ({ value: m.name, label: m.description || m.name }))
                          : [{ value: dockModel, label: dockModel }])
                  }
                  onChange={setDockModel}
                />

                {/* 比例/尺寸 */}
                <StudioSelect
                  className="w-[78px]"
                  triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                  value={dockRatio}
                  options={['9:16', '3:4', '1:1', '4:3', '16:9', '21:9'].map(r => ({ value: r, label: r }))}
                  onChange={setDockRatio}
                />

                {/* 画质 */}
                <StudioSelect
                  className="w-[74px]"
                  triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                  value={dockQuality}
                  options={(dockMode === 'image' ? ['2K', '4K'] : ['720p', '1080p']).map(q => ({ value: q, label: q }))}
                  onChange={setDockQuality}
                />

                {/* 生成数量 / 视频时长 */}
                {dockMode === 'image' ? (
                  <StudioSelect
                    className="w-[74px]"
                    triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                    value={String(dockCount)}
                    options={[1, 2, 3, 4].map(c => ({ value: String(c), label: `${c} 张` }))}
                    onChange={val => setDockCount(Number(val))}
                  />
                ) : (
                  <StudioSelect
                    className="w-[74px]"
                    triggerClassName="h-7.5 pl-2.5 pr-2 text-[11px]"
                    value={String(dockDuration)}
                    options={[5, 10].map(d => ({ value: String(d), label: `${d} 秒` }))}
                    onChange={val => setDockDuration(Number(val))}
                  />
                )}

                {typeof selectedMeta?.creditsUsed === 'number' && (
                  <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    {selectedMeta.creditsUsed === 0 && selectedMeta.creditsUnit === 'dreamina' ? '0 积分限免' : `${selectedMeta.creditsUsed} 积分`}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={dockRunning}
                onClick={() => void runSelectedDockGenerate()}
                title="立即生成"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:brightness-110 disabled:opacity-50 cursor-pointer"
              >
                {dockRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        {/* 底部居中主功能栏：生文本 | 生图片 | 生视频 | 上传 | 整理 | 生成历史 | 资产库 */}
        <div
          data-canvas-ui="true"
          className="absolute bottom-3.5 left-1/2 z-25 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border/90 bg-card/96 px-2 py-1.5 shadow-lg backdrop-blur"
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs font-medium hover:bg-muted"
            onClick={() => spawnGeneratorNode('draft', selectedNode?.id)}
          >
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            生文本
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 rounded-xl px-3 text-xs font-semibold"
            onClick={() => spawnGeneratorNode('image', selectedNode?.kind !== 'draft' ? selectedNode?.id : undefined)}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            生图片
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs font-medium hover:bg-muted"
            onClick={() => spawnGeneratorNode('video', selectedNode?.kind !== 'draft' ? selectedNode?.id : undefined)}
          >
            <Film className="h-3.5 w-3.5 text-violet-600" />
            生视频
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            上传
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-xl px-2.5 text-xs"
            onClick={handleAutoArrange}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            整理
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button
            type="button"
            size="sm"
            variant={leftDrawer === 'history' ? 'secondary' : 'ghost'}
            className={cn('h-8 gap-1.5 rounded-xl px-2.5 text-xs', leftDrawer === 'history' && 'bg-primary/12 text-primary')}
            onClick={() => setLeftDrawer(d => (d === 'history' ? null : 'history'))}
          >
            <Clock className="h-3.5 w-3.5" />
            生成历史
          </Button>
          <Button
            type="button"
            size="sm"
            variant={leftDrawer === 'assets' ? 'secondary' : 'ghost'}
            className={cn('h-8 gap-1.5 rounded-xl px-2.5 text-xs', leftDrawer === 'assets' && 'bg-primary/12 text-primary')}
            onClick={() => setLeftDrawer(d => (d === 'assets' ? null : 'assets'))}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            资产库
          </Button>
        </div>

        {/* 左下角：超紧凑迷你缩放条（优化缩小变短，无多余文字） */}
        <div
          data-canvas-ui="true"
          className="absolute bottom-3.5 left-3.5 z-20 flex h-8 items-center gap-0.5 rounded-xl border border-border/90 bg-card/95 px-1 text-[11px] shadow-sm backdrop-blur"
        >
          <button
            type="button"
            title="缩小"
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
            onClick={() => zoomAroundCenter(0.88)}
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="点击重置 100%"
            className="w-9 text-center font-medium tabular-nums hover:text-primary cursor-pointer"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            title="放大"
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
            onClick={() => zoomAroundCenter(1.14)}
          >
            <Plus className="h-3 w-3" />
          </button>
          <div className="mx-0.5 h-3.5 w-px bg-border" />
          <button
            type="button"
            title="适配全图"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            onClick={fitCanvasToContent}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            title={wheelMode === 'pan' ? '当前：触控板平移（点击切滚轮缩放）' : '当前：滚轮缩放（点击切触控板平移）'}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md cursor-pointer',
              wheelMode === 'pan' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onClick={() => setWheelMode(m => (m === 'zoom' ? 'pan' : 'zoom'))}
          >
            {wheelMode === 'pan' ? <Hand className="h-3 w-3" /> : <MousePointerClick className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* 右侧可折叠创作副驾 Agent 抽屉（轻奢玻璃 + 棱镜图标 + 附件/拖拽/@引用 + 文本&视觉双模型切换） */}
      {agentOpen && (
        <CanvasAgentDrawer
          messages={agentMessages}
          input={agentInput}
          onInputChange={setAgentInput}
          busy={agentBusy}
          onSend={override => void sendAgentMessage(override)}
          onResetSession={() => {
            agentAbortRef.current?.()
            setAgentTaskId(undefined)
            setAgentMessages([])
            setAgentAttachments([])
            setAgentInput('')
            setAgentBusy(false)
          }}
          onClose={() => setAgentOpen(false)}
          selectedNode={selectedNode}
          onClearSelectedNode={() => setSelectedNodeId(null)}
          canvasMediaNodes={libraryNodes
            .filter((n): n is typeof n & { kind: 'image' | 'video', url: string } => (n.kind === 'image' || n.kind === 'video') && Boolean(n.url))
            .map(n => ({
              id: n.id,
              kind: n.kind,
              title: n.title,
              url: n.url,
              rawUrl: n.rawUrl,
            }))}
          attachments={agentAttachments}
          onAttachmentsChange={setAgentAttachments}
          textModel={agentTextModel}
          onTextModelChange={setAgentTextModel}
          textModels={catalog.textModels}
          textModelGroups={catalog.textModelGroups}
          imageModels={catalog.imageModels}
          videoModels={catalog.videoModels}
          mediaConfig={agentMediaConfig}
          onMediaConfigChange={setAgentMediaConfig}
          scrollRef={agentScrollRef}
        />
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
