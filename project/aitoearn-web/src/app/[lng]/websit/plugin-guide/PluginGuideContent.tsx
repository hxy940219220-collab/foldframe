/**
 * PluginGuideContent - PostPilot 浏览器插件与平台账号连接教程
 * PostPilot Obsidian + Light Canvas 原生风格，无外部品牌截图残留
 */
'use client'

import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Chrome,
  HelpCircle,
  KeyRound,
  Link2,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function PluginGuideContent() {
  const params = useParams()
  const activeLng = ((params?.lng as string) || 'zh-CN').toLowerCase()
  const isZh = activeLng.startsWith('zh')

  const sections = isZh
    ? [
        { id: 'overview', label: '插件作用与支持平台' },
        { id: 'install', label: '1. 安装与启用扩展' },
        { id: 'authorize', label: '2. 绑定 PostPilot 工作台' },
        { id: 'creator-login', label: '3. 登录社媒创作者后台' },
        { id: 'sync', label: '4. 同步账号并一键发布' },
        { id: 'faq', label: '常见问题排查' },
      ]
    : [
        { id: 'overview', label: 'Overview & Platforms' },
        { id: 'install', label: '1. Install Extension' },
        { id: 'authorize', label: '2. Authorize PostPilot' },
        { id: 'creator-login', label: '3. Sign In to Creator Portals' },
        { id: 'sync', label: '4. Sync & Publish' },
        { id: 'faq', label: 'Troubleshooting FAQ' },
      ]

  const platforms = isZh
    ? ['小红书', '抖音', '微信视频号', '微信公众号', 'B站', '快手', '微博', 'YouTube', 'TikTok', 'Instagram', 'X (Twitter)', 'Facebook', 'Threads']
    : ['Xiaohongshu', 'Douyin', 'WeChat Channels', 'WeChat OA', 'Bilibili', 'Kuaishou', 'Weibo', 'YouTube', 'TikTok', 'Instagram', 'X (Twitter)', 'Facebook', 'Threads']

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部 Hero */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
              <Puzzle className="h-3.5 w-3.5 text-[#6D28D9]" />
              <span>{isZh ? 'PostPilot 浏览器扩展指南' : 'PostPilot Browser Extension'}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {isZh ? '插件安装和使用教程' : 'Browser Extension Setup & Usage Guide'}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {isZh
                ? '通过 PostPilot 浏览器扩展，您可以在本地浏览器中安全复用已登录的社媒创作者后台会话，实现小红书、抖音、微信视频号等平台的一键账号同步与自动化发布。'
                : 'Use the PostPilot browser extension to reuse your active local browser creator sessions for seamless account sync and multi-platform publishing.'}
            </p>

            <Alert className="border-border bg-background text-left">
              <Chrome className="h-4 w-4 text-foreground" />
              <div className="min-w-0 flex-1">
                <AlertTitle>{isZh ? '推荐浏览器环境' : 'Recommended Browsers'}</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {isZh
                    ? '推荐使用最新版 Google Chrome、Microsoft Edge 或 Arc 等 Chromium 内核浏览器，以获得最稳定的创作者后台同步与发布体验。'
                    : 'Use the latest Google Chrome, Microsoft Edge, or Arc (Chromium-based) for the most reliable creator session syncing.'}
                </AlertDescription>
              </div>
            </Alert>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/accounts">
                  <Link2 className="h-3.5 w-3.5" />
                  {isZh ? '前往频道与账号管理' : 'Manage Channels'}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href="/websit/help-docs">
                  <BookOpen className="h-3.5 w-3.5" />
                  {isZh ? '返回产品帮助文档' : 'Back to Help Docs'}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 主体两栏 */}
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row">
        <aside className="hidden w-60 shrink-0 lg:block">
          <Card className="sticky top-6 border-border p-4 shadow-none">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isZh ? '目录导航' : 'Table of Contents'}
            </div>
            <nav className="space-y-1">
              {sections.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  <span>{s.label}</span>
                </a>
              ))}
            </nav>
          </Card>
        </aside>

        <main className="min-w-0 flex-1 space-y-10">
          {/* 支持平台 */}
          <section id="overview" className="scroll-mt-8 space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">
              {isZh ? '插件作用与支持平台' : 'What the Extension Does'}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              {isZh
                ? '部分国内社媒平台（例如小红书、微信视频号等）不向个人开发者开放官方直发 API。安装浏览器扩展后，PostPilot 可以在您的本机浏览器内自动填充排版好的图集、视频、标题与话题，免去反复复制粘贴与重新上传。'
                : 'Some platforms do not provide open publishing APIs for individual creators. The extension bridges your local browser creator session directly with PostPilot so your formatted media, titles, and hashtags publish cleanly.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {platforms.map(p => (
                <span
                  key={p}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* 步骤 1 */}
          <section id="install" className="scroll-mt-8">
            <Card className="border-border p-6 shadow-none space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-back text-sm font-semibold text-white shadow-xs shadow-primary/25">
                  1
                </div>
                <h2 className="text-lg font-semibold">
                  {isZh ? '安装并启用浏览器扩展' : 'Install & Enable the Browser Extension'}
                </h2>
              </div>
              <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-6 text-muted-foreground">
                <li>
                  {isZh
                    ? '在浏览器右上角点击扩展图标（或地址栏输入 chrome://extensions/）打开「扩展程序管理」页面。'
                    : 'Open chrome://extensions/ in your Chromium browser.'}
                </li>
                <li>
                  {isZh
                    ? '如使用本地离线扩展包（.crx 或已解压目录），请先在右上角开启「开发者模式（Developer mode）」。'
                    : 'Enable Developer Mode in the top-right corner when loading a local package.'}
                </li>
                <li>
                  {isZh
                    ? '将扩展包拖入页面（或点击「加载已解压的扩展程序」选择本地扩展目录），确认添加并将其固定到浏览器工具栏。'
                    : 'Drag the package into the page (or click Load Unpacked) and pin the extension to your toolbar.'}
                </li>
              </ol>
            </Card>
          </section>

          {/* 步骤 2 */}
          <section id="authorize" className="scroll-mt-8">
            <Card className="border-border p-6 shadow-none space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-back text-sm font-semibold text-white shadow-xs shadow-primary/25">
                  2
                </div>
                <h2 className="text-lg font-semibold">
                  {isZh ? '授权连接当前 PostPilot 工作台' : 'Authorize Your PostPilot Workspace'}
                </h2>
              </div>
              <div className="space-y-2.5 text-sm leading-6 text-muted-foreground">
                <p>
                  {isZh
                    ? '保持 PostPilot 工作台页面处于登录状态，点击浏览器工具栏中的扩展图标：'
                    : 'Keep PostPilot signed in and click the extension icon in your toolbar:'}
                </p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <KeyRound className="mt-1 h-4 w-4 shrink-0 text-[#6D28D9]" />
                    <span>
                      {isZh
                        ? '点击扩展弹窗中的「立即授权（Authorize Now）」，授予当前本地 PostPilot 站点连接权限。'
                        : 'Click "Authorize Now" inside the extension popup to grant access to your PostPilot workspace.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-[#6D28D9]" />
                    <span>
                      {isZh
                        ? '授权完成后刷新 PostPilot 页面，顶部/侧栏插件状态将显示为「已就绪」。'
                        : 'Refresh PostPilot and verify the extension indicator shows Ready.'}
                    </span>
                  </li>
                </ul>
              </div>
            </Card>
          </section>

          {/* 步骤 3 */}
          <section id="creator-login" className="scroll-mt-8">
            <Card className="border-border p-6 shadow-none space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-back text-sm font-semibold text-white shadow-xs shadow-primary/25">
                  3
                </div>
                <h2 className="text-lg font-semibold">
                  {isZh ? '登录对应社媒主站与创作者后台' : 'Sign In to Both Main Site & Creator Studio'}
                </h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {isZh
                  ? '在同一个浏览器窗口中登录您计划发布的社交媒体账号。针对小红书等平台，请务必同时完成主站与创作者服务平台的登录：'
                  : 'Sign into your target social accounts in the same browser window. For platforms like Xiaohongshu, make sure both the main website and the creator studio portal are logged in:'}
              </p>
              <Alert className="border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20">
                <Smartphone className="h-4 w-4 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <AlertTitle className="text-amber-900 dark:text-amber-200">
                    {isZh ? '小红书创作者中心提示' : 'Xiaohongshu Creator Studio Tip'}
                  </AlertTitle>
                  <AlertDescription className="text-amber-800/90 dark:text-amber-300">
                    {isZh
                      ? '请先访问小红书主页并登录，再进入小红书创作者中心（creator.xiaohongshu.com）确认已进入发笔记后台。两者均保持登录后，插件即可稳定读取登录状态。'
                      : 'Sign in on xiaohongshu.com AND open creator.xiaohongshu.com to confirm creator portal access before syncing.'}
                  </AlertDescription>
                </div>
              </Alert>
            </Card>
          </section>

          {/* 步骤 4 */}
          <section id="sync" className="scroll-mt-8">
            <Card className="border-border p-6 shadow-none space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-back text-sm font-semibold text-white shadow-xs shadow-primary/25">
                  4
                </div>
                <h2 className="text-lg font-semibold">
                  {isZh ? '同步频道并在发布待办中分发内容' : 'Sync Accounts & Dispatch from Publish Queue'}
                </h2>
              </div>
              <ul className="space-y-2.5 text-sm leading-6 text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <RefreshCw className="mt-1 h-4 w-4 shrink-0 text-foreground" />
                  <span>
                    {isZh
                      ? '在扩展面板或「频道管理」页面点击「同步账号」，已登录的平台账号会自动出现在 PostPilot 频道列表中。'
                      : 'Click Sync inside the extension or Channels page to import active accounts into PostPilot.'}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-foreground" />
                  <span>
                    {isZh
                      ? '回到「AI 发布 → 排版工坊」完成仿真手机预览与文案微调，点击「存入发布待办」即可选择对应频道定时或立即发布。'
                      : 'Finish layout & copy in AI Publish → Layout Studio and dispatch to your synced channels.'}
                  </span>
                </li>
              </ul>
              <div className="pt-2">
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href="/ai-social">
                    {isZh ? '前往排版工坊体验发布流程' : 'Go to Layout Studio'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </Card>
          </section>

          {/* FAQ */}
          <section id="faq" className="scroll-mt-8 space-y-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-foreground" />
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '常见问题排查' : 'Troubleshooting FAQ'}
              </h2>
            </div>
            <div className="space-y-3">
              <Card className="border-border p-5 shadow-none">
                <h3 className="text-sm font-semibold">
                  {isZh ? 'Q：已经登录了小红书，为什么插件依然提示未登录？' : 'Q: I logged into Xiaohongshu, why does it still show not logged in?'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {isZh
                    ? 'A：通常是因为只登录了小红书浏览主页，尚未打开「小红书创作者中心（creator.xiaohongshu.com）」。请在同一浏览器打开创作者中心并完成登录，再回到 PostPilot 刷新同步。'
                    : 'A: Make sure you also open and authenticate inside creator.xiaohongshu.com in the same browser profile, then refresh PostPilot.'}
                </p>
              </Card>
              <Card className="border-border p-5 shadow-none">
                <h3 className="text-sm font-semibold">
                  {isZh ? 'Q：使用多账号运营时如何切换？' : 'Q: How do I manage multiple creator accounts?'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {isZh
                    ? 'A：建议使用浏览器的独立用户配置文件（Chrome Profile）隔离不同账号环境，避免同一窗口内 Cookie 互相覆盖。'
                    : 'A: Use separate browser profiles (Chrome Profiles) for each account to keep cookies isolated cleanly.'}
                </p>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
