/**
 * LayoutSidebar - 左侧侧边栏布局组件
 * 精简清爽布局：Logo + 主导航 + 底部统一账号管理入口（配置管理、我的频道、浏览器插件均收纳至账号管理中）
 * 支持展开/收缩两种状态
 */
'use client'

import type { IRouterDataItem } from '../routerData'
import type { NavItemData } from './types'
import { useShallow } from 'zustand/shallow'
import { useNavigationLogic, useVisibleRouterData } from '@/app/layout/shared'
import { useSettingsModalStore } from '@/store/settingsModal'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import { LogoSection, NavSection, UserDropdownMenu } from './components'

/**
 * 侧边栏主组件
 */
function LayoutSidebar() {
  const { currRouter, isAuthPage } = useNavigationLogic()
  const visibleRoutes = useVisibleRouterData()

  // 获取侧边栏状态和设置方法
  const { sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed } = useUserStore(
    useShallow(state => ({
      sidebarCollapsed: state.sidebarCollapsed,
      setSidebarCollapsed: state.setSidebarCollapsed,
    })),
  )

  const { openSettings } = useSettingsModalStore()

  const mapNavItem = (item: IRouterDataItem): NavItemData => ({
    path: item.path,
    translationKey: item.translationKey,
    icon: item.icon,
    children: item.children?.map(mapNavItem),
  })

  // 首页、auth、websit 页面不显示侧边栏
  if (isAuthPage) {
    return null
  }

  // 转换路由数据为 NavSection 所需格式
  const navItems = visibleRoutes.filter(item => item.translationKey !== 'myTasks').map(mapNavItem)

  return (
    <aside
      className={cn(
        'group sticky left-0 top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar p-3 transition-all duration-300 md:flex',
        collapsed ? 'w-[68px] min-w-[68px]' : 'w-[240px] min-w-[240px]',
      )}
    >
      {/* Logo 区域 - 固定 */}
      <LogoSection collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* 可滚动区域：主导航 */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <NavSection items={navItems} currentRoute={currRouter!} collapsed={collapsed} />
      </div>

      {/* 底部固定区域：统一账号管理入口 */}
      <div className="mt-2 flex-shrink-0 border-t border-sidebar-border pt-2.5">
        <UserDropdownMenu collapsed={collapsed} onOpenSettings={openSettings} />
      </div>
    </aside>
  )
}

export default LayoutSidebar
