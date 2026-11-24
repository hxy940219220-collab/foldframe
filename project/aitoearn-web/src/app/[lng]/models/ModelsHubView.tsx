'use client'

import type {
  ConnectionTestResult,
  LocalEngineInfo,
  StudioModelsHubConfig,
  StudioModelsHubResponse,
} from '@/api/studio-models'
import type { WizardAuthKind, WizardModalState } from './LocalAuthWizardDialog'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Film,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  LogIn,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  getStudioModelsHubApi,
  logoutDreaminaAuthApi,
  saveStudioModelsHubApi,
  testStudioModelConnectionApi,
} from '@/api/studio-models'
import { ProviderAppIcon } from '@/components/common/ProviderAppIcon'
import { StudioSelect } from '@/components/draft-box/components/StudioModes/StudioSelect'
import type { StudioSelectOption } from '@/components/draft-box/components/StudioModes/StudioSelect'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfigManagerDialogStore } from '@/store/configManagerDialog'
import { cn } from '@/utils/className'
import { toast } from '@/utils/ui/toast'
import { LocalAuthWizardDialog } from './LocalAuthWizardDialog'

const DREAMINA_IMAGE_OPTIONS = [
  { value: 'dreamina-5.0', label: '即梦 5.0 Lite（推荐 · 2K/4K）' },
  { value: 'dreamina-5.0-pro', label: '即梦 5.0 Pro（1.5K/2K/4K）' },
  { value: 'dreamina-4.7', label: '即梦 4.7（2K/4K）' },
  { value: 'dreamina-4.5', label: '即梦 4.5（2K/4K）' },
]

const DREAMINA_VIDEO_OPTIONS = [
  { value: 'dreamina-seedance-2.0-fast', label: 'Seedance 2.0 Fast（推荐 · 720p）' },
  { value: 'dreamina-seedance-2.0', label: 'Seedance 2.0（720p）' },
  { value: 'dreamina-seedance-2.0-fast-vip', label: 'Seedance 2.0 Fast VIP（720p）' },
  { value: 'dreamina-seedance-2.0-vip', label: 'Seedance 2.0 VIP（1080p/4K）' },
  { value: 'dreamina-seedance-2.5', label: 'Seedance 2.5 VIP（1080p · 最长 30s）' },
  { value: 'dreamina-seedance-2.0-mini', label: 'Seedance 2.0 Mini（720p）' },
]

const THIRD_PARTY_VIDEO_CHANNELS = [
  { value: 'volcengine', label: '火山方舟（豆包 Seedance）' },
  { value: 'dashscope', label: '阿里百炼（通义万相）' },
  { value: 'grok', label: 'Grok Video' },
  { value: 'openai', label: 'OpenAI Sora' },
  { value: 'relay', label: '聚合中转（Relay）' },
] as const

interface ThirdPartyPreset {
  id: string
  label: string
  protocol: 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'gemini'
  baseUrl: string
  model: string
  providerField: 'openai' | 'anthropic' | 'gemini'
}

