import type { PageParams } from '@/app/globals'
import { documentMetadata, ProviderDocument } from '../ProviderDocument'

export function generateMetadata({ params }: PageParams) {
  return documentMetadata(params, 'privacy-policy')
}

export default function Page({ params }: PageParams) {
  return <ProviderDocument params={params} slug="privacy-policy" />
}
