'use client'

import type { DraftTextModelGroup, DraftTextModelOption } from '@/api/ai/ai.api'
import type { ImageModelInfo, VideoModelInfo } from '@/api/ai/ai.types'
import {
  ArrowUp,
  AtSign,
  Check,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  PanelRightClose,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { uploadToOss } from '@/api/materials/material.api'
import { cleanVisualModelLabel, VisualModelIcon } from '@/components/common/ProviderAppIcon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'
import { TextModelPicker } from '../TextModelPicker'

export interface AgentAttachmentItem {
  id: string
  kind: 'image' | 'video'
  title: string
  url: string
  rawUrl?: string
  source: 'local' | 'canvas'
  nodeId?: string
}

export interface AgentMediaConfig {
  activeTab: 'image' | 'video'
  imageModel: string // 'auto' or specific model id
  videoModel: string // 'auto' or specific model id
  aspectRatio: string // 'auto' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  imageQuality: string // 'auto' | '2K' | '4K'
  videoQuality: string // 'auto' | '480p' | '720p' | '1080p'
  videoDuration: number // 5 | 10
}

export interface CanvasAgentMsgItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  tools?: string[]
  mediaUrls?: string[]
  attachments?: AgentAttachmentItem[]
  streaming?: boolean
}

export interface CanvasRefNodeOption {
  id: string
  kind: 'image' | 'video'
  title: string
  url: string
  rawUrl?: string
}

interface CanvasAgentDrawerProps {
  messages: CanvasAgentMsgItem[]
  input: string
  onInputChange: (val: string) => void
  busy: boolean
  onSend: (overrideText?: string) => void
  onResetSession: () => void
  onClose: () => void
  selectedNode?: {
    id: string
    kind: 'image' | 'video' | 'draft'
    title: string
    url?: string
    rawUrl?: string
  } | null
  onClearSelectedNode: () => void
  canvasMediaNodes: CanvasRefNodeOption[]
  attachments: AgentAttachmentItem[]
  onAttachmentsChange: React.Dispatch<React.SetStateAction<AgentAttachmentItem[]>>
  textModel: string
  onTextModelChange: (val: string) => void
  textModels: DraftTextModelOption[]
  textModelGroups: DraftTextModelGroup[]
  imageModels: ImageModelInfo[]
  videoModels: VideoModelInfo[]
  mediaConfig: AgentMediaConfig
  onMediaConfigChange: React.Dispatch<React.SetStateAction<AgentMediaConfig>>
  scrollRef: React.RefObject<HTMLDivElement>
}

/** 定制几何星芒棱镜图标（摆脱生硬机器人图标，契合轻奢浅色玻璃 + 午夜靛紫微光） */
export function AgentPrismMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 2.5L14.35 8.85L20.7 11.2L14.35 13.55L12 19.9L9.65 13.55L3.3 11.2L9.65 8.85L12 2.5Z"
        fill="currentColor"
        fillOpacity="0.95"
      />
      <path
        d="M18.6 3.6L19.45 5.85L21.7 6.7L19.45 7.55L18.6 9.8L17.75 7.55L15.5 6.7L17.75 5.85L18.6 3.6Z"
        fill="currentColor"
        fillOpacity="0.6"
      />
    </svg>
  )
}

const RATIO_PRESETS: Array<{ value: string, label: string, w: number, h: number }> = [
  { value: 'auto', label: '智能', w: 14, h: 14 },
  { value: '21:9', label: '21:9', w: 18, h: 9 },
  { value: '16:9', label: '16:9', w: 17, h: 10 },
  { value: '4:3', label: '4:3', w: 15, h: 11 },
  { value: '1:1', label: '1:1', w: 13, h: 13 },
  { value: '3:4', label: '3:4', w: 11, h: 15 },
  { value: '9:16', label: '9:16', w: 10, h: 17 },
]

const STARTER_MODES = [
  { label: '/ 商业产品场景延伸', prompt: '请基于当前参考图，为该产品延展 3 个高质感商业广告场景构图，保持产品外观一致' },
  { label: '/ 漫剧分镜脚本', prompt: '请为当前画面拆解 4 个连贯的漫剧分镜镜头（含景别、运镜与画面提示词），并生成首镜画面' },
  { label: '/ 图转动态短视频', prompt: '请基于我引用的画面，设计流畅电影感镜头运动并生成一条 5 秒短视频' },
  { label: '/ 小红书爆款笔记', prompt: '请结合参考素材策划一篇小红书高点击种草笔记（含 3 个备选爆款标题、结构化正文与话题标签）' },
]