const THIRD_PARTY_PRESETS: ThirdPartyPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', protocol: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', providerField: 'openai' },
  { id: 'siliconflow', label: '硅基流动', protocol: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', providerField: 'openai' },
  { id: 'zhipu', label: '智谱 GLM', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7', providerField: 'openai' },
  { id: 'qwen', label: '通义千问', protocol: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', providerField: 'openai' },
  { id: 'openai', label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', providerField: 'openai' },
  { id: 'anthropic', label: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6', providerField: 'anthropic' },
  { id: 'gemini', label: 'Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', providerField: 'gemini' },
  { id: 'openrouter', label: 'OpenRouter', protocol: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4', providerField: 'openai' },
]

const AGENT_PROTOCOL_OPTIONS: StudioSelectOption[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'gemini', label: 'Google Gemini' },
]

const PLANNER_CHANNEL_OPTIONS: StudioSelectOption[] = [
  { value: 'openai', label: 'OpenAI / 兼容中转' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'deepseek', label: 'DeepSeek' },
]

const CUSTOM_SENTINEL = '__custom__'

type ThinkingEffort = 'low' | 'medium' | 'high' | 'xhigh'

const EFFORT_ORDER: ThinkingEffort[] = ['low', 'medium', 'high', 'xhigh']

const EFFORT_LABELS: Record<ThinkingEffort, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
}

function formatFriendlyBaseModelLabel(
  engine: 'agy' | 'codex' | 'grok' | 'workbuddy',
  baseId: string,
  modelLabels?: Record<string, string>,
  effectiveDefault?: string,
): string {
  if (baseId === 'default') {
    return effectiveDefault ? `自动默认（${effectiveDefault}）` : '自动默认'
  }
  const explicit = modelLabels?.[baseId]
  if (explicit && explicit !== baseId) {
    return explicit
  }
  if (engine === 'agy') {
    const exactMap: Record<string, string> = {
      'gemini-pro-orchestrator-neon': 'Gemini Pro Orchestrator (Neon)',
      'gemini-pro-orchestrator-argon': 'Gemini Pro Orchestrator (Argon)',
      'gemini-pro-orchestrator': 'Gemini Pro Orchestrator',
      'claude-opus-5-5': 'Claude Opus 5.5',
      'claude-sonnet-5-5': 'Claude Sonnet 5.5',
      'gpt-oss-120b': 'GPT-OSS 120B',
    }
    if (exactMap[baseId]) return exactMap[baseId]
  }
  const tokens = baseId.split('-')
  return tokens
    .map((tok, idx) => {
      const lower = tok.toLowerCase()
      if (lower === 'gpt') return 'GPT'
      if (lower === 'oss') return 'OSS'
      if (lower === 'glm') return 'GLM'
      if (/^\d+b$/i.test(tok)) return tok.toUpperCase()
      if (/^\d+(\.\d+)?$/.test(tok)) return tok
      if (idx > 0 && /^\d+$/.test(tokens[idx - 1]) && /^\d+$/.test(tok)) return tok
      return tok.charAt(0).toUpperCase() + tok.slice(1)
    })
    .join(' ')
    .replace(/GPT (\d)/g, 'GPT-$1')
    .replace(/Grok (\d)/g, 'Grok $1')
}

interface LocalBaseModelGroup {
  baseId: string
  label: string
  efforts: ThinkingEffort[]
  /** 针对 agy 等把强度拼进模型名的引擎，记录每个强度对应的完整值 */
  effortValueMap: Partial<Record<ThinkingEffort, string>>
  /** 仅当不支持多档思考强度时的固定值 */
  fixedValue?: string
}

function buildLocalModelGroups(
  engine: 'agy' | 'codex' | 'grok' | 'workbuddy',
  detectedModels?: string[],
  modelLabels?: Record<string, string>,
  effectiveDefault?: string,
): LocalBaseModelGroup[] {
  const rawList = detectedModels && detectedModels.length > 0 ? detectedModels : ['default']
  const groups: LocalBaseModelGroup[] = []
  const byBase = new Map<string, LocalBaseModelGroup>()

  for (const rawEntry of rawList) {
    if (engine === 'workbuddy' && rawEntry === 'auto') continue

    if (engine === 'agy') {
      if (rawEntry === 'default') {
        const g: LocalBaseModelGroup = {
          baseId: 'default',
          label: formatFriendlyBaseModelLabel(engine, 'default', modelLabels, effectiveDefault),
          efforts: [],
          effortValueMap: {},
          fixedValue: 'agy:default',
        }
        groups.push(g)
        byBase.set('default', g)
        continue
      }

      const effortMatch = rawEntry.match(/^(.+)-(low|medium|high|xhigh)$/i)
      if (effortMatch) {
        const baseId = effortMatch[1]
        const effort = effortMatch[2].toLowerCase() as ThinkingEffort
        let existing = byBase.get(baseId)
        if (!existing) {
          existing = {
            baseId,
            label: formatFriendlyBaseModelLabel(engine, baseId, modelLabels, effectiveDefault),
            efforts: [],
            effortValueMap: {},
          }
          groups.push(existing)
          byBase.set(baseId, existing)
        }
        existing.effortValueMap[effort] = `agy:${rawEntry}`
        if (!existing.efforts.includes(effort)) {
          existing.efforts.push(effort)
        }
      }
      else {
        if (!byBase.has(rawEntry)) {
          const g: LocalBaseModelGroup = {
            baseId: rawEntry,
            label: formatFriendlyBaseModelLabel(engine, rawEntry, modelLabels, effectiveDefault),
            efforts: [],
            effortValueMap: {},
            fixedValue: `agy:${rawEntry}`,
          }
          groups.push(g)
          byBase.set(rawEntry, g)
        }
      }
      continue
    }

    // codex / workbuddy / grok: strip optional @effort if ever present
    const baseId = rawEntry.replace(/@(low|medium|high|xhigh)$/i, '')
    if (byBase.has(baseId)) continue

    if (engine === 'codex') {
      const efforts: ThinkingEffort[] = ['low', 'medium', 'high', 'xhigh']
      const effortValueMap: Partial<Record<ThinkingEffort, string>> = {
        low: `codex:${baseId}@low`,
        medium: baseId === 'default' ? 'codex:default' : `codex:${baseId}@medium`,
        high: `codex:${baseId}@high`,
        xhigh: `codex:${baseId}@xhigh`,
      }
      const g: LocalBaseModelGroup = {
        baseId,
        label: formatFriendlyBaseModelLabel(engine, baseId, modelLabels, effectiveDefault),
        efforts,
        effortValueMap,
      }
      groups.push(g)
      byBase.set(baseId, g)
    }
    else if (engine === 'workbuddy') {
      const efforts: ThinkingEffort[] = ['low', 'medium', 'high']
      const effortValueMap: Partial<Record<ThinkingEffort, string>> = {
        low: `workbuddy:${baseId}@low`,
        medium: baseId === 'default' ? 'workbuddy:default' : `workbuddy:${baseId}@medium`,
        high: `workbuddy:${baseId}@high`,
      }
      const g: LocalBaseModelGroup = {
        baseId,
        label: formatFriendlyBaseModelLabel(engine, baseId, modelLabels, effectiveDefault),
        efforts,
        effortValueMap,
      }
      groups.push(g)
      byBase.set(baseId, g)
    }
    else {
      const g: LocalBaseModelGroup = {
        baseId,
        label: formatFriendlyBaseModelLabel(engine, baseId, modelLabels, effectiveDefault),
        efforts: [],
        effortValueMap: {},
        fixedValue: `${engine}:${baseId}`,
      }
      groups.push(g)
      byBase.set(baseId, g)
    }
  }

  for (const g of groups) {
    g.efforts.sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b))
    if (g.efforts.length === 1 && !g.fixedValue) {
      g.fixedValue = g.effortValueMap[g.efforts[0]]
    }
  }

  return groups
}

function parseSelectedModelAndEffort(
  engine: 'agy' | 'codex' | 'grok' | 'workbuddy',
  value: string,
  groups: LocalBaseModelGroup[],
): { group?: LocalBaseModelGroup, effort: ThinkingEffort } {
  const clean = String(value || '').trim()
  for (const g of groups) {
    if (g.fixedValue === clean) {
      return { group: g, effort: g.efforts[0] || 'medium' }
    }
    for (const eff of g.efforts) {
      if (g.effortValueMap[eff] === clean) {
        return { group: g, effort: eff }
      }
    }
    // 兼容未带 @effort 的旧存储值（如 codex:gpt-6.2-astra / workbuddy:glm-5.1）默认按中等思考强度解析
    if (clean === `${engine}:${g.baseId}`) {
      const defaultEffort: ThinkingEffort = g.efforts.includes('medium')
        ? 'medium'
        : (g.efforts[0] || 'medium')
      return { group: g, effort: defaultEffort }
    }
  }
  return { group: undefined, effort: 'medium' }
}

function formatShortVersion(raw?: string | null): string {
  if (!raw) return ''
  const clean = raw.replace(/^codex-cli\s+/i, '').trim()
  const semver = clean.match(/\d+\.\d+\.\d+/)
  if (semver) return `v${semver[0]}`
  return clean.length > 12 ? clean.slice(0, 10) : clean
}

function formatNumber(val?: number | string | null): string {
  if (val == null || val === '') return '--'
  const num = Number(val)
  return Number.isFinite(num) ? num.toLocaleString('zh-CN') : String(val)
}

function StatusPill({
  tone,
  label,
}: {
  tone: 'ready' | 'warn' | 'muted'
  label: string
}) {
  const styles = tone === 'ready'
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
    : tone === 'warn'
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25'
      : 'bg-muted text-muted-foreground border-border/60'
  const dot = tone === 'ready'
    ? 'bg-emerald-500'
    : tone === 'warn'
      ? 'bg-amber-500'
      : 'bg-muted-foreground/50'
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', styles)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {label}
    </span>
  )
}

