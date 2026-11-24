/**
 * UserDropdownMenu - 底部账号管理入口与快捷下拉菜单
 * 收纳：账号管理（头像/手机/邮箱/改密码）、配置管理、我的频道、浏览器插件、文档与通用设置
 */

'use client'

import type { SidebarCommonProps } from '../types'
import type { SettingsTab } from '@/store/settingsModal'
import {
  BookOpen,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  Puzzle,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Tv,
  UserCog,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useTransClient } from '@/app/i18n/client'
import { DOCS_URL } from '@/app/layout/shared/constants'
import { useChannelManagerStore } from '@/components/ChannelManager'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAccountStore } from '@/store/account'
import { useConfigManagerDialogStore } from '@/store/configManagerDialog'
import { usePluginStore } from '@/store/plugin'
import { PluginStatus } from '@/store/plugin/types/baseTypes'
import { useUserStore } from '@/store/user'
import { navigateToLogin } from '@/utils/auth'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'

export interface UserDropdownMenuProps extends SidebarCommonProps {
  /** 打开账号与设置弹框 */
  onOpenSettings: (defaultTab?: SettingsTab) => void
}

/** 菜单项组件 */
function MenuItem({
  icon: Icon,
  label,
  rightContent,
  onClick,
  href,
  external,
  className,
  testId,
}: {
  icon: React.ElementType
  label: string
  rightContent?: React.ReactNode
  onClick?: () => void
  href?: string
  external?: boolean
  className?: string
  testId?: string
}) {
  const content = (
    <>
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {rightContent}
    </>
  )

  const baseClassName = cn(
    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent',
    className,
  )

  if (href) {
    if (external) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          data-testid={testId}
          className={baseClassName}
        >
          {content}
        </a>
      )
    }
    return (
      <Link href={href} onClick={onClick} data-testid={testId} className={baseClassName}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} data-testid={testId} className={cn(baseClassName, 'border-none bg-transparent')}>
      {content}
    </button>
  )
}

/** 已登录用户的下拉菜单内容 */
function LoggedInMenuContent({
  onOpenSettings,
  onClose,
}: {
  onOpenSettings: (defaultTab?: SettingsTab) => void
  onClose: () => void
}) {
  const { t } = useTransClient(['common', 'account'])
  const userInfo = useUserStore(state => state.userInfo)
  const openConfigDialog = useConfigManagerDialogStore(state => state.openDialog)
  const openChannelManager = useChannelManagerStore(state => state.openModal)
  const accountCount = useAccountStore(state => state.accountList?.length ?? 0)
  const { pluginStatus, openPluginModal } = usePluginStore(
    useShallow(state => ({
      pluginStatus: state.status,
      openPluginModal: state.openPluginModal,
    })),
  )

  const pluginBadge = pluginStatus === PluginStatus.READY
    ? { label: t('common:pluginStatus.ready'), cls: 'bg-emerald-500/10 text-emerald-700' }
    : { label: t('common:pluginStatus.notInstalled'), cls: 'bg-muted text-muted-foreground' }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {/* 用户资料头（点击直达账号管理） */}
      <button
        type="button"
        onClick={() => {
          onOpenSettings('profile')
          onClose()
        }}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-accent cursor-pointer"
      >
        <Avatar className="h-9 w-9 shrink-0 border border-border">
          <AvatarImage
            src={getOssUrl(userInfo?.avatar) || ''}
            alt={userInfo?.name || t('common:unknownUser')}
          />
          <AvatarFallback className="bg-gradient-back text-xs font-semibold text-white">
            {userInfo?.name?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground" data-testid="sidebar-user-name">
            {userInfo?.name || t('common:unknownUser')}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {userInfo?.mail || userInfo?.phone || '点击管理资料与安全'}
          </span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      <div className="my-1 h-px bg-border" />

      {/* 账号与工作台核心入口（原底栏收纳项） */}
      <MenuItem
        icon={UserCog}
        label="账号管理"
        rightContent={<span className="text-[10.5px] text-muted-foreground">资料 / 安全</span>}
        testId="user-menu-account"
        onClick={() => {
          onOpenSettings('profile')
          onClose()
        }}
      />
      <MenuItem
        icon={SlidersHorizontal}
        label={t('common:configManagement')}
        testId="sidebar-config-manager"
        onClick={() => {
          openConfigDialog('sidebar')
          onClose()
        }}
      />
      <MenuItem
        icon={Tv}
        label={t('account:channelManager.myChannels')}
        rightContent={accountCount > 0 ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">{accountCount}</span> : undefined}
        testId="sidebar-my-channels"
        onClick={() => {
          openChannelManager()
          onClose()
        }}
      />
      <MenuItem
        icon={Puzzle}
        label={t('common:plugin')}
        rightContent={<span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', pluginBadge.cls)}>{pluginBadge.label}</span>}
        testId="sidebar-plugin"
        onClick={() => {
          openPluginModal()
          onClose()
        }}
      />

      <div className="my-1 h-px bg-border" />

      {/* 文档 */}
      <div className="group/docs relative">
        <div className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent">
          <BookOpen size={16} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">{t('common:documents')}</span>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>
        <div className="invisible absolute left-full bottom-0 z-50 pl-1 opacity-0 transition-all group-hover/docs:visible group-hover/docs:opacity-100">
          <div className="w-52 rounded-xl border bg-popover p-1.5 shadow-lg">
            <MenuItem icon={FileText} label={t('common:helpDocs')} href={DOCS_URL} onClick={onClose} />
            <MenuItem icon={FileText} label={t('common:pluginGuide')} href="/websit/plugin-guide" onClick={onClose} />
            <MenuItem icon={Shield} label={t('common:privacyPolicy')} href="/websit/privacy-policy" onClick={onClose} />
            <MenuItem icon={ScrollText} label={t('common:termsOfService')} href="/websit/terms-of-service" onClick={onClose} />
          </div>
        </div>
      </div>

      <div className="my-1 h-px bg-border" />

      {/* 通用偏好 */}
      <div data-testid="sidebar-settings-entry">
        <MenuItem
          icon={Settings}
          label="偏好设置"
          onClick={() => {
            onOpenSettings('general')
            onClose()
          }}
        />
      </div>
    </div>
  )
}

export function UserDropdownMenu({ collapsed, onOpenSettings }: UserDropdownMenuProps) {
  const token = useUserStore(state => state.token)
  const userInfo = useUserStore(state => state.userInfo)
  const hasHydrated = useUserStore(state => state._hasHydrated)
  const { t } = useTransClient('common')
  const [open, setOpen] = useState(false)

  if (!hasHydrated) {
    if (collapsed) {
      return <Skeleton className="h-9 w-9 rounded-md" />
    }
    return <Skeleton className="mt-2 h-10 w-full rounded-xl" />
  }

  if (!token) {
    const handleLogin = () => navigateToLogin()
    if (collapsed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleLogin} size="icon" className="h-9 w-9" data-testid="sidebar-login-btn">
                <span className="text-sm font-semibold">In</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{t('login')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }

    return (
      <Button onClick={handleLogin} className="mt-2 w-full" data-testid="sidebar-login-btn">
        {t('login')}
      </Button>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center rounded-xl transition-colors hover:bg-accent',
        collapsed ? 'p-1' : 'px-2 py-1.5',
      )}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpen(false)
                    onOpenSettings('profile')
                  }}
                  data-testid="sidebar-user-trigger"
                  className={cn(
                    'relative flex flex-1 cursor-pointer items-center border-none bg-transparent',
                    collapsed ? 'justify-center' : 'gap-2.5',
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0 border border-border shadow-2xs">
                    <AvatarImage
                      src={getOssUrl(userInfo?.avatar) || ''}
                      alt={userInfo?.name || t('unknownUser')}
                    />
                    <AvatarFallback className="bg-gradient-back text-xs font-semibold text-white">
                      {userInfo?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>

                  {!collapsed && (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="w-full truncate text-left text-sm font-semibold text-foreground">
                          {userInfo?.name || t('unknownUser')}
                        </span>
                        <span className="w-full truncate text-left text-[11px] text-muted-foreground">
                          账号与工作台配置
                        </span>
                      </div>
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                    </>
                  )}
                </button>
              </TooltipTrigger>
            </PopoverTrigger>
            {collapsed && !open && (
              <TooltipContent side="right">
                <p>账号管理</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <PopoverContent
          side={collapsed ? 'right' : 'top'}
          align={collapsed ? 'end' : 'start'}
          className="w-64 rounded-2xl p-0 shadow-xl"
          sideOffset={6}
          data-testid="sidebar-user-menu"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <LoggedInMenuContent onOpenSettings={onOpenSettings} onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
