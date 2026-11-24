'use client'

import type { CatalogSkill } from './catalog'
import { ArrowUpRight, CheckCircle2, Search, Sparkles, X, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/className'

const categories = ['all', 'creation', 'editing', 'library'] as const
type Category = typeof categories[number]

const skillGroups: Record<string, Exclude<Category, 'all'>> = {
  'planning-social-content': 'creation',
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

const FEATURED_SKILL_IDS = [
  'planning-social-content',
  'generating-images',
  'generating-videos',
  'editing-videos',
]

const SKILL_TAGS: Record<string, string> = {
  'planning-social-content': '跨平台改写 · 分镜排期',
  'generating-images': '商业出图 · 2K/4K',
  'generating-videos': '动态成片 · 运镜控制',
  'generating-drama-recaps': '脚本配音 · 短剧解说',
  'editing-videos': '精细剪辑 · 音轨转场',
  'composing-videos': '多轨混剪 · 背景配乐',
  'editing-images': '精修调色 · 水印裁切',
  'removing-subtitles': '画面修复 · 去硬字幕',
  'transferring-video-styles': '风格转绘 · 漫剧/国风',
  'translating-videos': '出海配音 · 口型同步',
  'analyzing-videos': '爆款拆解 · 节奏分析',
  'extracting-thumbnails': '高点抽帧 · 爆款封面',
  'managing-content': '素材归档 · 分组协同',
  'crawling-social-media': '热点参考 · 链接解析',
}

const KNOWN_SKILL_ICON_IDS = new Set(Object.keys(SKILL_TAGS))

function SkillBrandBadge({ skillId, size = 'md' }: { skillId: string, size?: 'sm' | 'md' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasAsset = KNOWN_SKILL_ICON_IDS.has(skillId) && !imgFailed
  const boxClass = size === 'sm' ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-2xl'

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden select-none border border-black/[0.07] bg-white shadow-[0_2px_10px_-4px_rgba(15,23,42,0.16)] transition-transform duration-200 group-hover:scale-105 dark:border-white/10',
        boxClass,
      )}
    >
      {hasAsset ? (
        <img
          src={`/assets/skills/${skillId}.png?v=2`}
          alt={skillId}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Sparkles className="h-5 w-5 text-primary" />
      )}
    </div>
  )
}

const categoryOrder = categories.slice(1)

