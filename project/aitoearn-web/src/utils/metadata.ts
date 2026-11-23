import type { Metadata } from 'next'
import { BRAND_TITLE } from '@/app/config/brand'
import { getHreflang, languages } from '@/app/i18n/languageConfig'
import { getPageTitle } from './title'

const BRAND_KEYWORDS = [BRAND_TITLE]

/** 确保品牌关键词变体在 keywords 最前面，避免重复 */
function prependBrandKeyword(keywords: Metadata['keywords']): string {
  const raw = Array.isArray(keywords) ? keywords.join(', ') : (keywords || '')
  const brandSet = new Set(BRAND_KEYWORDS.map(keyword => keyword.toLowerCase().replace(/\s+/g, '')))
  const filtered = raw
    .split(',')
    .map(keyword => keyword.trim())
    .filter(keyword => !brandSet.has(keyword.toLowerCase().replace(/\s+/g, '')))

  return [...BRAND_KEYWORDS, ...filtered].join(', ')
}

/**
 * 生成页面 Metadata（符合 SEO 最佳实践）。
 * @param props 基础 Metadata 配置
 * @param lng 当前语言
 * @param path 页面路径（不含语言前缀），如 '/accounts'
 */
export async function getMetadata(props: Metadata, lng: string, path?: string): Promise<Metadata> {
  const pagePath = path || '/'
  const title = await getPageTitle(typeof props.title === 'string' ? props.title : '', lng)
  const description = typeof props.description === 'string' ? props.description : ''
  const languageAlternates = languages.reduce(
    (acc, lang) => {
      const hreflang = lang === 'en' ? 'x-default' : getHreflang(lang)
      acc[hreflang] = `/${lang}${pagePath}`
      return acc
    },
    {} as Record<string, string>,
  )
  const defaultOgImage = '/logo.png'

  return {
    ...props,
    title,
    description,
    keywords: prependBrandKeyword(props.keywords),
    referrer: 'no-referrer',
    alternates: {
      canonical: `/${lng}${pagePath}`,
      languages: languageAlternates,
      ...props.alternates,
    },
    openGraph: {
      title,
      description,
      url: `/${lng}${pagePath}`,
      siteName: BRAND_TITLE,
      locale: lng,
      type: 'website',
      images: [
        {
          url: defaultOgImage,
          width: 512,
          height: 512,
          alt: BRAND_TITLE,
        },
      ],
      ...props.openGraph,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [defaultOgImage],
      ...props.twitter,
    },
    robots: props.robots || {
      index: true,
      follow: true,
      googleBot: {
        'index': true,
        'follow': true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  }
}
