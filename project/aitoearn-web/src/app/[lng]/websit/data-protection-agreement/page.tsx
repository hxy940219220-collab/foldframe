import type { PageParams } from '@/app/globals'
import { documentMetadata, ProviderDocument } from '../ProviderDocument'

export function generateMetadata({ params }: PageParams) {
  return documentMetadata(params, 'data-protection-agreement')
}

export default function Page({ params }: PageParams) {
  return <ProviderDocument params={params} slug="data-protection-agreement" />
}
