/**
 * WorkspaceToolsTab - 工作台配置、频道授权与 PostPilot 浏览器扩展中心
 * 集中收纳原侧边栏底部的「配置管理」「我的频道」「浏览器插件」
 */

'use client'

import { BookOpen, Download, Puzzle, SlidersHorizontal, Tv } from 'lucide-react'
import Link from 'next/link'
import { useShallow } from 'zustand/shallow'
import { DOCS_URL } from '@/app/layout/shared/constants'
import { useChannelManagerStore } from '@/components/ChannelManager'
import { Button } from '@/components/ui/button'
import { useAccountStore } from '@/store/account'
import { useConfigManagerDialogStore } from '@/store/configManagerDialog'
import { usePluginStore } from '@/store/plugin'
import { PLUGIN_DOWNLOAD_LINKS } from '@/store/plugin/constants'
import { PluginStatus } from '@/store/plugin/types/baseTypes'
import { cn } from '@/utils/className'

interface WorkspaceToolsTabProps {
  onClose: () => void
}

export function WorkspaceToolsTab({ onClose }: WorkspaceToolsTabProps) {
  const openConfigDialog = useConfigManagerDialogStore(state => state.openDialog)
  const openChannelManager = useChannelManagerStore(state => state.openModal)
  const accountCount = useAccountStore(state => state.accountList?.length ?? 0)
  const { pluginStatus, pluginVersion, openPluginModal } = usePluginStore(
    useShallow(state => ({
      pluginStatus: state.status,
      pluginVersion: state.pluginVersion,
      openPluginModal: state.openPluginModal,
    })),
  )

  const pluginReady = pluginStatus === PluginStatus.READY

  return (
    <div className="w-full space-y-4" data-testid="account-workspace-tools-tab">
      {/* 1. 配置管理 */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold text-foreground">配置管理</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              统一查看和调整 PostPilot 本地运行参数、AI 引擎默认路由及第三方服务环境变量。
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8.5 shrink-0 rounded-xl text-xs"
          onClick={() => {
            onClose()
            openConfigDialog('sidebar')
          }}
        >
          打开配置管理
        </Button>
      </div>

      {/* 2. 我的频道 */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
            <Tv className="h-5 w-5" />
          </span>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">我的频道</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-muted-foreground">
                已接入 {accountCount} 个账号
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              绑定与管理小红书、抖音、视频号、B 站、YouTube、Instagram、X 等多平台社媒账号。
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8.5 shrink-0 rounded-xl text-xs"
          onClick={() => {
            onClose()
            openChannelManager()
          }}
        >
          管理我的频道
        </Button>
      </div>

      {/* 3. PostPilot 浏览器插件 */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
              <Puzzle className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">PostPilot 浏览器插件</h4>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                  pluginReady ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground',
                )}
                >
                  {pluginReady ? `已就绪${pluginVersion ? ` v${pluginVersion}` : ''}` : '未安装'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                安装本地 Manifest V3 扩展后，可从 PostPilot 直接桥接小红书、抖音与视频号创作者后台。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline" className="h-8.5 gap-1.5 rounded-xl text-xs">
              <a href={PLUGIN_DOWNLOAD_LINKS.package} download="postpilot-extension.zip">
                <Download className="h-3.5 w-3.5" />
                下载扩展包
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8.5 rounded-xl text-xs"
              onClick={() => {
                onClose()
                openPluginModal()
              }}
            >
              安装指引
            </Button>
          </div>
        </div>
      </div>

      {/* 文档入口 */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Link href={DOCS_URL} onClick={onClose}>
            <BookOpen className="h-3.5 w-3.5" />
            PostPilot 帮助文档
          </Link>
        </Button>
      </div>
    </div>
  )
}
