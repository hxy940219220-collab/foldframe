'use client'

import { cn } from '@/utils/className'

export type ProviderIconId = 'agy' | 'codex' | 'grok' | 'workbuddy' | 'dreamina' | 'thirdParty'

const PROVIDER_ICON_SRC: Record<ProviderIconId, string> = {
  agy: '/assets/providers/antigravity.png',
  codex: '/assets/providers/codex.png',
  grok: '/assets/providers/grok.png',
  workbuddy: '/assets/providers/workbuddy.png',
  dreamina: '/assets/providers/dreamina.png',
  thirdParty: '/assets/providers/third-party.png',
}

const PROVIDER_ALT: Record<ProviderIconId, string> = {
  agy: 'Antigravity',
  codex: 'Codex',
  grok: 'Grok',
  workbuddy: 'WorkBuddy',
  dreamina: '即梦 AI',
  thirdParty: '第三方 API',
}

export function inferProviderIconId(raw?: string | null): ProviderIconId {
  const value = (raw || '').toLowerCase()
  if (value === 'agy' || value.startsWith('agy:') || value.startsWith('agy-') || value.includes('antigravity'))
    return 'agy'
  if (value === 'codex' || value.startsWith('codex:') || value.startsWith('codex-') || value.includes('openai'))
    return 'codex'
  if (value === 'grok' || value.startsWith('grok:') || value.startsWith('grok-'))
    return 'grok'
  if (value === 'workbuddy' || value.startsWith('workbuddy:') || value.startsWith('workbuddy-'))
    return 'workbuddy'
  if (value === 'dreamina' || value.startsWith('dreamina') || value.includes('seedance') || value.includes('seedream') || value.includes('jimeng') || value.includes('即梦'))
    return 'dreamina'
  return 'thirdParty'
}

export function cleanVisualModelLabel(raw?: string | null): string {
  return String(raw || '').replace(/\s*[\(（]CLI[\)）]/gi, '').trim()
}

/** 深色圆角底 + 纯白四芒星（对齐即梦模型列表单色图标样式） */
export function DreaminaModelBadge({
  size = 18,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[26%] border border-white/12 bg-[#1C1D22] shadow-[0_1px_3px_rgba(15,23,42,0.22)] select-none',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-[74%] w-[74%]">
        <path
          d="M13.0 4.8C14.7 10.6 18.8 13.1 26.8 13.5C21.0 15.4 17.2 18.2 14.8 21.6C12.1 20.8 9.2 21.1 5.6 22.2C10.3 17.8 12.4 12.6 13.0 4.8Z"
          fill="#FFFFFF"
        />
        <path
          d="M21.4 17.6C20.2 20.3 19.9 23.2 20.7 26.5C18.6 24.9 17.0 23.4 16.0 22.1C17.6 20.0 19.3 18.5 21.4 17.6Z"
          fill="#FFFFFF"
        />
      </svg>
    </span>
  )
}

export function VisualModelIcon({
  modelId,
  label,
  size = 18,
  className,
}: {
  modelId?: string | null
  label?: string | null
  size?: number
  className?: string
}) {
  const probe = `${modelId || ''} ${label || ''}`.toLowerCase()
  if (
    probe.includes('dreamina')
    || probe.includes('seedance')
    || probe.includes('seedream')
    || probe.includes('jimeng')
    || probe.includes('即梦')
  ) {
    return <DreaminaModelBadge size={size} className={className} />
  }
  if (probe.includes('codex') || probe.includes('gpt-image') || probe.includes('openai') || probe.includes('sora')) {
    return <ProviderAppIcon provider="codex" size={size} className={className} />
  }
  if (probe.includes('grok')) {
    return <ProviderAppIcon provider="grok" size={size} className={className} />
  }
  return <ProviderAppIcon provider="thirdParty" size={size} className={className} />
}

export function ProviderAppIcon({
  provider,
  size = 28,
  className,
}: {
  provider: ProviderIconId
  size?: number
  className?: string
}) {
  const isLightPlate = provider === 'agy' || provider === 'codex'
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[24%] select-none',
        isLightPlate
          ? 'border border-border/80 bg-white shadow-[0_2px_6px_-2px_rgba(15,23,42,0.14)]'
          : 'shadow-[0_2px_8px_-2px_rgba(15,23,42,0.22)]',
        className,
      )}
    >
      <img
        src={PROVIDER_ICON_SRC[provider]}
        alt={PROVIDER_ALT[provider]}
        width={size}
        height={size}
        draggable={false}
        className="h-full w-full object-cover"
      />
    </span>
  )
}
