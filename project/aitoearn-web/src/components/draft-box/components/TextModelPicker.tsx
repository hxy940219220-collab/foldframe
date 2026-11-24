'use client'

import type {
  DraftTextModelEffortLevel,
  DraftTextModelGroup,
  DraftTextModelGroupId,
  DraftTextModelOption,
} from '@/api/ai/ai.api'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Gauge,
  Info,
  KeyRound,
  Layers,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProviderAppIcon } from '@/components/common/ProviderAppIcon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/utils/className'

export interface TextModelPickerProps {
  value: string
  models: DraftTextModelOption[]
  groups?: DraftTextModelGroup[]
  onChange: (nextModel: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: 'pill' | 'field' | 'compact'
  triggerClassName?: string
  side?: 'top' | 'bottom'
  align?: 'start' | 'end'
  testId?: string
  /** 是否使用极简触发器（不展示厂商图标/前缀，仅展示模型名与思考强度），默认 true */
  minimalTrigger?: boolean
  /** 点开后鼠标移出选择区是否自动收起，默认 true */
  autoCloseOnMouseLeave?: boolean
}

const DEFAULT_GROUPS: DraftTextModelGroup[] = [
  { id: 'agy', label: 'Antigravity', subtitle: '本机多模态直连', kind: 'local', ready: false, modelCount: 0 },
  { id: 'codex', label: 'Codex', subtitle: 'ChatGPT 账号直连', kind: 'local', ready: false, modelCount: 0 },
  { id: 'grok', label: 'Grok', subtitle: 'xAI 网页授权', kind: 'local', ready: false, modelCount: 0 },
  { id: 'workbuddy', label: 'WorkBuddy', subtitle: '国产最新多模型', kind: 'local', ready: false, modelCount: 0 },
  { id: 'thirdParty', label: '第三方 API', subtitle: '自配 Key 接口', kind: 'api', ready: false, modelCount: 0 },
]

const EFFORT_LABEL_MAP: Record<DraftTextModelEffortLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
}

const HOVER_OPEN_DELAY_MS = 500
const HOVER_CLOSE_GRACE_MS = 220
const POPOVER_MOUSE_LEAVE_CLOSE_MS = 340

function cleanMinimalModelName(raw: string): string {
  return raw
    .replace(/^(?:Antigravity|Codex|Grok|WorkBuddy|第三方\s*API)\s*[·:\-]\s*/i, '')
    .replace(/\s*CLI\b/gi, '')
    .trim()
}

function inferGroupId(opt: DraftTextModelOption): DraftTextModelGroupId {
  if (opt.groupId) return opt.groupId
  const v = opt.value.toLowerCase()
  if (opt.provider === 'agy' || v.startsWith('agy:')) return 'agy'
  if (opt.provider === 'codex' || v.startsWith('codex:')) return 'codex'
  if (opt.provider === 'grok' || v.startsWith('grok:')) return 'grok'
  if (opt.provider === 'workbuddy' || v.startsWith('workbuddy:')) return 'workbuddy'
  return 'thirdParty'
}

function findMatchedSelection(models: DraftTextModelOption[], value: string): {
  model?: DraftTextModelOption
  effortLevel?: DraftTextModelEffortLevel
} {
  for (const m of models) {
    if (m.value === value) {
      const matchedEffort = m.effortOptions?.find(e => e.value === value)?.level
      return { model: m, effortLevel: matchedEffort }
    }
    const effortHit = m.effortOptions?.find(e => e.value === value)
    if (effortHit) {
      return { model: m, effortLevel: effortHit.level }
    }
  }
  return {}
}

function formatTierBadgeStyle(tierBadge?: string) {
  if (!tierBadge) return 'bg-muted text-muted-foreground border-border/60'
  if (tierBadge.includes('免费')) {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
  }
  if (tierBadge.includes('旗舰') || tierBadge.includes('智能')) {
    return 'bg-primary/10 text-primary border-primary/20'
  }
  if (tierBadge.includes('API')) {
    return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
  }
  return 'bg-muted text-muted-foreground border-border/60'
}

