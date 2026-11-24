/**
 * PluginNotInstalled - PostPilot 浏览器扩展安装引导组件
 * 提供真实可下载的 PostPilot 原生 Manifest V3 扩展包（.zip）与 3 步加载说明
 */

'use client'

import { BookOpen, Download, Monitor, Puzzle, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useChannelManagerStore } from '@/components/ChannelManager'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePluginStore } from '@/store/plugin'
import { PLUGIN_DOWNLOAD_LINKS } from '@/store/plugin/constants'

function MobilePluginTip() {
  const { t } = useTranslation('plugin')

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Monitor className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">{t('mobile.title')}</h3>
      <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        {t('mobile.description')}
      </p>
      <div className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <Monitor className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium text-primary">{t('mobile.goToPC')}</span>
      </div>
    </div>
  )
}

export function PluginNotInstalled() {
  const isMobile = useIsMobile()
  const closePluginModal = usePluginStore(state => state.closePluginModal)
  const closeChannelManager = useChannelManagerStore(state => state.closeModal)

  const handleViewGuide = () => {
    closePluginModal()
    closeChannelManager()
  }

  if (isMobile) {
    return <MobilePluginTip />
  }

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* PostPilot 扩展徽标 */}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-back text-white shadow-[0_10px_24px_-8px_rgba(67,56,202,0.5)]">
        <Puzzle className="h-8 w-8" />
      </div>

      <h3 className="mb-1.5 text-lg font-semibold text-foreground">安装 PostPilot 浏览器扩展</h3>
      <p className="mb-6 max-w-sm text-center text-xs leading-6 text-muted-foreground">
        PostPilot 原生本地扩展（Manifest V3），用于在本地浏览器安全桥接小红书、抖音与视频号创作者后台。
      </p>

      {/* 真实本地下载 */}
      <div className="flex w-full max-w-xs flex-col space-y-2.5">
        <Button className="w-full gap-2" asChild>
          <a href={PLUGIN_DOWNLOAD_LINKS.package} download="postpilot-extension.zip">
            <Download className="h-4 w-4" />
            下载 PostPilot 扩展包 (.zip)
          </a>
        </Button>
      </div>

      {/* 3 步快速加载提示 */}
      <div className="mt-5 w-full max-w-xs rounded-xl border border-border bg-muted/35 p-3.5 text-[11.5px] leading-5 text-muted-foreground">
        <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          3 步本地加载（Chrome / Edge / Arc）
        </div>
        <ol className="list-decimal space-y-1 pl-4">
          <li>解压刚下载的 <code className="text-foreground">postpilot-extension.zip</code></li>
          <li>打开 <code className="text-foreground">chrome://extensions/</code> 并开启「开发者模式」</li>
          <li>点击「加载已解压的扩展程序」选中目录，点开图标授权即可</li>
        </ol>
      </div>

      <Link
        href="/websit/plugin-guide"
        onClick={handleViewGuide}
        className="mt-4 flex items-center justify-center gap-2 w-full max-w-xs px-4 py-2.5 rounded-xl bg-primary/[0.06] border border-primary/20 text-xs font-medium text-primary hover:bg-primary/10 transition-colors cursor-pointer"
      >
        <BookOpen className="h-4 w-4" />
        <span>查看完整安装与使用教程</span>
      </Link>
    </div>
  )
}
