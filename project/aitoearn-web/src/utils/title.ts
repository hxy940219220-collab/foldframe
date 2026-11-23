/**
 * title.ts - 页面标题工具
 */

import { BRAND_TITLE } from '@/app/config/brand'

export async function getPageTitle(name: string, _lng: string) {
  return name ? `${BRAND_TITLE} · ${name}` : BRAND_TITLE
}
