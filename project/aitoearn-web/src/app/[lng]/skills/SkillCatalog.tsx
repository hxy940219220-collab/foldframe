'use client'

import type { CatalogSkill } from './catalog'
import { ChevronDown, Clapperboard, FileText, FolderOpen, PencilRuler, Search, Sparkles, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import styles from './SkillCatalog.module.scss'

const categories = ['all', 'creation', 'editing', 'library'] as const
type Category = typeof categories[number]
const skillGroups: Record<string, Exclude<Category, 'all'>> = {
  'generating-images': 'creation',
  'generating-videos': 'creation',
  'generating-drama-recaps': 'creation',
  'editing-images': 'editing',
  'editing-videos': 'editing',
  'transferring-video-styles': 'editing',
  'composing-videos': 'editing',
  'translating-videos': 'editing',
  'removing-subtitles': 'editing',
  'analyzing-videos': 'library',
  'extracting-thumbnails': 'library',
  'managing-content': 'library',
  'crawling-social-media': 'library',
}
const categoryIcons = { creation: Sparkles, editing: PencilRuler, library: FolderOpen }
const categoryOrder = categories.slice(1)

export default function SkillCatalog({ catalog }: { catalog: CatalogSkill[] | null }) {
  const { t } = useTransClient('skills')
  const router = useRouter()
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const needle = query.trim().toLocaleLowerCase()
  const all = (catalog ?? []).map(skill => ({
    ...skill,
    title: t(`names.${skill.id}`, { defaultValue: skill.name }),
    summary: t(`summaries.${skill.id}`, { defaultValue: skill.description }),
    category: skillGroups[skill.id],
  }))
  const visible = all.filter(skill =>
    (category === 'all' || category === skill.category)
    && [skill.title, skill.id, skill.summary, skill.description].join(' ').toLocaleLowerCase().includes(needle),
  ).sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))
  return (
    <div className={styles.canvas}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>{t('title')}</h1>
          {catalog && <span>{t('count', { count: catalog.length })}</span>}
        </header>
        {catalog === null ? (
          <div role="alert" className={styles.empty}>
            <p>{t('loadError')}</p>
            <Button variant="outline" onClick={() => router.refresh()}>{t('retry')}</Button>
          </div>
        ) : (
          <>
            <div className={styles.controls}>
              <div role="group" aria-label={t('type')} className={styles.filters}>
                {categories.map(value => (
                  <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>
                    {t(`categories.${value}`)}
                  </button>
                ))}
              </div>
              <div className={styles.search}>
                <Search aria-hidden size={16} />
                <Input type="search" aria-label={t('search')} value={query} placeholder={t('search')}
                  onChange={e => setQuery(e.target.value)} />
                {query && <button type="button" onClick={() => setQuery('')} aria-label={t('clear')}><X size={15} /></button>}
              </div>
            </div>
            {visible.length ? (
              <ul className={styles.list}>
                {visible.map(skill => {
                  const Icon = categoryIcons[skill.category] ?? Clapperboard
                  const open = expanded === skill.id
                  return (
                    <li key={skill.id}>
                      <button className={styles.row} type="button" aria-expanded={open}
                        aria-controls={`skill-${skill.id}`} onClick={() => setExpanded(open ? null : skill.id)}>
                        <span className={styles.icon}><Icon size={18} strokeWidth={1.6} /></span>
                        <span className={styles.text}><strong>{skill.title}</strong><span>{skill.summary}</span></span>
                        <code className={styles.slug}>{skill.id}</code>
                        <ChevronDown aria-hidden size={16} className={styles.chevron} />
                      </button>
                      <div id={`skill-${skill.id}`} hidden={!open} className={styles.detail}>
                        {open && (
                          <>
                            <p className={styles.filename}><FileText size={14} aria-hidden />{skill.id}/SKILL.md</p>
                            <div className={styles.document}>
                              <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} disallowedElements={['img']}>{skill.body}</ReactMarkdown>
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className={styles.empty} role="status">
                <Search size={25} strokeWidth={1.4} aria-hidden />
                <p>{all.length ? t('noMatch') : t('empty')}</p>
                {(query || category !== 'all') && <Button variant="outline" onClick={() => { setQuery(''); setCategory('all') }}>{t('reset')}</Button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
