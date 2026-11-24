import type { PageParams } from '@/app/globals'
import { useTranslation } from '@/app/i18n'
import { fallbackLng, languages } from '@/app/i18n/settings'
import { getMetadata } from '@/utils/metadata'
import HelpDocsContent from './HelpDocsContent'

export async function generateMetadata({ params }: PageParams) {
  const { lng } = await params
  const language = languages.includes(lng) ? lng : fallbackLng
  const { t } = await useTranslation(language, 'websit')
  return getMetadata({
    title: t('helpDocs.title'),
    description: t('helpDocs.description'),
    keywords: t('helpDocs.keywords'),
  }, language, '/websit/help-docs')
}

export default async function HelpDocsPage({ params }: PageParams) {
  const { lng } = await params
  const language = languages.includes(lng) ? lng : fallbackLng
  return <HelpDocsContent lng={language} />
}
