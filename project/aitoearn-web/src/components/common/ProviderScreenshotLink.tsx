'use client'

import { ExternalLink } from 'lucide-react'
import { useTransClient } from '@/app/i18n/client'

// These original screenshots identify the external extension in its store or browser UI.
const providerScreens = new Set(['pluginGuideImg1-2', 'pluginGuideImg1-3', 'pluginGuideImg1-5', 'pluginGuideImg3', 'pluginGuideImg8', 'pluginGuideImg10']
  .map(name => `/assets/plugin-guide-images/${name}.png`))

export function isProviderScreenshot(path: string) {
  return providerScreens.has(path)
}

export function ProviderScreenshotLink({ src, description }: { src: string, description: string }) {
  const { t } = useTransClient('pluginGuide')
  return (
    <figure className="my-4 space-y-1">
      <a href={src} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">
        {t('originalScreenshot')}<ExternalLink size={14} aria-hidden />
      </a>
      <figcaption className="text-xs text-muted-foreground">{description}</figcaption>
    </figure>
  )
}
