'use client'

import { Aperture, ArrowUpRight, Clapperboard, Image as ImageIcon, ScanLine } from 'lucide-react'
import { useTransClient } from '@/app/i18n/client'
import { useDraftBoxConfigStore } from '@/store/draft-box/draftBoxConfigStore'
import { PROMPT_MAX_LENGTH } from '../AiBatchGenerateBar/utils/helpers'

const templates = [
  { key: 'product', icon: Aperture },
  { key: 'story', icon: Clapperboard },
  { key: 'tutorial', icon: ScanLine },
] as const

export default function StudioEmptyState({ groupId, title }: { groupId: string, title: string }) {
  const { t } = useTransClient('brandPromotion')
  const current = useDraftBoxConfigStore(state => state.configs[groupId]?.promptValue ?? '')
  const updateConfig = useDraftBoxConfigStore(state => state.updateConfig)
  return (
    <section className="studio-empty">
      <div className="studio-art" aria-hidden="true">
        <span className="studio-still"><ImageIcon /></span>
        <span className="studio-film"><Clapperboard /></span>
      </div>
      <h3>{title}</h3>
      <p>{t('studio.emptyHint')}</p>
      <div className="studio-templates">
        {templates.map(({ key, icon: Icon }) => {
          const prompt = [current.trimEnd(), t(`studio.${key}Prompt`)].filter(Boolean).join('\n')
          return (
            <button key={key} type="button" disabled={prompt.length > PROMPT_MAX_LENGTH}
              onClick={event => {
                updateConfig(groupId, { promptValue: prompt })
                event.currentTarget.closest('[data-creation-workspace]')
                  ?.querySelector<HTMLElement>('[data-testid="draftbox-ai-prompt-input"]')?.focus()
              }}>
              <Icon size={15} />{t(`studio.${key}`)}<ArrowUpRight size={12} />
            </button>
          )
        })}
      </div>
    </section>
  )
}
