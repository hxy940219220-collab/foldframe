import type { PageParams } from '@/app/globals'
import { documentMetadata, ProviderDocument } from '../ProviderDocument'

export function generateMetadata({ params }: PageParams) {
  return documentMetadata(params, 'data-deletion')
}

export default function Page({ params }: PageParams) {
  return <ProviderDocument params={params} slug="data-deletion" />
}