/**
 * TextModelPicker - 逐层渐进式文本模型切换器（零闪烁）
 * Layer 1: 选择模型厂商/渠道（本机直连 + 第三方 API）
 * Layer 2: 浏览该厂商的精简模型列表，直接点击即选中
 * Layer 3: 鼠标悬停 0.5 秒 或 点击右侧参数图标，查看上下文/消耗倍率并切换思考强度
 */
export function TextModelPicker({
  value,
  models,
  groups,
  onChange,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  variant = 'pill',
  triggerClassName,
  side = 'top',
  align = 'start',
  testId = 'draftbox-ai-text-model',
  minimalTrigger = true,
  autoCloseOnMouseLeave = true,
}: TextModelPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = useCallback((next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next)
    else setInternalOpen(next)
  }, [controlledOnOpenChange])

  const triggerRef = useRef<HTMLButtonElement>(null)
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPopoverAutoClose = useCallback(() => {
    if (popoverAutoCloseTimerRef.current) {
      clearTimeout(popoverAutoCloseTimerRef.current)
      popoverAutoCloseTimerRef.current = null
    }
  }, [])

  const schedulePopoverAutoClose = useCallback(() => {
    if (!autoCloseOnMouseLeave) return
    cancelPopoverAutoClose()
    popoverAutoCloseTimerRef.current = setTimeout(() => {
      setOpen(false)
      popoverAutoCloseTimerRef.current = null
    }, POPOVER_MOUSE_LEAVE_CLOSE_MS)
  }, [autoCloseOnMouseLeave, cancelPopoverAutoClose, setOpen])

  const clearHoverTimers = useCallback(() => {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current)
      hoverOpenTimerRef.current = null
    }
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    cancelPopoverAutoClose()
  }, [cancelPopoverAutoClose])

  // Progressive step: null = Layer 1 (provider list), GroupId = Layer 2 (models of that provider)
  const [drillGroupId, setDrillGroupId] = useState<DraftTextModelGroupId | null>(null)
  // Layer 3 inspector: only opens after 500ms hover OR explicit click on info/params button
  const [inspectedValue, setInspectedValue] = useState<string | null>(null)
  const [pinnedInspector, setPinnedInspector] = useState(false)
  const [inspectorSide, setInspectorSide] = useState<'right' | 'left'>('right')

  const effectiveModels = useMemo<DraftTextModelOption[]>(() => (
    models.length > 0
      ? models
      : [{
          value: 'agy:default',
          label: 'Antigravity (自动默认)',
          shortLabel: '自动默认',
          provider: 'agy',
          groupId: 'agy',
          groupLabel: 'Antigravity',
          tag: '本机 LLM',
          tierBadge: '默认推荐',
          costRate: '本机订阅 · 0 平台积分',
          costShort: '0 积分',
          contextWindow: '1M',
          supportsImages: true,
          supportsReasoning: true,
        }]
  ), [models])

  const groupedModels = useMemo(() => {
    const map: Record<DraftTextModelGroupId, DraftTextModelOption[]> = {
      agy: [],
      codex: [],
      grok: [],
      workbuddy: [],
      thirdParty: [],
    }
    for (const m of effectiveModels) {
      map[inferGroupId(m)].push(m)
    }
    return map
  }, [effectiveModels])

  const effectiveGroups = useMemo<DraftTextModelGroup[]>(() => {
    const base = (groups && groups.length > 0) ? groups : DEFAULT_GROUPS
    return base.map(g => ({
      ...g,
      subtitle: g.subtitle.replace(/\s*CLI\b/gi, ''),
      ready: (groupedModels[g.id]?.length ?? 0) > 0,
      modelCount: groupedModels[g.id]?.length ?? g.modelCount,
    }))
  }, [groups, groupedModels])

  const matched = useMemo(() => findMatchedSelection(effectiveModels, value), [effectiveModels, value])
  const selectedGroupId: DraftTextModelGroupId = matched.model ? inferGroupId(matched.model) : 'agy'

  useEffect(() => {
    if (open) {
      // Always start cleanly at Layer 1 (provider selection) — zero overwhelming wall of models, zero flicker!
      setDrillGroupId(null)
      setInspectedValue(null)
      setPinnedInspector(false)
      clearHoverTimers()

      if (typeof window !== 'undefined' && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const panelWidth = 328
        const inspectorWidth = 272
        const anchorLeft = align === 'end' ? rect.right - panelWidth : rect.left
        const hasRightRoom = anchorLeft + panelWidth + inspectorWidth + 20 <= window.innerWidth
        setInspectorSide(hasRightRoom ? 'right' : 'left')
      }
    }
    else {
      clearHoverTimers()
      setInspectedValue(null)
      setPinnedInspector(false)
    }
  }, [open, align, clearHoverTimers])

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers])

  const activeGroup = drillGroupId
    ? effectiveGroups.find(g => g.id === drillGroupId) || effectiveGroups[0]
    : null
  const activeModels = drillGroupId ? (groupedModels[drillGroupId] || []) : []
  const inspectedModel = useMemo(
    () => (inspectedValue ? activeModels.find(m => m.value === inspectedValue) || null : null),
    [activeModels, inspectedValue],
  )

  const localGroups = effectiveGroups.filter(g => g.kind === 'local')
  const apiGroups = effectiveGroups.filter(g => g.kind === 'api')

  const triggerModelName = useMemo(() => {
    if (matched.model) {
      if (minimalTrigger) {
        return cleanMinimalModelName(matched.model.shortLabel || matched.model.label)
      }
      return matched.model.label.replace(/\s*CLI\b/gi, '')
    }
    const fallback = (value || '自动默认').replace(/\s*CLI\b/gi, '')
    return minimalTrigger ? cleanMinimalModelName(fallback) : fallback
  }, [matched, value, minimalTrigger])

  const triggerEffortLabel = useMemo(() => {
    const level = matched.effortLevel || matched.model?.defaultEffort
    return level ? EFFORT_LABEL_MAP[level] : null
  }, [matched])

  const handleSelectModel = (nextVal: string) => {
    clearHoverTimers()
    onChange(nextVal)
    setOpen(false)
  }

  // Debounced 500ms hover intent: passing cursor quickly across items NEVER flickers!
  const handleModelMouseEnter = (modelVal: string) => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
    if (pinnedInspector) return
    if (inspectedValue === modelVal) return
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current)
    }
    hoverOpenTimerRef.current = setTimeout(() => {
      setInspectedValue(modelVal)
      hoverOpenTimerRef.current = null
    }, HOVER_OPEN_DELAY_MS)
  }

  const handleModelMouseLeave = () => {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current)
      hoverOpenTimerRef.current = null
    }
    if (pinnedInspector) return
    hoverCloseTimerRef.current = setTimeout(() => {
      setInspectedValue(null)
      hoverCloseTimerRef.current = null
    }, HOVER_CLOSE_GRACE_MS)
  }

  const handleInspectorMouseEnter = () => {
    if (hoverCloseTimerRef.current) {
      clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }

  const handleInspectorMouseLeave = () => {
    if (pinnedInspector) return
    hoverCloseTimerRef.current = setTimeout(() => {
      setInspectedValue(null)
      hoverCloseTimerRef.current = null
    }, HOVER_CLOSE_GRACE_MS)
  }

  const handleTogglePinInspect = (e: React.MouseEvent, modelVal: string) => {
    e.stopPropagation()
    clearHoverTimers()
    if (inspectedValue === modelVal && pinnedInspector) {
      setPinnedInspector(false)
      setInspectedValue(null)
    }
    else {
      setInspectedValue(modelVal)
      setPinnedInspector(true)
    }
  }

  const triggerClasses = variant === 'field'
    ? cn(
        'flex h-8.5 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-xs text-foreground transition-colors hover:border-primary/40 focus:outline-none cursor-pointer',
        triggerClassName,
      )
    : variant === 'compact'
      ? cn(
          'flex h-7.5 w-full items-center justify-between gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] text-foreground transition-colors hover:border-primary/40 focus:outline-none cursor-pointer',
          triggerClassName,
        )
      : cn(
          'inline-flex h-8 max-w-[230px] items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-primary/35 hover:bg-muted/50 cursor-pointer',
          triggerClassName,
        )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          data-testid={testId}
          type="button"
          className={triggerClasses}
          onMouseEnter={cancelPopoverAutoClose}
          onMouseLeave={() => {
            if (open) schedulePopoverAutoClose()
          }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {!minimalTrigger && <ProviderAppIcon provider={selectedGroupId} size={18} />}
            <span className="truncate">{triggerModelName}</span>
            {triggerEffortLabel && (
              <span
                data-testid={`${testId}-effort`}
                className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-semibold leading-4 text-primary"
              >
                {triggerEffortLabel}
              </span>
            )}
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        data-testid={`${testId}-popover`}
        className={cn(
          'relative overflow-visible rounded-2xl border border-border bg-popover p-0 shadow-2xl transition-[width] duration-150',
          drillGroupId ? 'w-[min(92vw,328px)]' : 'w-[min(92vw,300px)]',
        )}
        side={side}
        align={align}
        sideOffset={6}
        allowInnerScroll
        onMouseEnter={cancelPopoverAutoClose}
        onMouseLeave={schedulePopoverAutoClose}
      >
        {!drillGroupId
          ? (
              /* ==================== Layer 1：先选模型厂商 / 渠道（清爽不拥挤） ==================== */
              <div>
                <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-foreground">选择模型来源</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    第 1 步 · 选厂商
                  </span>
                </div>

                <div className="p-2 space-y-1">
                  <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    本机直连账号
                  </div>
                  {localGroups.map((group) => {
                    const isCurrentGroup = group.id === selectedGroupId
                    return (
                      <button
                        key={group.id}
                        type="button"
                        data-testid={`model-group-${group.id}`}
                        onClick={() => {
                          clearHoverTimers()
                          setInspectedValue(null)
                          setPinnedInspector(false)
                          setDrillGroupId(group.id)
                        }}
                        className={cn(
                          'group flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer',
                          isCurrentGroup
                            ? 'bg-primary/[0.07] text-foreground ring-1 ring-primary/20'
                            : 'text-foreground hover:bg-muted/75',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProviderAppIcon provider={group.id} size={30} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground">{group.label}</span>
                              {group.ready && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                            </div>
                            <div className="truncate text-[10.5px] text-muted-foreground">{group.subtitle}</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {group.modelCount}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    )
                  })}

                  <div className="my-1.5 h-px bg-border/80" />

                  <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    第三方 API
                  </div>
                  {apiGroups.map((group) => {
                    const isCurrentGroup = group.id === selectedGroupId
                    return (
                      <button
                        key={group.id}
                        type="button"
                        data-testid={`model-group-${group.id}`}
                        onClick={() => {
                          clearHoverTimers()
                          setInspectedValue(null)
                          setPinnedInspector(false)
                          setDrillGroupId(group.id)
                        }}
                        className={cn(
                          'group flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer',
                          isCurrentGroup
                            ? 'bg-primary/[0.07] text-foreground ring-1 ring-primary/20'
                            : 'text-foreground hover:bg-muted/75',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProviderAppIcon provider={group.id} size={30} />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">{group.label}</div>
                            <div className="truncate text-[10.5px] text-muted-foreground">
                              {group.modelCount > 0 ? `已接入 ${group.modelCount} 个接口模型` : 'OpenAI / DeepSeek / Claude / Gemini'}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={cn(
                            'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                            group.modelCount > 0 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground',
                          )}
                          >
                            {group.modelCount > 0 ? group.modelCount : '去配置'}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="border-t border-border bg-muted/20 px-3.5 py-2">
                  <Link
                    href="/models"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3 w-3" />
                      <span>管理模型接入与第三方 API</span>
                    </span>
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )
          : (
              /* ==================== Layer 2：该厂商下的模型列表（点选即用 + 0.5s悬停/点击查详情） ==================== */
              <div>
                <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
                  <button
                    type="button"
                    data-testid="model-picker-back"
                    onClick={() => {
                      clearHoverTimers()
                      setInspectedValue(null)
                      setPinnedInspector(false)
                      setDrillGroupId(null)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    {activeGroup && <ProviderAppIcon provider={activeGroup.id} size={18} />}
                    <span>{activeGroup?.label}</span>
                  </button>
                  <span className="pr-1 text-[10px] text-muted-foreground">
                    悬停 0.5s 或点右侧看详情
                  </span>
                </div>

                {activeModels.length > 0
                  ? (
                      <div className="max-h-[330px] overflow-y-auto p-1.5 space-y-0.5">
                        {activeModels.map((opt) => {
                          const isSelected = opt.value === value || Boolean(opt.effortOptions?.some(e => e.value === value))
                          const activeEffort = opt.effortOptions?.find(e => e.value === value)?.level
                          const isInspected = inspectedValue === opt.value
                          return (
                            <div
                              key={opt.value}
                              onMouseEnter={() => handleModelMouseEnter(opt.value)}
                              onMouseLeave={handleModelMouseLeave}
                              className={cn(
                                'group flex w-full items-center gap-1 rounded-xl px-2 py-1.5 transition-colors',
                                isSelected
                                  ? 'bg-primary/[0.08] ring-1 ring-primary/20'
                                  : isInspected
                                    ? 'bg-muted/80'
                                    : 'hover:bg-muted/55',
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectModel(opt.value)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs cursor-pointer"
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                  <span className={cn('truncate', isSelected ? 'font-semibold text-primary' : 'font-medium text-foreground')}>
                                    {opt.shortLabel || opt.label}
                                  </span>
                                  {opt.tierBadge && (opt.tierBadge.includes('免费') || opt.tierBadge.includes('旗舰') || opt.tierBadge.includes('API')) && (
                                    <span className={cn('shrink-0 rounded-full border px-1.5 py-0 text-[9.5px] leading-4 font-medium', formatTierBadgeStyle(opt.tierBadge))}>
                                      {opt.tierBadge.replace(' API', '')}
                                    </span>
                                  )}
                                  {isSelected && activeEffort && (
                                    <span className="shrink-0 rounded bg-gradient-back px-1.5 py-0 text-[9.5px] leading-4 text-white">
                                      {EFFORT_LABEL_MAP[activeEffort]}
                                    </span>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {opt.costShort && (
                                    <span className={cn(
                                      'text-[10.5px] tabular-nums',
                                      opt.costShort === '0.00x' ? 'font-medium text-emerald-600' : 'text-muted-foreground',
                                    )}
                                    >
                                      {opt.costShort}
                                    </span>
                                  )}
                                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                                </div>
                              </button>

                              {/* 点击查看详情 & 思考强度按钮（手机/精确点击党友好，零闪烁） */}
                              <button
                                type="button"
                                data-testid={`inspect-model-${opt.value}`}
                                title="查看模型参数与思考强度"
                                onClick={e => handleTogglePinInspect(e, opt.value)}
                                className={cn(
                                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors cursor-pointer',
                                  isInspected
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground/50 hover:bg-background hover:text-foreground',
                                )}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  : (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/50">
                          <KeyRound className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          {drillGroupId === 'thirdParty' ? '暂未配置第三方 API Key' : `${activeGroup?.label} 暂未登录`}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {drillGroupId === 'thirdParty'
                            ? '填入自有 Key 即可直接调用国内外主流云端模型。'
                            : '前往模型接入页一键网页登录即可自动同步。'}
                        </p>
                        {drillGroupId === 'thirdParty' && (
                          <div className="mt-2.5 flex flex-wrap justify-center gap-1">
                            {['DeepSeek', 'OpenAI', 'Anthropic', 'Gemini', '硅基流动', 'OpenRouter'].map(p => (
                              <span key={p} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                        <Link
                          href="/models"
                          onClick={() => setOpen(false)}
                          className="mt-3.5 inline-flex items-center gap-1 rounded-lg bg-gradient-back px-3.5 py-1.5 text-[11px] font-medium text-white shadow-sm shadow-primary/25 transition-all hover:brightness-110"
                        >
                          <span>{drillGroupId === 'thirdParty' ? '前往接入第三方 API' : '前往登录账号'}</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    )}

                <div className="border-t border-border bg-muted/20 px-3 py-2">
                  <Link
                    href="/models"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3 w-3" />
                      <span>管理模型接入与第三方 API</span>
                    </span>
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>

                {/* ==================== Layer 3：侧边详情卡（仅在悬停 0.5s 或点击详情后浮出，零闪烁） ==================== */}
                {inspectedModel && (
                  <div
                    data-testid="model-hover-inspector"
                    onMouseEnter={handleInspectorMouseEnter}
                    onMouseLeave={handleInspectorMouseLeave}
                    className={cn(
                      'absolute top-0 z-50 w-[264px] rounded-2xl border border-border bg-popover p-3.5 shadow-2xl animate-in fade-in-0 duration-150',
                      inspectorSide === 'right' ? 'left-[calc(100%+8px)]' : 'right-[calc(100%+8px)]',
                    )}
                  >
                    {/* 无缝鼠标桥接带 */}
                    <div
                      className={cn(
                        'absolute top-0 bottom-0 w-3',
                        inspectorSide === 'right' ? '-left-3' : '-right-3',
                      )}
                    />

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {inspectedModel.shortLabel || inspectedModel.label}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                          {inspectedModel.groupLabel || activeGroup?.label}
                        </div>
                      </div>
                      {inspectedModel.tierBadge && (
                        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium', formatTierBadgeStyle(inspectedModel.tierBadge))}>
                          {inspectedModel.tierBadge}
                        </span>
                      )}
                    </div>

                    {inspectedModel.description && (
                      <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">
                        {inspectedModel.description}
                      </p>
                    )}

                    <div className="my-3 h-px bg-border" />

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">消耗比例</span>
                        <span className={cn(
                          'font-medium tabular-nums',
                          inspectedModel.costRate?.includes('免费') ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                        )}
                        >
                          {inspectedModel.costRate || '本机直连 · 0 积分'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">上下文窗口</span>
                        <span className="font-medium tabular-nums text-foreground">
                          {inspectedModel.contextWindow || '256K'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">视觉识图</span>
                        <span className="font-medium text-foreground">
                          {inspectedModel.supportsImages === false ? '仅文本' : '支持识图'}
                        </span>
                      </div>

                      <div className="pt-1">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Gauge className="h-3 w-3" />
                            <span>思考强度</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {inspectedModel.effortOptions?.length ? '点击立即切换' : '自适应'}
                          </span>
                        </div>
                        {inspectedModel.effortOptions && inspectedModel.effortOptions.length > 0
                          ? (
                              <div
                                className={cn(
                                  'grid gap-1 rounded-lg bg-muted/60 p-1',
                                  inspectedModel.effortOptions.length === 2
                                    ? 'grid-cols-2'
                                    : inspectedModel.effortOptions.length === 3
                                      ? 'grid-cols-3'
                                      : 'grid-cols-4',
                                )}
                              >
                                {inspectedModel.effortOptions.map((eff) => {
                                  const isCurrentEffort = value === eff.value
                                    || (value === inspectedModel.value && eff.level === inspectedModel.defaultEffort)
                                  return (
                                    <button
                                      key={eff.level}
                                      type="button"
                                      data-testid={`effort-option-${eff.level}`}
                                      onClick={() => handleSelectModel(eff.value)}
                                      className={cn(
                                        'rounded-md py-1 text-[11px] font-medium transition-all cursor-pointer',
                                        isCurrentEffort
                                          ? 'bg-gradient-back text-white shadow-sm shadow-primary/25'
                                          : 'text-muted-foreground hover:bg-background hover:text-foreground',
                                      )}
                                    >
                                      {eff.label}
                                    </button>
                                  )
                                })}
                              </div>
                            )
                          : (
                              <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                                该模型使用内置自适应推理强度
                              </div>
                            )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
      </PopoverContent>
    </Popover>
  )
}