function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  title,
}: {
  options: ReadonlyArray<{ value: T, label: string }>
  value: T
  onChange: (next: T) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <div
      title={title}
      className={cn(
        'inline-flex h-9 w-full items-center rounded-lg bg-muted/70 p-1',
        disabled && 'opacity-55',
      )}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onChange(opt.value)
          }}
          className={cn(
            'flex-1 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-medium transition-all',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function LocalModelSelect({
  engine,
  value,
  detectedModels,
  modelLabels,
  effectiveDefault,
  label = '使用模型',
  compact = false,
  testIdPrefix,
  onChange,
}: {
  engine: 'agy' | 'codex' | 'grok' | 'workbuddy'
  value: string
  detectedModels?: string[]
  modelLabels?: Record<string, string>
  effectiveDefault?: string
  label?: string
  compact?: boolean
  testIdPrefix?: string
  onChange: (next: string) => void
}) {
  const groups = buildLocalModelGroups(engine, detectedModels, modelLabels, effectiveDefault)
  const { group: matchedGroup, effort: matchedEffort } = parseSelectedModelAndEffort(engine, value, groups)
  const isPreset = Boolean(matchedGroup)
  const [customMode, setCustomMode] = useState(!isPreset && Boolean(value))

  useEffect(() => {
    if (matchedGroup) {
      setCustomMode(false)
    }
  }, [value, engine, matchedGroup])

  const selectOptions: StudioSelectOption[] = [
    ...groups.map(g => ({
      value: g.baseId,
      label: g.label,
    })),
    { value: CUSTOM_SENTINEL, label: '自定义模型标识...', isCustom: true },
  ]

  const canAdjustEffort = !customMode && Boolean(matchedGroup && matchedGroup.efforts.length > 1)
  const effortLevels: ThinkingEffort[] = canAdjustEffort && matchedGroup
    ? matchedGroup.efforts
    : ['low', 'medium', 'high']
  const displayEffort: ThinkingEffort = canAdjustEffort
    ? matchedEffort
    : 'medium'

  const handleBaseModelChange = (nextBaseId: string) => {
    if (nextBaseId === CUSTOM_SENTINEL) {
      setCustomMode(true)
      return
    }
    setCustomMode(false)
    const target = groups.find(g => g.baseId === nextBaseId)
    if (!target) return
    if (target.efforts.length > 1) {
      // 默认使用中等思考强度；若原本已选具体模型的档位且新模型支持，切换至默认中等更可预期
      const preferred: ThinkingEffort = target.efforts.includes('medium')
        ? 'medium'
        : target.efforts[0]
      const nextValue = target.effortValueMap[preferred] || target.fixedValue || `${engine}:${target.baseId}`
      onChange(nextValue)
      return
    }
    onChange(target.fixedValue || `${engine}:${target.baseId}`)
  }

  const handleEffortChange = (nextEffort: ThinkingEffort) => {
    if (!matchedGroup || matchedGroup.efforts.length <= 1) return
    const nextValue = matchedGroup.effortValueMap[nextEffort]
    if (nextValue) {
      onChange(nextValue)
    }
  }

  return (
    <div className="space-y-2">
      <div className={cn('grid grid-cols-1 gap-3', !compact && 'sm:grid-cols-[1fr_188px]')}>
        <div className="min-w-0 space-y-1.5">
          <Label className={cn(compact ? 'text-[11px]' : 'text-xs', 'text-muted-foreground')}>
            {label}
          </Label>
          <StudioSelect
            className="w-full"
            triggerClassName="h-9 text-xs"
            testId={testIdPrefix ? `${testIdPrefix}-model-select` : undefined}
            value={customMode ? CUSTOM_SENTINEL : (matchedGroup?.baseId ?? CUSTOM_SENTINEL)}
            options={selectOptions}
            onChange={handleBaseModelChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={cn(compact ? 'text-[11px]' : 'text-xs', 'text-muted-foreground')}>
            思考强度
          </Label>
          <SegmentedTabs
            disabled={!canAdjustEffort}
            title={
              canAdjustEffort
                ? '调整模型思考强度（默认中等）'
                : '当前模式采用默认中等思考强度，选择具体模型后可自由调整'
            }
            value={displayEffort}
            options={effortLevels.map(level => ({ value: level, label: EFFORT_LABELS[level] }))}
            onChange={handleEffortChange}
          />
        </div>
      </div>
      {(customMode || !isPreset) && (
        <Input
          className="h-8 text-xs"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={
            engine === 'agy'
              ? '如 agy:gemini-4-neon-medium'
              : engine === 'codex'
                ? '如 codex:gpt-6.2-astra@medium'
                : engine === 'grok'
                  ? '如 grok:grok-4.7'
                  : '如 workbuddy:glm-5.1@medium'
          }
        />
      )}
    </div>
  )
}

let cachedModelsHubSnapshot: StudioModelsHubResponse | null = null

export function ModelsHubView() {
  const openConfigDialog = useConfigManagerDialogStore(state => state.openDialog)
  const [hub, setHub] = useState<StudioModelsHubResponse | null>(() => cachedModelsHubSnapshot)
  const [form, setForm] = useState<StudioModelsHubConfig | null>(() => cachedModelsHubSnapshot?.config ?? null)
  const [loading, setLoading] = useState(() => !cachedModelsHubSnapshot)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({})
  const [wizardModal, setWizardModal] = useState<WizardModalState>(null)
  const [loggingOutDreamina, setLoggingOutDreamina] = useState(false)
  const [splitPlannerChat, setSplitPlannerChat] = useState(false)
  const [showThirdPartyDrawer, setShowThirdPartyDrawer] = useState(false)

  const loadHub = useCallback(async (showSkeleton = false) => {
    if (showSkeleton || !cachedModelsHubSnapshot) {
      setLoading(true)
    }
    setError(null)
    try {
      const res = await getStudioModelsHubApi()
      if (!res || res.code !== 0 || !res.data) {
        throw new Error(res?.message || '无法加载模型接入状态')
      }
      cachedModelsHubSnapshot = res.data
      setHub(res.data)
      setForm(res.data.config)
      const cfg = res.data.config
      if (cfg.planner.model !== cfg.chat.model || cfg.planner.engine !== cfg.chat.engine) {
        setSplitPlannerChat(true)
      }
      const usesThirdParty = cfg.agent.engine === 'thirdParty'
        || cfg.planner.engine === 'thirdParty'
        || cfg.image.engine !== 'dreamina'
        || cfg.video.engine !== 'dreamina'
      if (usesThirdParty) {
        setShowThirdPartyDrawer(true)
      }
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHub()
  }, [loadHub])

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      const res = await saveStudioModelsHubApi(form)
      if (!res || res.code !== 0 || !res.data) {
        throw new Error(res?.message || '保存配置失败')
      }
      setHub(res.data)
      setForm(res.data.config)
      toast.success('配置已保存并立即生效')
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    }
    finally {
      setSaving(false)
    }
  }

  const runTest = async (
    key: string,
    payload: Parameters<typeof testStudioModelConnectionApi>[0],
  ) => {
    setTestingKey(key)
    try {
      const res = await testStudioModelConnectionApi(payload)
      if (!res || res.code !== 0 || !res.data) {
        throw new Error(res?.message || '测试请求失败')
      }
      setTestResults(prev => ({ ...prev, [key]: res.data! }))
      if (key === 'dreamina' && res.data.data && typeof res.data.data === 'object') {
        const updatedEngine = res.data.data as LocalEngineInfo
        setHub(prev => prev
          ? {
              ...prev,
              bridge: {
                ...prev.bridge,
                engines: { ...prev.bridge.engines, dreamina: updatedEngine },
              },
            }
          : prev)
      }
      if (res.data.ok) {
        toast.success(res.data.detail)
      }
      else {
        toast.error(res.data.detail)
      }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setTestResults(prev => ({ ...prev, [key]: { ok: false, latencyMs: 0, detail: msg } }))
      toast.error(msg)
    }
    finally {
      setTestingKey(null)
    }
  }

  const handleAuthSuccess = useCallback((kind: WizardAuthKind, engine?: LocalEngineInfo) => {
    if (engine) {
      setHub(prev => prev
        ? {
            ...prev,
            bridge: {
              ...prev.bridge,
              engines: {
                ...prev.bridge.engines,
                [kind]: engine,
              },
            },
          }
        : prev)
    }
    setTestResults((prev) => {
      const next = { ...prev }
      delete next[kind]
      return next
    })
  }, [])

  const applyThirdPartyPreset = (preset: ThirdPartyPreset) => {
    if (!form) return
    setForm({
      ...form,
      providers: {
        ...form.providers,
        [preset.providerField]: {
          ...form.providers[preset.providerField],
          baseUrl: preset.baseUrl,
        },
      },
      agent: {
        ...form.agent,
        engine: 'thirdParty',
        protocol: preset.protocol,
        baseUrl: preset.baseUrl,
        model: preset.model,
        backgroundModel: preset.model,
        thinkModel: preset.model,
      },
      chat: {
        engine: 'thirdParty',
        model: preset.model,
        thirdPartyChannel: preset.protocol === 'openrouter' ? 'openai' : preset.protocol,
      },
      planner: {
        engine: 'thirdParty',
        model: preset.model,
        thirdPartyChannel: preset.protocol === 'openrouter' ? 'openai' : preset.protocol,
      },
    })
    setShowThirdPartyDrawer(true)
    toast.success(`已填入 ${preset.label} 模板，填写 API Key 后保存即可`)
  }

  if (loading && !form) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !form || !hub) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>无法加载模型接入中心</AlertTitle>
          <AlertDescription className="mt-2 flex items-center justify-between gap-4">
            <span>{error || '请确认本地 AI 服务已启动。'}</span>
            <Button variant="outline" size="sm" onClick={() => void loadHub()}>重试</Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const { bridge } = hub
  const engines = bridge.engines

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-5 py-7 md:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-back text-gradient-foreground shadow-sm shadow-primary/25">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">模型接入</h1>
            <p className="text-xs text-muted-foreground">
              先接入可用账号或第三方 API，再按创作场景分配默认模型
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => void loadHub()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            重新检测
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => openConfigDialog('sidebar')}>
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            YAML 配置
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            保存配置
          </Button>
        </div>
      </header>

      {/* Bridge Disconnected Warning */}
      {!bridge.reachable && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>未连接到本机桥接服务</AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            请通过 <code className="rounded bg-muted px-1.5 py-0.5">启动本地版.command</code> 启动 PostPilot，以自动连接本机 Antigravity、Codex、即梦、Grok 与 WorkBuddy 引擎。
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Onboarding Banner when Dreamina needs login */}
      {bridge.reachable && engines.dreamina?.installed && !engines.dreamina?.loggedIn && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">即梦 AI 还差一步网页授权</p>
              <p className="text-xs text-muted-foreground">点击右侧按钮在浏览器确认即可开启即梦 5.0 生图与 Seedance 生视频</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={() => setWizardModal({ mode: 'dreamina-login', force: false })}
          >
            <LogIn className="mr-1.5 h-3.5 w-3.5" />
            一键网页登录即梦
          </Button>
        </div>
      )}

      {/* Section 1: 接入模型（账号直连 + 第三方 API 快捷接入，统一置顶） */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">账号直连</h2>
          <span className="text-xs text-muted-foreground">免填 Key · 网页授权即用</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Antigravity */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <ProviderAppIcon provider="agy" size={24} />
                  <span className="truncate text-[13px] font-semibold text-foreground">Antigravity</span>
                </div>
                <StatusPill
                  tone={engines.agy?.installed ? 'ready' : 'muted'}
                  label={engines.agy?.installed ? '已就绪' : '未安装'}
                />
              </div>
              <p className="truncate text-xs font-medium text-muted-foreground">
                {engines.agy?.installed
                  ? `${formatShortVersion(engines.agy.version)} · ${Math.max(0, (engines.agy.models?.length || 1) - 1)} 个模型`
                  : '未检测到安装'}
              </p>
              {testResults.agy && (
                <p
                  title={testResults.agy.detail}
                  className={cn(
                    'truncate text-[11px]',
                    testResults.agy.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                  )}
                >
                  {testResults.agy.ok ? `✓ 连通正常（${(testResults.agy.latencyMs / 1000).toFixed(1)}s）` : testResults.agy.detail}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              {engines.agy?.installed
                ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full text-xs"
                      disabled={!bridge.reachable || testingKey === 'agy'}
                      onClick={() => void runTest('agy', {
                        kind: 'agy',
                        model: form.agent.engine === 'agy' ? form.agent.model : form.planner.engine === 'agy' ? form.planner.model : undefined,
                      })}
                    >
                      {testingKey === 'agy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                      测试连通
                    </Button>
                  )
                : (
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setWizardModal({ mode: 'setup-guide', engine: 'agy' })}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                      安装指引
                    </Button>
                  )}
            </div>
          </div>

          {/* Codex */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderAppIcon provider="codex" size={26} />
                  <span className="truncate text-sm font-semibold text-foreground">Codex</span>
                </div>
                <StatusPill
                  tone={!engines.codex?.installed ? 'muted' : engines.codex.loggedIn === false ? 'warn' : 'ready'}
                  label={!engines.codex?.installed ? '未安装' : engines.codex.loggedIn === false ? '待登录' : '已就绪'}
                />
              </div>
              <p className="truncate text-xs font-medium text-muted-foreground" title={engines.codex?.effectiveDefaultModel || ''}>
                {engines.codex?.installed
                  ? `${formatShortVersion(engines.codex.version)}${engines.codex.effectiveDefaultModel ? ` · ${engines.codex.effectiveDefaultModel}` : ''}`
                  : '未检测到安装'}
              </p>
              {testResults.codex && (
                <p
                  title={testResults.codex.detail}
                  className={cn(
                    'truncate text-[11px]',
                    testResults.codex.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                  )}
                >
                  {testResults.codex.ok ? `✓ 连通正常（${(testResults.codex.latencyMs / 1000).toFixed(1)}s）` : testResults.codex.detail}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              {!engines.codex?.installed
                ? (
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setWizardModal({ mode: 'setup-guide', engine: 'codex' })}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                      安装指引
                    </Button>
                  )
                : engines.codex.loggedIn === false
                  ? (
                      <Button type="button" size="sm" className="h-8 w-full text-xs" disabled={!bridge.reachable} onClick={() => setWizardModal({ mode: 'codex-login' })}>
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        一键网页登录
                      </Button>
                    )
                  : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 text-xs"
                          disabled={!bridge.reachable || testingKey === 'codex'}
                          onClick={() => void runTest('codex', {
                            kind: 'codex',
                            model: form.agent.engine === 'codex' ? form.agent.model : form.planner.engine === 'codex' ? form.planner.model : undefined,
                          })}
                        >
                          {testingKey === 'codex' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                          测试连通
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                          disabled={!bridge.reachable}
                          onClick={() => setWizardModal({ mode: 'codex-login' })}
                        >
                          切换
                        </Button>
                      </div>
                    )}
            </div>
          </div>

          {/* Dreamina */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderAppIcon provider="dreamina" size={26} />
                  <span className="truncate text-sm font-semibold text-foreground">即梦 AI</span>
                </div>
                <StatusPill
                  tone={!engines.dreamina?.installed ? 'muted' : engines.dreamina.loggedIn ? 'ready' : 'warn'}
                  label={!engines.dreamina?.installed ? '未安装' : engines.dreamina.loggedIn ? '已登录' : '待登录'}
                />
              </div>
              <p className="truncate text-xs font-medium text-muted-foreground">
                {!engines.dreamina?.installed
                  ? '未检测到安装'
                  : engines.dreamina.loggedIn
                    ? `剩余积分 ${formatNumber(engines.dreamina.credits)}`
                    : '待网页授权'}
              </p>
              {testResults.dreamina && !testResults.dreamina.ok && (
                <p title={testResults.dreamina.detail} className="truncate text-[11px] text-destructive">
                  {testResults.dreamina.detail}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              {!engines.dreamina?.installed
                ? (
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setWizardModal({ mode: 'setup-guide', engine: 'dreamina' })}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                      安装指引
                    </Button>
                  )
                : !engines.dreamina.loggedIn
                  ? (
                      <Button type="button" size="sm" className="h-8 w-full text-xs" disabled={!bridge.reachable} onClick={() => setWizardModal({ mode: 'dreamina-login', force: false })}>
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        一键网页登录
                      </Button>
                    )
                  : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 text-xs"
                          disabled={!bridge.reachable || testingKey === 'dreamina'}
                          onClick={() => void runTest('dreamina', { kind: 'dreamina' })}
                        >
                          {testingKey === 'dreamina' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                          刷新积分
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                          disabled={!bridge.reachable || loggingOutDreamina}
                          onClick={async () => {
                            if (!window.confirm('确定退出当前即梦账号吗？退出后需要重新网页登录才能继续生图和生视频。')) {
                              return
                            }
                            setLoggingOutDreamina(true)
                            try {
                              const res = await logoutDreaminaAuthApi()
                              if (res?.code === 0) {
                                toast.success('已退出即梦账号')
                                handleAuthSuccess('dreamina', res.data?.engine)
                              }
                            }
                            finally {
                              setLoggingOutDreamina(false)
                            }
                          }}
                        >
                          {loggingOutDreamina ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '退出'}
                        </Button>
                      </div>
                    )}
            </div>
          </div>

          {/* Grok */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderAppIcon provider="grok" size={26} />
                  <span className="truncate text-sm font-semibold text-foreground">Grok</span>
                </div>
                <StatusPill
                  tone={!engines.grok?.installed ? 'muted' : engines.grok.loggedIn ? 'ready' : 'warn'}
                  label={!engines.grok?.installed ? '未安装' : engines.grok.loggedIn ? '已就绪' : '待登录'}
                />
              </div>
              <p className="truncate text-xs font-medium text-muted-foreground" title={engines.grok?.effectiveDefaultModel || ''}>
                {engines.grok?.installed
                  ? `${formatShortVersion(engines.grok.version)}${engines.grok.effectiveDefaultModel ? ` · ${engines.grok.effectiveDefaultModel}` : ''}`
                  : '未检测到安装'}
              </p>
              {testResults.grok && (
                <p
                  title={testResults.grok.detail}
                  className={cn(
                    'truncate text-[11px]',
                    testResults.grok.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                  )}
                >
                  {testResults.grok.ok ? `✓ 连通正常（${(testResults.grok.latencyMs / 1000).toFixed(1)}s）` : testResults.grok.detail}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              {!engines.grok?.installed
                ? (
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setWizardModal({ mode: 'setup-guide', engine: 'grok' })}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                      安装指引
                    </Button>
                  )
                : !engines.grok.loggedIn
                  ? (
                      <Button type="button" size="sm" className="h-8 w-full text-xs" disabled={!bridge.reachable} onClick={() => setWizardModal({ mode: 'grok-login' })}>
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        一键网页登录
                      </Button>
                    )
                  : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 text-xs"
                          disabled={!bridge.reachable || testingKey === 'grok'}
                          onClick={() => void runTest('grok', {
                            kind: 'grok',
                            model: form.agent.engine === 'grok' ? form.agent.model : form.planner.engine === 'grok' ? form.planner.model : undefined,
                          })}
                        >
                          {testingKey === 'grok' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1 h-3.5 w-3.5" />}
                          测试连通
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                          disabled={!bridge.reachable}
                          onClick={() => setWizardModal({ mode: 'grok-login' })}
                        >
                          切换
                        </Button>
                      </div>
                    )}
            </div>
          </div>

          {/* WorkBuddy */}
          <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-primary/30">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderAppIcon provider="workbuddy" size={26} />
                  <span className="truncate text-sm font-semibold text-foreground">WorkBuddy</span>
                </div>
                <StatusPill
                  tone={!engines.workbuddy?.installed ? 'muted' : engines.workbuddy.loggedIn ? 'ready' : 'warn'}
                  label={!engines.workbuddy?.installed ? '未安装' : engines.workbuddy.loggedIn ? '已就绪' : '待登录'}
                />
              </div>
              <p className="truncate text-xs font-medium text-muted-foreground">
                {engines.workbuddy?.installed
                  ? `${formatShortVersion(engines.workbuddy.version)} · ${Math.max(0, (engines.workbuddy.models?.length || 1) - 1)} 个模型`
                  : '未检测到安装'}
              </p>
              {testResults.workbuddy && (
                <p
                  title={testResults.workbuddy.detail}
                  className={cn(
                    'truncate text-[11px]',
                    testResults.workbuddy.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                  )}
                >
                  {testResults.workbuddy.ok ? `✓ 连通正常（${(testResults.workbuddy.latencyMs / 1000).toFixed(1)}s）` : testResults.workbuddy.detail}
                </p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-border/50">
              {!engines.workbuddy?.installed
                ? (
                    <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => setWizardModal({ mode: 'setup-guide', engine: 'workbuddy' })}>
                      <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
                      安装指引
                    </Button>
                  )
                : !engines.workbuddy.loggedIn
                  ? (
                      <Button type="button" size="sm" className="h-8 w-full text-xs" disabled={!bridge.reachable} onClick={() => setWizardModal({ mode: 'workbuddy-login' })}>
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                        一键网页登录
                      </Button>
                    )
                  : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 text-xs"
                          disabled={!bridge.reachable || testingKey === 'workbuddy'}
                          onClick={() => void runTest('workbuddy', {
                            kind: 'workbuddy',
                            model: form.agent.engine === 'workbuddy' ? form.agent.model : form.planner.engine === 'workbuddy' ? form.planner.model : undefined,
                          })}
                        >
                          {testingKey === 'workbuddy' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1 h-3.5 w-3.5" />}
                          测试连通
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs text-muted-foreground"
                          disabled={!bridge.reachable}
                          onClick={() => setWizardModal({ mode: 'workbuddy-login' })}
                        >
                          切换
                        </Button>
                      </div>
                    )}
            </div>
          </div>
        </div>

        {/* 第三方 API 快捷接入（与上方账号直连并列置顶，接入后再选路由） */}
        <div data-testid="models-third-party-top" className="rounded-xl border border-border/80 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground">
                <ProviderAppIcon provider="thirdParty" size={24} />
                第三方 API 快捷接入
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {THIRD_PARTY_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      applyThirdPartyPreset(preset)
                      setShowThirdPartyDrawer(true)
                    }}
                    className="rounded-full border border-border/80 bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.06] hover:text-primary cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowThirdPartyDrawer(v => !v)}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              {showThirdPartyDrawer ? '收起 Key 配置' : '管理 API Key'}
              {showThirdPartyDrawer ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>

          {showThirdPartyDrawer && (
            <div className="grid grid-cols-1 gap-4 border-t border-border/60 p-4 md:grid-cols-3">
              {/* OpenAI / 国内兼容 */}
              <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <p className="text-xs font-semibold text-foreground">OpenAI / 国内兼容接口</p>
                <Input
                  className="h-8 text-xs"
                  value={form.providers.openai.baseUrl}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, openai: { ...form.providers.openai, baseUrl: e.target.value } } })}
                  placeholder="https://api.deepseek.com/v1"
                />
                <PasswordInput
                  className="h-8 text-xs"
                  value={form.providers.openai.apiKey}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, openai: { ...form.providers.openai, apiKey: e.target.value } } })}
                  placeholder="API Key (sk-...)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  disabled={testingKey === 'tp-openai'}
                  onClick={() => void runTest('tp-openai', {
                    kind: 'thirdParty',
                    protocol: 'openai',
                    baseUrl: form.providers.openai.baseUrl,
                    apiKey: form.providers.openai.apiKey,
                    model: form.planner.engine === 'thirdParty' ? form.planner.model : 'gpt-4.1',
                  })}
                >
                  {testingKey === 'tp-openai' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                  测试连接
                </Button>
              </div>

              {/* Anthropic */}
              <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <p className="text-xs font-semibold text-foreground">Anthropic Claude</p>
                <Input
                  className="h-8 text-xs"
                  value={form.providers.anthropic.baseUrl}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, anthropic: { ...form.providers.anthropic, baseUrl: e.target.value } } })}
                  placeholder="https://api.anthropic.com"
                />
                <PasswordInput
                  className="h-8 text-xs"
                  value={form.providers.anthropic.apiKey}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, anthropic: { ...form.providers.anthropic, apiKey: e.target.value } } })}
                  placeholder="sk-ant-..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  disabled={testingKey === 'tp-anthropic'}
                  onClick={() => void runTest('tp-anthropic', {
                    kind: 'thirdParty',
                    protocol: 'anthropic',
                    baseUrl: form.providers.anthropic.baseUrl,
                    apiKey: form.providers.anthropic.apiKey,
                    model: 'claude-sonnet-4-6',
                  })}
                >
                  {testingKey === 'tp-anthropic' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                  测试连接
                </Button>
              </div>

              {/* Gemini */}
              <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <p className="text-xs font-semibold text-foreground">Google Gemini</p>
                <Input
                  className="h-8 text-xs"
                  value={form.providers.gemini.baseUrl}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, gemini: { ...form.providers.gemini, baseUrl: e.target.value } } })}
                  placeholder="https://generativelanguage.googleapis.com"
                />
                <PasswordInput
                  className="h-8 text-xs"
                  value={form.providers.gemini.apiKey}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, gemini: { ...form.providers.gemini, apiKey: e.target.value } } })}
                  placeholder="AIza..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full text-xs"
                  disabled={testingKey === 'tp-gemini'}
                  onClick={() => void runTest('tp-gemini', {
                    kind: 'thirdParty',
                    protocol: 'gemini',
                    baseUrl: form.providers.gemini.baseUrl,
                    apiKey: form.providers.gemini.apiKey,
                    model: 'gemini-2.5-flash',
                  })}
                >
                  {testingKey === 'tp-gemini' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                  测试连接
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Scene Routing */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">创作场景分配</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Slot 1: Content Agent */}
          <div className="flex flex-col justify-between space-y-3 rounded-xl border border-border/80 bg-card p-5">
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">内容 Agent</h3>
              </div>

              <SegmentedTabs
                value={form.agent.engine}
                options={[
                  { value: 'agy', label: 'Antigravity' },
                  { value: 'codex', label: 'Codex' },
                  { value: 'grok', label: 'Grok' },
                  { value: 'workbuddy', label: 'WorkBuddy' },
                  { value: 'thirdParty', label: '第三方 API' },
                ]}
                onChange={next => setForm({
                  ...form,
                  agent: {
                    ...form.agent,
                    engine: next,
                    model: next === 'agy'
                      ? 'agy:default'
                      : next === 'codex'
                        ? 'codex:default'
                        : next === 'grok'
                          ? 'grok:default'
                          : next === 'workbuddy'
                            ? 'workbuddy:default'
                            : (/^(?:agy|codex|grok|workbuddy)(?:[:/]|$)/i.test(form.agent.model) ? 'claude-sonnet-4-6' : form.agent.model),
                  },
                })}
              />

              {form.agent.engine !== 'thirdParty'
                ? (
                    <LocalModelSelect
                      engine={form.agent.engine}
                      value={form.agent.model}
                      label="使用模型"
                      testIdPrefix="models-agent"
                      detectedModels={
                        form.agent.engine === 'agy'
                          ? engines.agy?.models
                          : form.agent.engine === 'codex'
                            ? engines.codex?.models
                            : form.agent.engine === 'grok'
                              ? engines.grok?.models
                              : engines.workbuddy?.models
                      }
                      modelLabels={form.agent.engine === 'workbuddy' ? engines.workbuddy?.modelLabels : undefined}
                      effectiveDefault={
                        form.agent.engine === 'codex'
                          ? engines.codex?.effectiveDefaultModel
                          : form.agent.engine === 'grok'
                            ? engines.grok?.effectiveDefaultModel
                            : form.agent.engine === 'workbuddy'
                              ? engines.workbuddy?.effectiveDefaultModel
                              : undefined
                      }
                      onChange={next => setForm({ ...form, agent: { ...form.agent, model: next } })}
                    />
                  )
                : (
                    <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/25 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">接口协议</Label>
                          <StudioSelect
                            className="w-full"
                            triggerClassName="h-8 text-xs"
                            testId="models-agent-protocol-select"
                            value={form.agent.protocol}
                            options={AGENT_PROTOCOL_OPTIONS}
                            onChange={next => setForm({ ...form, agent: { ...form.agent, protocol: next as StudioModelsHubConfig['agent']['protocol'] } })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">主模型名</Label>
                          <Input
                            className="h-8 text-xs"
                            value={form.agent.model}
                            onChange={e => setForm({
                              ...form,
                              agent: { ...form.agent, model: e.target.value, backgroundModel: e.target.value, thinkModel: e.target.value },
                            })}
                            placeholder="claude-sonnet-4-6"
                          />
                        </div>
                      </div>
                      <Input
                        className="h-8 text-xs"
                        value={form.agent.baseUrl || ''}
                        onChange={e => setForm({ ...form, agent: { ...form.agent, baseUrl: e.target.value } })}
                        placeholder="Base URL，如 https://api.openai.com/v1"
                      />
                      <div className="flex gap-2">
                        <PasswordInput
                          className="h-8 text-xs"
                          value={form.agent.apiKey || ''}
                          onChange={e => setForm({ ...form, agent: { ...form.agent, apiKey: e.target.value } })}
                          placeholder="API Key"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 text-xs"
                          disabled={testingKey === 'agent-tp'}
                          onClick={() => void runTest('agent-tp', {
                            kind: 'thirdParty',
                            protocol: form.agent.protocol,
                            baseUrl: form.agent.baseUrl,
                            apiKey: form.agent.apiKey,
                            model: form.agent.model,
                          })}
                        >
                          {testingKey === 'agent-tp' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '测试'}
                        </Button>
                      </div>
                    </div>
                  )}
            </div>
          </div>

          {/* Slot 2: Planner & Chat */}
          <div className="flex flex-col justify-between space-y-3 rounded-xl border border-border/80 bg-card p-5">
            <div className="space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">文案与草稿规划</h3>
              </div>

              <SegmentedTabs
                value={form.planner.engine}
                options={[
                  { value: 'agy', label: 'Antigravity' },
                  { value: 'codex', label: 'Codex' },
                  { value: 'grok', label: 'Grok' },
                  { value: 'workbuddy', label: 'WorkBuddy' },
                  { value: 'thirdParty', label: '第三方 API' },
                ]}
                onChange={(next) => {
                  const defaultModel = next === 'agy'
                    ? 'agy:default'
                    : next === 'codex'
                      ? 'codex:default'
                      : next === 'grok'
                        ? 'grok:default'
                        : next === 'workbuddy'
                          ? 'workbuddy:default'
                          : 'gpt-4.1'
                  setForm({
                    ...form,
                    planner: { ...form.planner, engine: next, model: defaultModel },
                    chat: { ...form.chat, engine: next, model: defaultModel },
                  })
                }}
              />

              {form.planner.engine !== 'thirdParty'
                ? (
                    <div className="space-y-2.5">
                      {!splitPlannerChat
                        ? (
                            <LocalModelSelect
                              engine={form.planner.engine}
                              value={form.planner.model}
                              label="使用模型"
                              testIdPrefix="models-planner"
                              detectedModels={
                                form.planner.engine === 'agy'
                                  ? engines.agy?.models
                                  : form.planner.engine === 'codex'
                                    ? engines.codex?.models
                                    : form.planner.engine === 'grok'
                                      ? engines.grok?.models
                                      : engines.workbuddy?.models
                              }
                              modelLabels={form.planner.engine === 'workbuddy' ? engines.workbuddy?.modelLabels : undefined}
                              effectiveDefault={
                                form.planner.engine === 'codex'
                                  ? engines.codex?.effectiveDefaultModel
                                  : form.planner.engine === 'grok'
                                    ? engines.grok?.effectiveDefaultModel
                                    : form.planner.engine === 'workbuddy'
                                      ? engines.workbuddy?.effectiveDefaultModel
                                      : undefined
                              }
                              onChange={next => setForm({
                                ...form,
                                planner: { ...form.planner, model: next },
                                chat: { ...form.chat, model: next },
                              })}
                            />
                          )
                        : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <LocalModelSelect
                                engine={form.planner.engine}
                                value={form.planner.model}
                                label="草稿规划模型"
                                compact
                                detectedModels={
                                  form.planner.engine === 'agy'
                                    ? engines.agy?.models
                                    : form.planner.engine === 'codex'
                                      ? engines.codex?.models
                                      : form.planner.engine === 'grok'
                                        ? engines.grok?.models
                                        : engines.workbuddy?.models
                                }
                                modelLabels={form.planner.engine === 'workbuddy' ? engines.workbuddy?.modelLabels : undefined}
                                onChange={next => setForm({ ...form, planner: { ...form.planner, model: next } })}
                              />
                              <LocalModelSelect
                                engine={form.planner.engine}
                                value={form.chat.model}
                                label="通用对话模型"
                                compact
                                detectedModels={
                                  form.planner.engine === 'agy'
                                    ? engines.agy?.models
                                    : form.planner.engine === 'codex'
                                      ? engines.codex?.models
                                      : form.planner.engine === 'grok'
                                        ? engines.grok?.models
                                        : engines.workbuddy?.models
                                }
                                modelLabels={form.planner.engine === 'workbuddy' ? engines.workbuddy?.modelLabels : undefined}
                                onChange={next => setForm({ ...form, chat: { ...form.chat, model: next } })}
                              />
                            </div>
                          )}
                    </div>
                  )
                : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">第三方渠道</Label>
                        <StudioSelect
                          className="w-full"
                          triggerClassName="h-9 text-xs"
                          testId="models-planner-channel-select"
                          value={form.planner.thirdPartyChannel || 'openai'}
                          options={PLANNER_CHANNEL_OPTIONS}
                          onChange={(next) => {
                            const ch = next as 'openai' | 'gemini' | 'deepseek' | 'anthropic'
                            setForm({
                              ...form,
                              planner: { ...form.planner, thirdPartyChannel: ch },
                              chat: { ...form.chat, thirdPartyChannel: ch },
                            })
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">模型名</Label>
                        <Input
                          className="h-9 text-xs"
                          value={form.planner.model}
                          onChange={e => setForm({
                            ...form,
                            planner: { ...form.planner, model: e.target.value },
                            chat: { ...form.chat, model: e.target.value },
                          })}
                          placeholder="如 gpt-4.1 / deepseek-chat"
                        />
                      </div>
                    </div>
                  )}
            </div>

            {form.planner.engine !== 'thirdParty' && (
              <button
                type="button"
                className="self-start text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setSplitPlannerChat(v => !v)}
              >
                {splitPlannerChat ? '合并为统一模型' : '分别指定草稿规划与对话模型'}
              </button>
            )}
          </div>

          {/* Slot 3: Image Generation */}
          <div className="space-y-3.5 rounded-xl border border-border/80 bg-card p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ImageIcon className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">图片生成</h3>
            </div>

            <SegmentedTabs
              value={form.image.engine}
              options={[
                { value: 'dreamina', label: '即梦 AI' },
                { value: 'codex', label: 'Codex 生图' },
                { value: 'openai', label: 'OpenAI API' },
                { value: 'gemini', label: 'Gemini' },
              ]}
              onChange={(next) => {
                const defaultModel = next === 'dreamina'
                  ? 'dreamina-5.0'
                  : next === 'codex'
                    ? 'codex-gpt-image-2'
                    : next === 'openai'
                      ? 'gpt-image-2'
                      : 'gemini-3.1-flash-image-preview'
                setForm({
                  ...form,
                  image: { ...form.image, engine: next, model: defaultModel },
                })
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认模型</Label>
                {form.image.engine === 'dreamina'
                  ? (
                      <StudioSelect
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                        testId="models-image-select"
                        value={form.image.model}
                        options={DREAMINA_IMAGE_OPTIONS}
                        onChange={next => setForm({ ...form, image: { ...form.image, model: next } })}
                      />
                    )
                  : form.image.engine === 'codex'
                    ? (
                        <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-xs text-foreground">
                          GPT Image 2（本机 Codex · ChatGPT 账号免 API）
                        </div>
                      )
                    : (
                        <Input
                          className="h-9 text-xs"
                          value={form.image.model}
                          onChange={e => setForm({ ...form, image: { ...form.image, model: e.target.value } })}
                        />
                      )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">清晰度</Label>
                <SegmentedTabs
                  value={form.image.resolution}
                  options={[
                    { value: '1k', label: '1K' },
                    { value: '2k', label: '2K' },
                    { value: '4k', label: '4K' },
                  ]}
                  onChange={next => setForm({ ...form, image: { ...form.image, resolution: next } })}
                />
              </div>
            </div>
          </div>

          {/* Slot 4: Video Generation */}
          <div className="space-y-3.5 rounded-xl border border-border/80 bg-card p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Film className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">视频生成</h3>
            </div>

            <SegmentedTabs
              value={form.video.engine === 'dreamina' ? 'dreamina' : 'thirdParty'}
              options={[
                { value: 'dreamina', label: '即梦 AI (Seedance)' },
                { value: 'thirdParty', label: '第三方视频接口' },
              ]}
              onChange={(next) => {
                if (next === 'dreamina') {
                  setForm({ ...form, video: { engine: 'dreamina', model: 'dreamina-seedance-2.0-fast' } })
                }
                else {
                  setForm({ ...form, video: { engine: 'volcengine', model: 'doubao-seedance-1-5-pro-251215' } })
                  setShowThirdPartyDrawer(true)
                }
              }}
            />

            {form.video.engine === 'dreamina'
              ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">默认模型</Label>
                    <StudioSelect
                      className="w-full"
                      triggerClassName="h-9 text-xs"
                      testId="models-video-select"
                      value={form.video.model}
                      options={DREAMINA_VIDEO_OPTIONS}
                      onChange={next => setForm({ ...form, video: { ...form.video, model: next } })}
                    />
                  </div>
                )
              : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">渠道</Label>
                      <StudioSelect
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                        testId="models-video-channel-select"
                        value={form.video.engine}
                        options={[...THIRD_PARTY_VIDEO_CHANNELS]}
                        onChange={next => setForm({ ...form, video: { ...form.video, engine: next as StudioModelsHubConfig['video']['engine'] } })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">模型名</Label>
                      <Input
                        className="h-9 text-xs"
                        value={form.video.model}
                        onChange={e => setForm({ ...form, video: { ...form.video, model: e.target.value } })}
                      />
                    </div>
                  </div>
                )}
          </div>
        </div>
      </section>

      <LocalAuthWizardDialog
        state={wizardModal}
        onClose={() => setWizardModal(null)}
        onAuthSuccess={handleAuthSuccess}
        onRefreshEngines={() => void loadHub()}
      />
    </div>
  )
}