export function CanvasAgentDrawer({
  messages,
  input,
  onInputChange,
  busy,
  onSend,
  onResetSession,
  onClose,
  selectedNode,
  onClearSelectedNode,
  canvasMediaNodes,
  attachments,
  onAttachmentsChange,
  textModel,
  onTextModelChange,
  textModels,
  textModelGroups,
  imageModels,
  videoModels,
  mediaConfig,
  onMediaConfigChange,
  scrollRef,
}: CanvasAgentDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false)
  const [mediaPanelOpen, setMediaPanelOpen] = useState(false)
  const [uploadingLocal, setUploadingLocal] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const hasUserMessages = messages.some(m => m.role === 'user')

  const handleUploadFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (validFiles.length === 0) {
      toast.warning('请上传图片或视频文件')
      return
    }
    setUploadingLocal(true)
    try {
      const uploaded: AgentAttachmentItem[] = []
      for (const file of validFiles.slice(0, 4)) {
        const path = await uploadToOss(file)
        uploaded.push({
          id: `local:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
          kind: file.type.startsWith('video/') ? 'video' : 'image',
          title: file.name,
          url: getOssUrl(path),
          rawUrl: path,
          source: 'local',
        })
      }
      if (uploaded.length > 0) {
        onAttachmentsChange(prev => [...prev, ...uploaded].slice(-6))
        toast.success(`已添加 ${uploaded.length} 个本地参考附件`)
      }
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '附件上传失败')
    }
    finally {
      setUploadingLocal(false)
    }
  }

  const toggleCanvasAttachment = (node: CanvasRefNodeOption) => {
    onAttachmentsChange((prev) => {
      const exists = prev.some(a => a.nodeId === node.id)
      if (exists) {
        return prev.filter(a => a.nodeId !== node.id)
      }
      return [
        ...prev,
        {
          id: `canvas:${node.id}`,
          kind: node.kind,
          title: node.title,
          url: node.url,
          rawUrl: node.rawUrl,
          source: 'canvas' as const,
          nodeId: node.id,
        },
      ].slice(-6)
    })
  }

  const removeAttachment = (id: string) => {
    onAttachmentsChange(prev => prev.filter(a => a.id !== id))
  }

  const activeVisualSummary = useMemo(() => {
    const isImg = mediaConfig.activeTab === 'image'
    const activeModelId = isImg ? mediaConfig.imageModel : mediaConfig.videoModel
    const modelName = activeModelId === 'auto'
      ? (isImg ? '智能生图' : '智能生视频')
      : isImg
        ? cleanVisualModelLabel(imageModels.find(m => m.model === activeModelId)?.displayName || activeModelId)
        : cleanVisualModelLabel(videoModels.find(m => m.name === activeModelId)?.description || activeModelId)
    const parts = [
      modelName,
      mediaConfig.aspectRatio !== 'auto' ? mediaConfig.aspectRatio : null,
      isImg
        ? (mediaConfig.imageQuality !== 'auto' ? mediaConfig.imageQuality : null)
        : (mediaConfig.videoQuality !== 'auto' ? mediaConfig.videoQuality.toUpperCase() : null),
      !isImg ? `${mediaConfig.videoDuration}s` : null,
    ].filter(Boolean)
    return {
      isImg,
      text: parts.join(' · '),
      customized: activeModelId !== 'auto' || mediaConfig.aspectRatio !== 'auto' || (isImg ? mediaConfig.imageQuality !== 'auto' : mediaConfig.videoQuality !== 'auto'),
    }
  }, [mediaConfig, imageModels, videoModels])

  return (
    <aside
      data-testid="canvas-agent-drawer"
      className="flex w-[372px] shrink-0 flex-col border-l border-border/90 bg-card/92 backdrop-blur-md"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleUploadFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* 顶部栏：定制棱镜星芒徽标 + 创作副驾 + 新建会话 + 收起 */}
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-back text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_-3px_rgba(67,56,202,0.45)]">
            <AgentPrismMark className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold tracking-tight text-foreground">创作副驾</span>
            <span className="rounded-full border border-primary/20 bg-primary/8 px-1.5 py-0 text-[10px] font-medium text-primary">
              Agent
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="开启新会话"
            onClick={onResetSession}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="收起副驾"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 画布当前选中节点快速引用条 */}
      {selectedNode && (
        <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-primary/[0.045] px-3.5 py-2 text-[11px]">
          <div className="flex min-w-0 items-center gap-2">
            {selectedNode.url && selectedNode.kind !== 'draft' && (
              <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                {selectedNode.kind === 'video'
                  ? <video src={selectedNode.url} muted className="h-full w-full object-cover" />
                  : <img src={selectedNode.url} alt="" className="h-full w-full object-cover" />}
              </div>
            )}
            <span className="truncate font-medium text-foreground">
              已选：{selectedNode.title}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {selectedNode.kind !== 'draft' && selectedNode.url && (
              <button
                type="button"
                onClick={() => toggleCanvasAttachment({
                  id: selectedNode.id,
                  kind: selectedNode.kind as 'image' | 'video',
                  title: selectedNode.title,
                  url: selectedNode.url!,
                  rawUrl: selectedNode.rawUrl,
                })}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer',
                  attachments.some(a => a.nodeId === selectedNode.id)
                    ? 'border-primary/30 bg-primary/12 text-primary'
                    : 'border-border bg-background text-foreground hover:border-primary/40 hover:text-primary',
                )}
              >
                <AtSign className="h-2.5 w-2.5" />
                {attachments.some(a => a.nodeId === selectedNode.id) ? '已引用' : '引用'}
              </button>
            )}
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClearSelectedNode}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 对话内容区 / 高级感灵感起始页 */}
      <div ref={scrollRef} data-canvas-scroll="true" className="flex-1 overflow-y-auto px-4 py-4">
        {!hasUserMessages
          ? (
              <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                <div className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-back text-white shadow-[0_12px_28px_-8px_rgba(67,56,202,0.55)]">
                  <AgentPrismMark className="h-6 w-6" />
                  <div className="pointer-events-none absolute -inset-2 -z-10 rounded-3xl bg-primary/15 blur-xl" />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                  探索更多专业创作模式
                </h3>
                <p className="mt-1.5 max-w-[260px] text-xs leading-5 text-muted-foreground">
                  拖入本地参考、点击 @ 引用画布图/视频，或切换文本与视觉模型直接开始创作
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {STARTER_MODES.map(mode => (
                    <button
                      key={mode.label}
                      type="button"
                      onClick={() => onInputChange(mode.prompt)}
                      className="rounded-full border border-border/90 bg-background/85 px-3 py-1.5 text-[11.5px] font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all hover:border-primary/35 hover:bg-primary/[0.05] hover:text-primary cursor-pointer"
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          : (
              <div className="space-y-3.5">
                {messages.filter(m => m.id !== 'welcome').map(msg => (
                  <div key={msg.id} className={cn('flex flex-col gap-1.5', msg.role === 'user' ? 'items-end' : 'items-start')}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1.5 max-w-[92%]">
                        {msg.attachments.map(att => (
                          <div key={att.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/90 p-1 pr-2 text-[10.5px] text-foreground shadow-2xs">
                            <div className="h-6 w-6 shrink-0 overflow-hidden rounded bg-muted">
                              {att.kind === 'video'
                                ? <video src={att.url} muted className="h-full w-full object-cover" />
                                : <img src={att.url} alt="" className="h-full w-full object-cover" />}
                            </div>
                            <span className="max-w-[110px] truncate font-medium">
                              {att.source === 'canvas' ? `@${att.title}` : att.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-gradient-back text-white rounded-tr-sm shadow-sm shadow-primary/20'
                          : 'border border-border/80 bg-background/90 text-foreground rounded-tl-sm shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)]',
                      )}
                    >
                      {msg.tools && msg.tools.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1">
                          {msg.tools.map((toolName, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              <Sparkles className="h-2.5 w-2.5" />
                              {toolName}
                            </span>
                          ))}
                        </div>
                      )}
                      {msg.text || (msg.streaming ? '正在思考与调用工具…' : '已完成')}
                      {msg.streaming && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
                    </div>
                    {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 max-w-[92%]">
                        {msg.mediaUrls.slice(0, 4).map((u, idx) => (
                          <img key={idx} src={u} alt="agent media" className="h-24 w-full rounded-xl border border-border object-cover shadow-xs" />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
      </div>

      {/* 底部一体化轻奢玻璃指令盒：附件缩略图 + 拖拽接收 + 输入框 + (+/-/@/视觉参数/文本模型/发送) */}
      <div className="border-t border-border/80 bg-muted/20 p-3">
        <div
          data-testid="agent-composer-box"
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
            if (e.dataTransfer.files?.length) {
              void handleUploadFiles(e.dataTransfer.files)
            }
          }}
          className={cn(
            'relative rounded-2xl border bg-background/96 p-2.5 transition-all shadow-[0_4px_18px_-10px_rgba(67,56,202,0.18)]',
            dragOver
              ? 'border-primary border-dashed bg-primary/[0.04] ring-2 ring-primary/20'
              : 'border-border/90 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/12',
          )}
        >
          {/* 拖拽提示覆盖层 */}
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/85 backdrop-blur-xs">
              <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary">
                <Upload className="h-3.5 w-3.5" />
                松开即可作为参考附件添加
              </div>
            </div>
          )}

          {/* 已附带的参考图/视频缩略图队列（支持本地上传与画布 @ 引用） */}
          {(attachments.length > 0 || uploadingLocal) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {attachments.map(att => (
                <div
                  key={att.id}
                  data-testid={`agent-attachment-${att.source}`}
                  className="group/att relative flex items-center gap-1.5 rounded-xl border border-border/90 bg-muted/40 p-1 pr-2 text-[11px]"
                >
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-background">
                    {att.kind === 'video'
                      ? (
                          <>
                            <video src={att.url} muted className="h-full w-full object-cover" />
                            <Film className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-white drop-shadow" />
                          </>
                        )
                      : <img src={att.url} alt={att.title} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 max-w-[92px]">
                    <div className="truncate text-[11px] font-medium text-foreground">{att.title}</div>
                    <div className={cn(
                      'text-[9.5px] font-medium',
                      att.source === 'canvas' ? 'text-primary' : 'text-muted-foreground',
                    )}
                    >
                      {att.source === 'canvas' ? '@画布引用' : '本地附件'}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="移除附件"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background opacity-90 hover:bg-destructive cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {uploadingLocal && (
                <div className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-2.5 text-[11px] text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  上传中…
                </div>
              )}
            </div>
          )}

          {/* 指令输入区（支持粘贴图片、键入 @ 自动呼出画布素材引用） */}
          <textarea
            rows={2}
            value={input}
            onChange={(e) => {
              const val = e.target.value
              onInputChange(val)
              if (val.endsWith('@') && canvasMediaNodes.length > 0) {
                setMentionMenuOpen(true)
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files || [])
              if (files.some(f => f.type.startsWith('image/') || f.type.startsWith('video/'))) {
                e.preventDefault()
                void handleUploadFiles(files)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="输入创作想法，拖入素材或输入 @ 引用画布图/视频…"
            className="w-full resize-none bg-transparent px-1 py-0.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/80 outline-none"
          />

          {/* 当前选中的生图/生视频模型参数摘要条（清爽直观） */}
          {activeVisualSummary.customized && (
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-primary/15 bg-primary/[0.045] px-2 py-1 text-[10.5px]">
              <span className="flex min-w-0 items-center gap-1.5 text-primary font-medium truncate">
                {activeVisualSummary.isImg ? <ImageIcon className="h-3 w-3 shrink-0" /> : <Film className="h-3 w-3 shrink-0" />}
                <span className="truncate">{activeVisualSummary.text}</span>
              </span>
              <button
                type="button"
                onClick={() => onMediaConfigChange(prev => ({
                  ...prev,
                  imageModel: 'auto',
                  videoModel: 'auto',
                  aspectRatio: 'auto',
                  imageQuality: 'auto',
                  videoQuality: 'auto',
                }))}
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                重置
              </button>
            </div>
          )}

          {/* 底部富工具栏：+ 附件 | 视觉模型与参数 | @ 画布引用 | 文本模型切换 | 发送 */}
          <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-border/60 pt-2">
            <div className="flex items-center gap-0.5">
              {/* + 附件按钮：支持手动上传本地文件 或 引用画布素材 */}
              <Popover open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-testid="agent-attach-btn"
                    title="添加本地文件或画布参考"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" sideOffset={8} className="w-48 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-primary" />
                    <span>上传本地图片 / 视频</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false)
                      setMentionMenuOpen(true)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
                  >
                    <AtSign className="h-3.5 w-3.5 text-primary" />
                    <span>@ 引用画布素材</span>
                  </button>
                </PopoverContent>
              </Popover>

              {/* 视觉生成模型 & 参数面板（参考即梦双栏结构，升级 PostPilot 轻奢玻璃风） */}
              <Popover open={mediaPanelOpen} onOpenChange={setMediaPanelOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-testid="agent-media-params-btn"
                    title="切换图片/视频生成模型、比例与清晰度"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer',
                      activeVisualSummary.customized || mediaPanelOpen
                        ? 'bg-primary/12 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={10}
                  allowInnerScroll
                  className="w-[min(92vw,512px)] rounded-2xl border border-border bg-popover/98 p-0 shadow-2xl backdrop-blur-md"
                >
                  {/* 顶部 Tab：图片 | 视频 */}
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <div className="flex items-center gap-4">
                      {(['image', 'video'] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          data-testid={`agent-media-tab-${tab}`}
                          onClick={() => onMediaConfigChange(prev => ({ ...prev, activeTab: tab }))}
                          className={cn(
                            'relative pb-1 text-xs font-semibold transition-colors cursor-pointer',
                            mediaConfig.activeTab === tab
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {tab === 'image' ? '图片模型' : '视频模型'}
                          {mediaConfig.activeTab === tab && (
                            <span className="absolute inset-x-0 -bottom-2.5 h-0.5 rounded-full bg-gradient-back" />
                          )}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10.5px] text-muted-foreground">Agent 生成视觉素材时生效</span>
                  </div>

                  {/* 双栏内容：左列模型列表 | 右列画幅比例 + 清晰度/时长 */}
                  <div className="grid grid-cols-1 sm:grid-cols-[215px_1fr]">
                    {/* 左侧视觉模型列表 */}
                    <div className="max-h-[268px] overflow-y-auto border-b border-border/80 p-2 sm:border-b-0 sm:border-r space-y-1">
                      <button
                        type="button"
                        onClick={() => onMediaConfigChange(prev => (
                          prev.activeTab === 'image'
                            ? { ...prev, imageModel: 'auto' }
                            : { ...prev, videoModel: 'auto' }
                        ))}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                          (mediaConfig.activeTab === 'image' ? mediaConfig.imageModel : mediaConfig.videoModel) === 'auto'
                            ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/20'
                            : 'text-foreground hover:bg-muted/70',
                        )}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          <span>智能默认模型</span>
                        </span>
                        {(mediaConfig.activeTab === 'image' ? mediaConfig.imageModel : mediaConfig.videoModel) === 'auto' && (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>

                      {mediaConfig.activeTab === 'image'
                        ? imageModels.map((m) => {
                            const active = mediaConfig.imageModel === m.model
                            return (
                              <button
                                key={m.model}
                                type="button"
                                onClick={() => onMediaConfigChange(prev => ({ ...prev, imageModel: m.model }))}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                                  active
                                    ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/20'
                                    : 'text-foreground hover:bg-muted/70',
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <VisualModelIcon modelId={m.model} label={m.displayName} size={20} />
                                  <span className="truncate">{cleanVisualModelLabel(m.displayName || m.model)}</span>
                                </span>
                                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </button>
                            )
                          })
                        : videoModels.map((m) => {
                            const active = mediaConfig.videoModel === m.name
                            return (
                              <button
                                key={m.name}
                                type="button"
                                onClick={() => onMediaConfigChange(prev => ({ ...prev, videoModel: m.name }))}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer',
                                  active
                                    ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/20'
                                    : 'text-foreground hover:bg-muted/70',
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <VisualModelIcon modelId={m.name} label={m.description} size={20} />
                                  <span className="truncate">{cleanVisualModelLabel(m.description || m.name)}</span>
                                </span>
                                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                              </button>
                            )
                          })}
                    </div>

                    {/* 右侧可视化画幅比例 + 清晰度/时长 */}
                    <div className="space-y-4 p-3.5">
                      <div>
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground">画面比例</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {RATIO_PRESETS.map((r) => {
                            const active = mediaConfig.aspectRatio === r.value
                            return (
                              <button
                                key={r.value}
                                type="button"
                                onClick={() => onMediaConfigChange(prev => ({ ...prev, aspectRatio: r.value }))}
                                className={cn(
                                  'flex flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[10.5px] font-medium transition-all cursor-pointer',
                                  active
                                    ? 'border-primary/45 bg-primary/10 text-primary shadow-2xs'
                                    : 'border-border/70 bg-muted/25 text-muted-foreground hover:border-border hover:text-foreground',
                                )}
                              >
                                <span
                                  className={cn(
                                    'inline-block rounded-[3px] border-[1.5px]',
                                    active ? 'border-primary' : 'border-muted-foreground/60',
                                  )}
                                  style={{ width: r.w, height: r.h }}
                                />
                                <span>{r.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground">清晰度</div>
                        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted/50 p-1">
                          {(mediaConfig.activeTab === 'image'
                            ? [{ value: 'auto', label: '智能' }, { value: '2K', label: '2K 高清' }, { value: '4K', label: '4K 超清' }]
                            : [{ value: 'auto', label: '智能' }, { value: '720p', label: '720P' }, { value: '1080p', label: '1080P' }]
                          ).map((q) => {
                            const cur = mediaConfig.activeTab === 'image' ? mediaConfig.imageQuality : mediaConfig.videoQuality
                            const active = cur === q.value
                            return (
                              <button
                                key={q.value}
                                type="button"
                                onClick={() => onMediaConfigChange(prev => (
                                  prev.activeTab === 'image'
                                    ? { ...prev, imageQuality: q.value }
                                    : { ...prev, videoQuality: q.value }
                                ))}
                                className={cn(
                                  'rounded-lg py-1.5 text-[11px] font-medium transition-all cursor-pointer',
                                  active
                                    ? 'bg-gradient-back text-white shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {q.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {mediaConfig.activeTab === 'video' && (
                        <div>
                          <div className="mb-2 text-[11px] font-medium text-muted-foreground">视频时长</div>
                          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/50 p-1">
                            {[5, 10].map(sec => (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => onMediaConfigChange(prev => ({ ...prev, videoDuration: sec }))}
                                className={cn(
                                  'rounded-lg py-1.5 text-[11px] font-medium transition-all cursor-pointer',
                                  mediaConfig.videoDuration === sec
                                    ? 'bg-gradient-back text-white shadow-xs'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {sec} 秒
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* @ 画布素材引用菜单（点击直接选画布上的图片或视频） */}
              <Popover open={mentionMenuOpen} onOpenChange={setMentionMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-testid="agent-mention-btn"
                    title="引用画布上的图片或视频（@）"
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer',
                      attachments.some(a => a.source === 'canvas') || mentionMenuOpen
                        ? 'bg-primary/12 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <AtSign className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  allowInnerScroll
                  className="w-72 rounded-2xl border border-border bg-popover p-2 shadow-xl"
                >
                  <div className="mb-1.5 flex items-center justify-between px-1.5">
                    <span className="text-[11px] font-semibold text-foreground">引用画布图片 / 视频</span>
                    <span className="text-[10px] text-muted-foreground">支持多选参考</span>
                  </div>
                  {canvasMediaNodes.length > 0
                    ? (
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {canvasMediaNodes.map((node) => {
                            const picked = attachments.some(a => a.nodeId === node.id)
                            return (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => toggleCanvasAttachment(node)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-xl border p-1.5 text-left transition-colors cursor-pointer',
                                  picked
                                    ? 'border-primary/40 bg-primary/8'
                                    : 'border-transparent hover:bg-muted/70',
                                )}
                              >
                                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                  {node.kind === 'video'
                                    ? <video src={node.url} muted className="h-full w-full object-cover" />
                                    : <img src={node.url} alt={node.title} className="h-full w-full object-cover" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-foreground">{node.title}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {node.kind === 'video' ? '视频节点' : '图片节点'}
                                  </div>
                                </div>
                                {picked && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                              </button>
                            )
                          })}
                        </div>
                      )
                    : (
                        <div className="py-4 text-center text-xs text-muted-foreground">
                          画布上暂无图片或视频素材
                        </div>
                      )}
                </PopoverContent>
              </Popover>
            </div>

            {/* 右侧：分组文本大模型切换器 + 发送按钮 */}
            <div className="flex min-w-0 items-center gap-1.5">
              <TextModelPicker
                variant="compact"
                value={textModel}
                models={textModels}
                groups={textModelGroups}
                onChange={onTextModelChange}
                triggerClassName="max-w-[152px] h-7 rounded-lg bg-muted/40 border-border/80"
                side="top"
                align="end"
                testId="agent-text-model-picker"
              />
              <button
                type="button"
                data-testid="agent-send-btn"
                disabled={busy || (!input.trim() && attachments.length === 0)}
                onClick={() => onSend()}
                title="发送指令"
                className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-gradient-back text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_12px_-3px_rgba(67,56,202,0.5)] transition-all hover:brightness-110 disabled:opacity-40 cursor-pointer"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