export default function SkillCatalog({ catalog }: { catalog: CatalogSkill[] | null }) {
  const { t } = useTransClient('skills')
  const router = useRouter()
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const needle = query.trim().toLocaleLowerCase()

  const all = useMemo(() => (catalog ?? []).map(skill => ({
    ...skill,
    title: t(`names.${skill.id}`, { defaultValue: skill.name }),
    summary: t(`summaries.${skill.id}`, { defaultValue: skill.description }),
    category: skillGroups[skill.id] || 'library',
    tag: SKILL_TAGS[skill.id] || '内置工作流',
  })), [catalog, t])

  const featured = useMemo(
    () => FEATURED_SKILL_IDS.map(id => all.find(s => s.id === id)).filter((s): s is (typeof all)[number] => Boolean(s)),
    [all],
  )

  const visible = useMemo(() => all
    .filter(skill =>
      (category === 'all' || category === skill.category)
      && [skill.title, skill.id, skill.summary, skill.description, skill.tag].join(' ').toLocaleLowerCase().includes(needle),
    )
    .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)), [all, category, needle])

  const activeSkill = all.find(s => s.id === activeSkillId) || null
  const showFeaturedSection = !needle && category === 'all' && featured.length > 0

  const renderSkillCard = (skill: (typeof all)[number], featuredCard = false) => (
    <button
      key={featuredCard ? `feat-${skill.id}` : skill.id}
      type="button"
      data-testid={featuredCard ? `featured-skill-card-${skill.id}` : `skill-card-${skill.id}`}
      onClick={() => setActiveSkillId(skill.id)}
      className={cn(
        'group flex items-start gap-3.5 rounded-2xl border border-border/80 bg-card/95 p-4 text-left transition-all duration-200 cursor-pointer',
        'shadow-[0_2px_12px_-8px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_12px_28px_-14px_rgba(67,56,202,0.22)]',
      )}
    >
      <SkillBrandBadge skillId={skill.id} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[14.5px] font-semibold text-foreground transition-colors group-hover:text-primary">
              {skill.title}
            </h3>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {skill.summary}
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-white"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground/75">
            <Zap className="h-3 w-3 text-primary/75" />
            {skill.tag}
          </span>
          <code className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {skill.id}
          </code>
        </div>
      </div>
    </button>
  )

  return (
    <div className="min-h-full bg-background">
      {/* 统一吸顶顶栏（参考 SkillHub 顶部工具条） */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/90 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-gradient-foreground shadow-sm shadow-primary/20">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">{t('title')}</h1>
            {catalog && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                已启用 ({catalog.length})
              </span>
            )}
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t('search')}
            value={query}
            placeholder="搜索技能名称或用途"
            onChange={e => setQuery(e.target.value)}
            className="h-8.5 rounded-xl bg-background pl-8.5 pr-8 text-xs shadow-2xs"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clear')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-7 px-6 py-6 md:px-8">
        {catalog === null ? (
          <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{t('loadError')}</p>
            <Button variant="outline" onClick={() => router.refresh()}>{t('retry')}</Button>
          </div>
        ) : (
          <>
            {/* 精选技能（参考图 1 顶部 2 列精选区） */}
            {showFeaturedSection && (
              <section className="space-y-3" data-testid="skills-featured-grid">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">精选技能</h2>
                  <span className="text-xs text-muted-foreground">高频商业创作核心能力 · 创作副驾自动调度</span>
                </div>
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {featured.map(skill => renderSkillCard(skill, true))}
                </div>
              </section>
            )}

            {/* 全部技能 + 分类筛选条（参考图 1 推荐技能双列卡片） */}
            <section className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-1 text-sm font-semibold text-foreground">全部技能</h2>
                  <div role="group" aria-label={t('type')} className="inline-flex flex-wrap items-center gap-1.5">
                    {categories.map((value) => {
                      const active = category === value
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setCategory(value)}
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
                            active
                              ? 'bg-primary/12 text-primary font-semibold'
                              : 'bg-card border border-border/75 text-muted-foreground hover:text-foreground hover:border-border',
                          )}
                        >
                          {t(`categories.${value}`)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  共 {visible.length} 项技能 · 点击卡片查看完整规范
                </span>
              </div>

              {visible.length ? (
                <div data-testid="skills-card-grid" className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {visible.map(skill => renderSkillCard(skill, false))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16 text-center" role="status">
                  <Search className="mb-3 h-7 w-7 text-muted-foreground/60" />
                  <p className="mb-4 text-sm text-muted-foreground">{all.length ? t('noMatch') : t('empty')}</p>
                  {(query || category !== 'all') && (
                    <Button variant="outline" size="sm" onClick={() => { setQuery(''); setCategory('all') }}>
                      {t('reset')}
                    </Button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* 技能详情弹窗 */}
      {activeSkill && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setActiveSkillId(null)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <SkillBrandBadge skillId={activeSkill.id} size="sm" />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-bold text-foreground">{activeSkill.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <code>{activeSkill.id}/SKILL.md</code>
                    <span>·</span>
                    <span>{activeSkill.tag}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSkillId(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
              <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} disallowedElements={['img']}>
                {activeSkill.body}
              </ReactMarkdown>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/25 px-5 py-3">
              <span className="text-[11px] text-muted-foreground">
                AI 策划台与创作副驾会自动按需调用此技能
              </span>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg bg-gradient-back px-3.5 text-xs text-gradient-foreground shadow-xs hover:opacity-95 cursor-pointer"
                onClick={() => {
                  const id = activeSkill.id
                  setActiveSkillId(null)
                  const preset = id === 'planning-social-content'
                    ? encodeURIComponent('请调用多平台运营策划技能，帮我针对以下主题输出跨平台策划方案：')
                    : ''
                  router.push(preset ? `/ai-social?prompt=${preset}` : '/ai-social')
                }}
              >
                去 AI 策划台使用
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
