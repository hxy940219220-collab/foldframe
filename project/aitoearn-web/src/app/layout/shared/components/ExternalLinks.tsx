/**
 * ExternalLinks - 文档入口组件
 */

'use client'

import { BookOpen } from 'lucide-react'
import Link from 'next/link'
import { DOCS_URL } from '../constants'

interface ExternalLinksProps {
  collapsed?: boolean
  isMobile?: boolean
}

export function ExternalLinks({ collapsed = false, isMobile = false }: ExternalLinksProps) {
  if (collapsed && !isMobile) {
    return (
      <div className="flex flex-col items-center gap-1.5 pt-3 mt-2 border-t border-sidebar-border">
        <Link
          href={DOCS_URL}
          className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
          title="PostPilot 帮助文档"
        >
          <BookOpen className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="flex items-center justify-center gap-3 border-t border-border py-3">
        <Link
          href={DOCS_URL}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" />
          帮助文档
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-3 pt-3 mt-2 border-t border-sidebar-border">
      <Link
        href={DOCS_URL}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 text-[11px] font-medium text-muted-foreground/80 hover:bg-accent hover:text-foreground hover:border-border transition-all"
      >
        <BookOpen className="w-3 h-3" />
        帮助文档
      </Link>
    </div>
  )
}
