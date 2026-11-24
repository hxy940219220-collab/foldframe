/**
 * SettingsModal - 统一账号管理与工作台设置弹框
 * 收纳：账号资料与安全（头像/手机/邮箱/改密码）、工作台配置与扩展（配置管理/我的频道/浏览器插件）、通用偏好
 */

'use client'

import type { ReactNode } from 'react'
import type { SettingsTab } from '@/store/settingsModal'
import { Globe, Layers, User } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { BRAND_TITLE } from '@/app/config/brand'
import { useTransClient } from '@/app/i18n/client'
import logo from '@/assets/images/logo.png'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import {
  GeneralTab,
  ProfileTab,
  WorkspaceToolsTab,
} from './tabs'

interface TabConfig {
  key: SettingsTab
  icon: ReactNode
  label: string
  heading: string
  requireAuth?: boolean
}

export type { SettingsTab } from '@/store/settingsModal'

export interface SettingsModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: SettingsTab
}

export function SettingsModal({ open, onClose, defaultTab }: SettingsModalProps) {
  const { t } = useTransClient(['settings', 'profile'])
  const token = useUserStore(state => state.token)
  const isLoggedIn = !!token
  const [activeTab, setActiveTab] = useState<SettingsTab>(isLoggedIn ? 'profile' : 'general')
  const tabContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && defaultTab) {
      if (defaultTab === 'profile' && !isLoggedIn) {
        setActiveTab('general')
      }
      else {
        setActiveTab(defaultTab)
      }
    }
  }, [open, defaultTab, isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn && activeTab === 'profile') {
      setActiveTab('general')
    }
  }, [isLoggedIn, activeTab])

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => {
      const container = tabContainerRef.current
      if (!container || container.scrollWidth <= container.clientWidth) return
      const activeElement = container.querySelector(`[data-tab-key="${activeTab}"]`) as HTMLElement | null
      if (!activeElement) return
      const containerWidth = container.clientWidth
      const tabCenter = activeElement.offsetLeft + activeElement.offsetWidth / 2
      const targetScroll = Math.max(0, Math.min(tabCenter - containerWidth / 2, container.scrollWidth - containerWidth))
      container.scrollTo({ left: targetScroll, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTab, open])

  const tabConfigs: TabConfig[] = [
    {
      key: 'profile',
      icon: <User className="h-4 w-4" />,
      label: '账号资料与安全',
      heading: '账号管理',
      requireAuth: true,
    },
    {
      key: 'workspace',
      icon: <Layers className="h-4 w-4" />,
      label: '工作台与扩展',
      heading: '配置管理 · 频道与扩展',
    },
    {
      key: 'general',
      icon: <Globe className="h-4 w-4" />,
      label: t('tabs.general'),
      heading: t('tabs.general'),
    },
  ]

  const visibleTabs = tabConfigs.filter(tab => !(tab.requireAuth && !isLoggedIn))
  const currentTabConfig = visibleTabs.find(tab => tab.key === activeTab) || visibleTabs[0]

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return isLoggedIn ? <ProfileTab onClose={onClose} /> : <GeneralTab />
      case 'workspace':
        return <WorkspaceToolsTab onClose={onClose} />
      case 'general':
        return <GeneralTab />
      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent
        className="w-[95vw] max-w-[920px] gap-0 overflow-hidden p-0 sm:p-0 md:w-[920px]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{currentTabConfig?.heading || '账号管理'}</DialogTitle>

        <div className="flex h-[85vh] max-h-[680px] flex-col overflow-hidden md:h-[74vh] md:max-h-[700px] md:flex-row">
          {/* 侧边栏 */}
          <div className="flex w-full shrink-0 flex-col overflow-hidden border-b border-border bg-muted/20 md:w-56 md:border-b-0 md:border-r">
            <div className="flex h-14 shrink-0 items-center gap-2.5 px-4 md:h-auto md:px-5 md:py-4">
              <Image src={logo} alt={BRAND_TITLE} width={26} height={26} className="hidden rounded-md md:block md:h-7 md:w-7" />
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight text-foreground md:text-base">
                  <span className="md:hidden">账号管理</span>
                  <span className="hidden md:inline">{BRAND_TITLE}</span>
                </div>
                <div className="hidden text-[11px] text-muted-foreground md:block">账号与工作台中心</div>
              </div>
            </div>

            <div
              ref={tabContainerRef}
              className="relative flex gap-1 overflow-x-auto px-3 pb-3 scrollbar-none snap-x snap-mandatory md:flex-col md:overflow-x-visible md:px-3 md:pb-4 md:snap-none"
            >
              {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-tab-key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'snap-center flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-all cursor-pointer md:py-2.5 md:text-sm',
                      isActive
                        ? 'bg-primary/[0.09] font-semibold text-primary shadow-2xs'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="relative flex items-center justify-center">{tab.icon}</span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 右侧内容区域 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="hidden shrink-0 items-center justify-between border-b border-border md:flex md:px-6 md:py-4">
              <h2 className="text-base font-semibold text-foreground md:text-lg">
                {currentTabConfig?.heading || '账号管理'}
              </h2>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5">
              <div className="flex min-h-full min-w-0 flex-col">{renderContent()}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsModal
