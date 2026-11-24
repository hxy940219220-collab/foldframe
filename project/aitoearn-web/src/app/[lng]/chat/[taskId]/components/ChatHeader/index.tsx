/**
 * ChatHeader - 对话页面顶部导航栏
 * 显示返回按钮、标题、生成状态
 */
'use client'

import type { IDisplayMessage } from '@/store/agent'
import { ArrowLeft, Bot, Heart, Loader2, Pencil, Share2, X } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { ChatExportMenu } from '@/components/Chat/ChatExportMenu'
import ShareModal from '@/components/Chat/Share/ShareModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'
import styles from '../../../layout.module.css'

const STORAGE_KEY = 'chat-announcement-dismissed'

/** PC 端公告提示 */
function DesktopAnnouncementTip() {
  const { t } = useTransClient('home')
  const text = t('announcement.text')
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [needsScroll, setNeedsScroll] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === 'true')
    }
    catch {
      setDismissed(false)
    }
  }, [])

  useEffect(() => {
    if (dismissed)
      return

    const checkScroll = () => {
      if (containerRef.current && textRef.current) {
        setNeedsScroll(textRef.current.scrollWidth > containerRef.current.offsetWidth)
      }
    }

    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [text, dismissed])

  const handleDismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(STORAGE_KEY, 'true')
    }
    catch {
      // ignore
    }
  }

  if (dismissed)
    return null

  return (
    <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 max-w-md">
      <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center">
        {needsScroll ? (
          <div className={styles.marquee}>
            <span ref={textRef} className="text-xs text-muted-foreground whitespace-nowrap pr-6">
              {text}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap pr-6">{text}</span>
          </div>
        ) : (
          <span ref={textRef} className="text-xs text-muted-foreground whitespace-nowrap">
            {text}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer shrink-0"
        aria-label="关闭"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export interface IChatHeaderProps {
  /** 任务标题 */
  title?: string
  /** 默认标题（任务标题为空时显示） */
  defaultTitle: string
  /** 是否正在生成 */
  isGenerating: boolean
  /** 生成进度（0-100） */
  progress: number
  /** 思考中文案 */
  thinkingText: string
  /** 任务ID */
  taskId?: string
  /** 当前对话消息列表（用于多格式打包导出） */
  messages?: IDisplayMessage[]
  /** 是否已点赞 */
  isFavorited?: boolean
  /** 点赞加载中 */
  isFavoriteLoading?: boolean
  /** 点赞切换回调 */
  onFavoriteToggle?: () => void | Promise<void>
  /** 编辑标题回调 */
  onEditTitle?: () => void
  /** 返回按钮点击 */
  onBack: () => void
}

export function ChatHeader({
  title,
  defaultTitle,
  isGenerating,
  progress,
  thinkingText,
  onBack,
  taskId,
  messages = [],
  isFavorited = false,
  isFavoriteLoading = false,
  onFavoriteToggle,
  onEditTitle,
}: IChatHeaderProps) {
  const { t } = useTransClient('chat')
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <header className="flex items-center gap-3 px-4 py-3 shrink-0" id="chatHeader">
      {/* 返回按钮 */}
      <Button variant="ghost" size="icon" onClick={onBack} className="w-8 h-8">
        <ArrowLeft className="w-5 h-5" />
      </Button>

      {/* 标题 + 编辑 icon */}
      <button
        onClick={onEditTitle}
        className="flex items-center gap-1.5 group cursor-pointer hover:opacity-80 transition-opacity"
        aria-label={t('task.editTitle')}
      >
        <h1 className="text-base font-medium text-foreground line-clamp-1">
          {title || defaultTitle}
        </h1>
        <Pencil className="w-4 h-4 text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* PC 端公告提示 */}
      <DesktopAnnouncementTip />

      {/* 右侧区域：点赞 + 分享 + 导出汇总 */}
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2">
          {/* 点赞按钮 */}
          <Button
            variant="ghost"
            data-testid="chat-like-button"
            onClick={onFavoriteToggle}
            disabled={isFavoriteLoading}
            className="ml-1 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-2 cursor-pointer"
            aria-label={isFavorited ? t('task.unfavorite') : t('task.favorite')}
          >
            {isFavoriteLoading ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Heart
                className={cn(
                  'w-4.5 h-4.5 transition-colors',
                  isFavorited && 'text-red-500 fill-red-500',
                )}
              />
            )}
            <span>{isFavorited ? t('task.unfavorite') : t('task.favorite')}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => setShareOpen(true)}
            className="ml-1 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 h-8 px-2 cursor-pointer"
          >
            <Share2 className="w-4.5 h-4.5" />
            <span>{t('task.share')}</span>
          </Button>
          <ChatExportMenu title={title || defaultTitle} messages={messages} />
        </div>
      </div>
      <ShareModal taskId={taskId ?? ''} open={shareOpen} onOpenChange={v => setShareOpen(v)} />
    </header>
  )
}
