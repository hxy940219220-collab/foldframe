import type { PageParams } from '@/app/globals'
import { Download, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/app/i18n'
import { fallbackLng, languages } from '@/app/i18n/settings'
import { buttonVariants } from '@/components/ui/button'
import { getMetadata } from '@/utils/metadata'

const documents = {
  'privacy-policy': 'privacyPolicy',
  'terms-of-service': 'termsOfService',
  'data-protection-agreement': 'dataProtection',
  'data-deletion': 'dataDeletion',
  'extension-privacy-policy': 'extensionPrivacy',
} as const

type DocumentSlug = keyof typeof documents

async function getDocumentContext(params: PageParams['params']) {
  const { lng } = await params
  const language = languages.includes(lng) ? lng : fallbackLng
  const { t } = await useTranslation(language, 'websit')
  return { language, t }
}

export async function documentMetadata(params: PageParams['params'], slug: DocumentSlug) {
  const { language, t } = await getDocumentContext(params)
  const key = documents[slug]
  return getMetadata({
    title: t(`${key}.title`),
    description: t(`${key}.description`),
    keywords: t(`${key}.keywords`),
  }, language, `/websit/${slug}`)
}

export async function ProviderDocument({ params, slug }: PageParams & { slug: DocumentSlug }) {
  const { language, t } = await getDocumentContext(params)
  const key = documents[slug]
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-12 sm:py-20">
      <p className="mb-3 text-sm font-medium text-muted-foreground">{t('providerDocument.heading')}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{t(`${key}.title`)}</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">{t(`${key}.description`)}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={`https://aitoearn.ai/${language}/websit/${slug}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline' })}>
          {t('providerDocument.current')}<ExternalLink aria-hidden />
        </a>
        <a href={`/provider-documents/${slug}.txt`} download className={buttonVariants({ variant: 'ghost' })}>
          <Download aria-hidden />{t('providerDocument.bundled')}
        </a>
      </div>
    </article>
  )
}
