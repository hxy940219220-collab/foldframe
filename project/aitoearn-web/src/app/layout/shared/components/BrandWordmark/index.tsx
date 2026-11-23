/**
 * BrandWordmark - 布局区域复用的品牌字标
 */

import { cn } from '@/utils/className'

import { BRAND_TITLE } from '@/app/config/brand'

export { BRAND_TITLE }

type BrandWordmarkTag = 'h1' | 'span'
type BrandWordmarkSize = 'sidebar' | 'mobile'

export interface BrandWordmarkProps {
  as?: BrandWordmarkTag
  size?: BrandWordmarkSize
  className?: string
}

const WORDMARK_SIZE_CLASSNAME: Record<BrandWordmarkSize, string> = {
  sidebar: 'text-xl tracking-[-0.045em]',
  mobile: 'text-base tracking-[-0.04em]',
}

export function BrandWordmark({
  as = 'span',
  size = 'sidebar',
  className,
}: BrandWordmarkProps) {
  const Component = as

  return (
    <Component
      className={cn(
        'm-0 flex select-none items-baseline whitespace-nowrap font-semibold leading-none',
        WORDMARK_SIZE_CLASSNAME[size],
        className,
      )}
      aria-label={BRAND_TITLE}
    >
      {BRAND_TITLE}
    </Component>
  )
}
