import type { PageParams } from '@/app/globals'
import { documentMetadata, ProviderDocument } from '../ProviderDocument'

export function generateMetadata({ params }: PageParams) {
  return documentMetadata(params, 'terms-of-service')
}

export default function Page({ params }: PageParams) {
  return <ProviderDocument params={params} slug="terms-of-service" />
}
