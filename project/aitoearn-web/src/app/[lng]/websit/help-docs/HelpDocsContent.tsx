/**
 * HelpDocsContent - PostPilot 内置帮助文档中心
 * 参考成熟开源产品文档结构，采用 PostPilot Obsidian + Light Canvas 视觉风格
 */
'use client'

import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Cpu,
  FileText,
  FolderOpen,
  HelpCircle,
  Layers,
  Puzzle,
  Rocket,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Workflow,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface HelpDocsContentProps {
  lng?: string
}

const TOC_ITEMS_ZH = [
  { id: 'overview', label: '产品简介与闭环' },
  { id: 'quickstart', label: '3 步快速上手' },
  { id: 'creation', label: '内容创作三大模式' },
  { id: 'publish', label: '仿真排版与发布待办' },
  { id: 'models', label: '本机多模型引擎接入' },
  { id: 'faq', label: '常见问题 FAQ' },
]

const TOC_ITEMS_EN = [
  { id: 'overview', label: 'Overview & Workflow' },
  { id: 'quickstart', label: '3-Step Quick Start' },
  { id: 'creation', label: '3 Creation Modes' },
  { id: 'publish', label: 'Phone Studio & Publish Queue' },
  { id: 'models', label: 'Local Model Engines' },
  { id: 'faq', label: 'FAQ' },
]

export default function HelpDocsContent({ lng }: HelpDocsContentProps) {
  const params = useParams()
  const activeLng = (lng || (params?.lng as string) || 'zh-CN').toLowerCase()
  const isZh = activeLng.startsWith('zh')
  const toc = isZh ? TOC_ITEMS_ZH : TOC_ITEMS_EN

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部 Hero */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
                <BookOpen className="h-3.5 w-3.5 text-[#6D28D9]" />
                <span>{isZh ? 'PostPilot 产品文档中心' : 'PostPilot Documentation'}</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                {isZh
                  ? '从创意灵感到多平台发布，一站式 AI 视觉创作工作台'
                  : 'All-in-One AI Visual Creation & Multi-Platform Publishing Studio'}
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground">
                {isZh
                  ? 'PostPilot 专为内容创作者、品牌设计与社媒运营打造：在本地直连多家前沿大模型与即梦视觉引擎，打通「商业生图 / 短视频 → 无限画布衍生 → 多维改图精修 → 仿真手机排版 → 13 平台发布待办」全流程。'
                  : 'PostPilot unites local LLM & visual engines into one streamlined workflow: commercial image/video generation, Infinite Canvas exploration, 6-dimension consistent editing, realistic mobile layout preview, and 13-platform publishing queues.'}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button asChild size="sm" className="gap-1.5">
                  <Link href="/">
                    <Rocket className="h-3.5 w-3.5" />
                    {isZh ? '进入创作工作台' : 'Open Studio'}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href="/models">
                    <Cpu className="h-3.5 w-3.5" />
                    {isZh ? '配置本机模型引擎' : 'Configure Local Models'}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href="/websit/plugin-guide">
                    <Puzzle className="h-3.5 w-3.5" />
                    {isZh ? '浏览器插件教程' : 'Extension Guide'}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 sm:w-72">
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">{isZh ? '本机直连引擎' : 'Local Engines'}</div>
                <div className="mt-1 text-xl font-bold text-foreground">5 + API</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {isZh ? '零额外中转费' : 'Direct host bridge'}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background p-3.5">
                <div className="text-xs text-muted-foreground">{isZh ? '多平台分发' : 'Platforms'}</div>
                <div className="mt-1 text-xl font-bold text-foreground">13+</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {isZh ? '国内外主流社媒' : 'Global & CN social'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 主体两栏布局 */}
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row">
        {/* 左侧目录 */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-6 space-y-4">
            <Card className="border-border p-4 shadow-none">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isZh ? '文档目录' : 'On This Page'}
              </div>
              <nav className="space-y-1">
                {toc.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>
            </Card>

            <Card className="border-border p-4 shadow-none">
              <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isZh ? '相关文档' : 'Related Docs'}
              </div>
              <div className="space-y-1.5 text-sm">
                <Link
                  href="/websit/plugin-guide"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Puzzle className="h-3.5 w-3.5" />
                  <span>{isZh ? '插件安装和使用教程' : 'Extension Guide'}</span>
                </Link>
                <Link
                  href="/websit/privacy-policy"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>{isZh ? '隐私政策' : 'Privacy Policy'}</span>
                </Link>
                <Link
                  href="/websit/terms-of-service"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  <span>{isZh ? '服务条款' : 'Terms of Service'}</span>
                </Link>
              </div>
            </Card>
          </div>
        </aside>

        {/* 右侧文档正文 */}
        <main className="min-w-0 flex-1 space-y-12">
          {/* 1. 产品简介与闭环 */}
          <section id="overview" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '一、产品简介与核心闭环' : '1. Product Overview & Core Loop'}
              </h2>
            </div>
            <p className="leading-7 text-muted-foreground">
              {isZh
                ? '传统社媒内容生产往往割裂在多个工具之间：在聊天工具里写文案、去生图网站抽卡、下载到修图软件调尺寸、再逐个打开平台后台上传排期。PostPilot 将这五个环节整合在同一个本地优先工作台内，让单人或小团队也能高效量产商业级内容。'
                : 'Traditional content production splits copywriting, image/video generation, retouching, layout preview, and multi-platform scheduling across disconnected apps. PostPilot unifies all five stages in a single local-first studio.'}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: '01',
                  title: isZh ? '灵感生图 / 视频' : 'AI Generation',
                  desc: isZh
                    ? '一句话生成商业产品图、写实人像、品牌海报、短视频与配文草稿。'
                    : 'Generate commercial product shots, portraits, brand posters, videos & copy.',
                },
                {
                  step: '02',
                  title: isZh ? '画布与多维二创' : 'Canvas & 6D Edit',
                  desc: isZh
                    ? '在无限画布连线衍生创意，或在多维改图中锁定主体批量切换镜头与光影。'
                    : 'Branch ideas on Infinite Canvas or edit 6 visual dimensions while keeping identity.',
                },
                {
                  step: '03',
                  title: isZh ? '仿真手机排版' : 'Phone Layout',
                  desc: isZh
                    ? '图文/视频分流编辑，高保真预览小红书、抖音、Instagram 真实展示效果。'
                    : 'Dedicated image & video flows with realistic Xiaohongshu, Douyin & IG previews.',
                },
                {
                  step: '04',
                  title: isZh ? '多平台发布待办' : 'Publish Queue',
                  desc: isZh
                    ? '一键存入发布待办日历，支持 13+ 国内外平台定时排期与状态追踪。'
                    : 'Save directly to your publishing calendar and dispatch across 13+ platforms.',
                },
              ].map(card => (
                <Card key={card.step} className="border-border p-4 shadow-none">
                  <div className="mb-2 inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                    {card.step}
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{card.desc}</p>
                </Card>
              ))}
            </div>
          </section>

          {/* 2. 3 步快速上手 */}
          <section id="quickstart" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <Rocket className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '二、3 步快速上手' : '2. 3-Step Quick Start'}
              </h2>
            </div>

            <div className="space-y-3">
              {[
                {
                  num: '1',
                  title: isZh ? '连接本机模型引擎（一次配置，全局复用）' : 'Connect Local Model Engines',
                  desc: isZh
                    ? '前往左侧栏「AI 模型配置」，查看本机已安装的 Antigravity、Codex、即梦 AI、Grok 与 WorkBuddy。点击「一键网页登录」即可完成扫码或浏览器授权，无需手工复制 Cookie 或命令行配置。'
                    : 'Open "AI Models" from the sidebar to check detected local engines (Antigravity, Codex, Dreamina, Grok, WorkBuddy) and sign in via one-click web authorization.',
                  href: '/models',
                  cta: isZh ? '打开模型配置' : 'Open Models',
                },
                {
                  num: '2',
                  title: isZh ? '在创作工作台生成并精修视觉素材' : 'Generate & Refine Assets in Studio',
                  desc: isZh
                    ? '在「创作」首页输入主题即可生成商业高清图、短视频或图文草稿；点击任意素材可无缝进入「无限画布」就近衍生，或进入「多维改图」按 6 大维度批量出图。'
                    : 'Use the Quick Workbench to generate images, videos, or copy drafts, then branch them on Infinite Canvas or fine-tune 6 dimensions in Multi-Dimensional Editing.',
                  href: '/',
                  cta: isZh ? '前往创作工作台' : 'Open Workbench',
                },
                {
                  num: '3',
                  title: isZh ? '进入 AI 发布排版工坊并加入发布待办' : 'Preview & Schedule in AI Publish',
                  desc: isZh
                    ? '切换到「AI 发布 → 排版工坊」，从素材库一键挑选图集或视频，右侧手机屏实时查看 3:4 / 1:1 / 4:3 裁切效果与 AI 标题正文，确认无误后点击「存入发布待办」统一排期。'
                    : 'Switch to AI Publish → Layout Studio to pick assets, adjust crop ratios in the live phone preview, generate captions with AI, and queue posts to your schedule.',
                  href: '/ai-social',
                  cta: isZh ? '进入排版工坊' : 'Open Layout Studio',
                },
              ].map(step => (
                <Card key={step.num} className="flex flex-col justify-between gap-4 border-border p-5 shadow-none sm:flex-row sm:items-center">
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-white">
                      {step.num}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0 gap-1">
                    <Link href={step.href}>
                      {step.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>
          </section>

          {/* 3. 内容创作三大模式 */}
          <section id="creation" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <Layers className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '三、内容创作三大模式与素材管理' : '3. Creation Modes & Asset Library'}
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-border p-5 shadow-none">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-[#6D28D9]">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isZh ? '快捷工作台' : 'Quick Workbench'}
                </div>
                <h3 className="text-base font-semibold">{isZh ? '一站式生图、生视频与写草稿' : 'Images, Videos & Drafts'}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '支持参考图上传与图生图、首帧图生视频。' : 'Supports reference image-to-image and image-to-video.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '文本大模型下拉框实时聚合本机最新模型（如 WorkBuddy GLM-5.3 / DeepSeek-V4 / Hy4）。' : 'Live model picker aggregates your latest local LLMs.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '生成结果自动归档至 AI 生成素材库，支持按图片/视频与比例筛选。' : 'Outputs auto-save to the Asset Library with type & ratio filters.'}</span>
                  </li>
                </ul>
              </Card>

              <Card className="border-border p-5 shadow-none">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-[#6D28D9]">
                  <Workflow className="h-3.5 w-3.5" />
                  {isZh ? '无限画布' : 'Infinite Canvas'}
                </div>
                <h3 className="text-base font-semibold">{isZh ? '可视化节点创作与就近衍生' : 'Visual Node Branching'}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '画布默认居中排布，支持滚轮缩放与自由平移。' : 'Auto-centered layout with smooth zoom and pan.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '点击任意图片即可在图片正下方呼出提示词与模型面板，快速生成连线衍生版本。' : 'Click any node to open the contextual prompt dock directly beneath it.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '适合对比多版构图、商品场景延展和分镜故事板制作。' : 'Ideal for comparing compositions, product scenes, and storyboards.'}</span>
                  </li>
                </ul>
              </Card>

              <Card className="border-border p-5 shadow-none">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-[#6D28D9]">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {isZh ? '多维改图' : 'Multi-Dimensional Edit'}
                </div>
                <h3 className="text-base font-semibold">{isZh ? '锁定主体 6 大维度批量二创' : '6-Dimension Consistent Editing'}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '覆盖换镜头角度、换光影氛围、换背景场景、换画风质感、换穿搭造型、换表情动作 6 大维度。' : 'Adjust camera angle, lighting, scene, art style, outfit, and expression.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '顶部统一显示当前参考图分辨率与比例，支持删除冗余参考图并批量一键出图。' : 'Top bar displays active resolution & ratio with batch generation.'}</span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                    <span>{isZh ? '每项维度均支持展开自定义提示词微调，保持人物与商品外观一致。' : 'Expand prompt controls per dimension for precise brand consistency.'}</span>
                  </li>
                </ul>
              </Card>
            </div>
          </section>

          {/* 4. 仿真手机排版与发布待办 */}
          <section id="publish" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <Smartphone className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '四、仿真手机排版工坊与发布待办' : '4. Phone Layout Studio & Publish Queue'}
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border p-5 shadow-none space-y-3">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <FileText className="h-4 w-4 text-[#6D28D9]" />
                  <span>{isZh ? '排版工坊核心特性' : 'Layout Studio Highlights'}</span>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">{isZh ? '图文 / 视频彻底分流：' : 'Split Image & Video Modes: '}</strong>
                    {isZh
                      ? '入口明确区分「图文发布」与「视频发布」，符合小红书、抖音等平台真实发帖逻辑。'
                      : 'Dedicated tabs prevent mixing incompatible image sets and videos.'}
                  </li>
                  <li>
                    <strong className="text-foreground">{isZh ? '沉浸式手机仿真预览：' : 'Live Mobile Preview: '}</strong>
                    {isZh
                      ? '支持在小红书、抖音、Instagram 笔记预览与封面预览间切换，所见即所得。'
                      : 'Switch between Xiaohongshu, Douyin, and Instagram note/cover previews.'}
                  </li>
                  <li>
                    <strong className="text-foreground">{isZh ? '竖排比例与自由裁剪：' : 'Vertical Ratio & Crop Rail: '}</strong>
                    {isZh
                      ? '手机右侧竖排工具条提供 3:4、1:1、4:3、原图切换，以及自由拖拽取景、精准裁剪和 AI 扩图调比例。'
                      : 'Compact vertical control rail on the right for 3:4, 1:1, 4:3, crop & AI aspect reflow.'}
                  </li>
                </ul>
              </Card>

              <Card className="border-border p-5 shadow-none space-y-3">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <CalendarCheck className="h-4 w-4 text-[#6D28D9]" />
                  <span>{isZh ? '发布待办与多平台排期' : 'Publish Queue & Calendar'}</span>
                </div>
                <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">{isZh ? '13+ 主流社媒渠道：' : '13+ Social Channels: '}</strong>
                    {isZh
                      ? '支持小红书、抖音、微信视频号、微信公众号、B站、快手、微博、YouTube、TikTok、Instagram、X、Facebook、Threads 等。'
                      : 'Xiaohongshu, Douyin, WeChat Channels, Bilibili, Kuaishou, YouTube, TikTok, Instagram, X & more.'}
                  </li>
                  <li>
                    <strong className="text-foreground">{isZh ? '内容管理与草稿箱：' : 'Asset & Draft Management: '}</strong>
                    {isZh
                      ? '在「内容创作」与「发布待办」之间一键流转，随时编辑标题、正文、话题标签与定时计划。'
                      : 'Move effortlessly from generated assets to scheduled publishing drafts.'}
                  </li>
                  <li>
                    <strong className="text-foreground">{isZh ? '素材库统一筛选：' : 'Structured Asset Filters: '}</strong>
                    {isZh
                      ? '按图片 / 视频类型及 1:1、3:4、9:16、16:9 等比例快速检索历史作品。'
                      : 'Filter all AI-generated assets by media type and aspect ratio.'}
                  </li>
                </ul>
              </Card>
            </div>
          </section>

          {/* 5. 本机多模型引擎接入 */}
          <section id="models" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <Cpu className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '五、本机多模型引擎接入指南' : '5. Local Model Engines Guide'}
              </h2>
            </div>
            <p className="leading-7 text-muted-foreground">
              {isZh
                ? 'PostPilot 通过宿主机本地桥接服务（127.0.0.1:18787，带独立访问令牌校验）安全调用您电脑上已安装的官方 CLI 与桌面客户端，直接复用现有订阅额度，无需把个人账号凭证上传到外部服务器。'
                : 'PostPilot communicates with local CLIs on your machine over a token-protected loopback bridge (127.0.0.1:18787), reusing your existing subscriptions without uploading credentials.'}
            </p>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{isZh ? '引擎名称' : 'Engine'}</th>
                    <th className="px-4 py-3">{isZh ? '适用场景' : 'Capabilities'}</th>
                    <th className="px-4 py-3">{isZh ? '接入与登录方式' : 'Auth Method'}</th>
                    <th className="px-4 py-3">{isZh ? '代表模型' : 'Featured Models'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">Antigravity CLI</td>
                    <td className="px-4 py-3">{isZh ? 'Agent 编排 / 文案规划 / 对话' : 'Agent, Planner & Chat'}</td>
                    <td className="px-4 py-3">{isZh ? '自动复用本机登录态' : 'Auto host session'}</td>
                    <td className="px-4 py-3">Gemini / Claude 系列</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">Codex CLI</td>
                    <td className="px-4 py-3">{isZh ? '文案策划 / Agent / 生图' : 'Copy, Agent & Image'}</td>
                    <td className="px-4 py-3">{isZh ? '一键网页 OAuth 登录' : 'One-click Web OAuth'}</td>
                    <td className="px-4 py-3">GPT-5.4 / GPT-5.3-Codex</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">{isZh ? '即梦 AI (Dreamina)' : 'Dreamina AI'}</td>
                    <td className="px-4 py-3">{isZh ? '商业高清生图 / 多维改图 / 短视频' : 'Commercial Image & Video'}</td>
                    <td className="px-4 py-3">{isZh ? '一键网页扫码登录（显示剩余积分）' : 'One-click Web Device Login'}</td>
                    <td className="px-4 py-3">即梦 5.0 / 5.0 Pro / Seedance 2.0</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">Grok CLI</td>
                    <td className="px-4 py-3">{isZh ? '实时热点文案 / Agent / 对话' : 'Copywriting, Agent & Chat'}</td>
                    <td className="px-4 py-3">{isZh ? '一键跳转网页设备授权' : 'Web Device Auth (x.ai)'}</td>
                    <td className="px-4 py-3">Grok-4.7 / Grok-4.6</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">WorkBuddy</td>
                    <td className="px-4 py-3">{isZh ? '国产旗舰多模型 / 文案 / Agent' : 'Multi-Model LLM & Agent'}</td>
                    <td className="px-4 py-3">{isZh ? '一键微信扫码 / 网页登录，自动同步最新模型' : 'Web / WeChat Login (live model sync)'}</td>
                    <td className="px-4 py-3">Hy4 / DeepSeek-V4 / GLM-5.3 / Kimi-K3 / MiniMax-M3</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">{isZh ? '第三方 API' : 'Third-Party API'}</td>
                    <td className="px-4 py-3">{isZh ? '自定义云端兼容接口' : 'Custom Cloud Endpoints'}</td>
                    <td className="px-4 py-3">{isZh ? '填写 Base URL 与 API Key' : 'Base URL + API Key'}</td>
                    <td className="px-4 py-3">OpenAI / Anthropic / Gemini / DeepSeek / OpenRouter</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. 常见问题 FAQ */}
          <section id="faq" className="scroll-mt-8 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-back text-white shadow-xs shadow-primary/25">
                <HelpCircle className="h-4 w-4" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                {isZh ? '六、常见问题 FAQ' : '6. Frequently Asked Questions'}
              </h2>
            </div>

            <div className="space-y-3">
              {[
                {
                  q: isZh ? 'WorkBuddy 登录后如何同步最新模型列表？' : 'How does WorkBuddy sync the latest available models?',
                  a: isZh
                    ? 'PostPilot 会在您完成 WorkBuddy 网页登录后，自动通过本机 WorkBuddy 会话协议动态拉取您当前账号已开通的最新模型（包括 Hy4、Hy4 Flash 免费版、DeepSeek-V4.1-Flash、DeepSeek-V4-Pro、GLM-5.3、Kimi-K3.1-Pro、MiniMax-M3.1-Flash 等）。如 WorkBuddy 客户端刚上新模型，在「AI 模型配置」页面点击右上角「刷新状态」即可立即同步。'
                    : 'Once signed in, PostPilot queries your live WorkBuddy session dynamically to fetch every latest model enabled on your account. Click "Refresh Status" in AI Models anytime to sync newly released models.',
                },
                {
                  q: isZh ? '在 PostPilot 中退出 Grok 或 WorkBuddy 会影响我的桌面客户端吗？' : 'Does signing out in PostPilot affect my desktop app?',
                  a: isZh
                    ? 'WorkBuddy 采用独立隔离的认证目录存储于本地项目工作区，退出登录不会影响您原本的 WorkBuddy 桌面客户端登录态。'
                    : 'WorkBuddy uses an isolated local auth directory inside your workspace, so signing out in PostPilot never affects your desktop WorkBuddy client.',
                },
                {
                  q: isZh ? '生成的商业图片和视频保存在哪里？' : 'Where are my generated images and videos stored?',
                  a: isZh
                    ? '所有生成的图片、视频与草稿均保存在您本地部署的对象存储（RustFS）与数据库中，完全由您自行掌控，可在「内容创作 → AI 生成素材」或「素材库」中随时预览、筛选、下载或删除。'
                    : 'All assets and drafts are stored in your local object storage and database—fully under your control in the Asset Library.',
                },
                {
                  q: isZh ? '小红书等平台连接时提示未登录怎么办？' : 'What if a social platform shows as disconnected?',
                  a: isZh
                    ? '请确保在同一浏览器中同时登录该平台主站与创作者后台（例如小红书主页与小红书创作服务平台），然后刷新授权状态。详细步骤可查阅《插件安装和使用教程》。'
                    : 'Make sure you are signed into both the main site and the creator studio portal in the same browser, then refresh. See the Extension Guide for details.',
                },
              ].map(item => (
                <Card key={item.q} className="border-border p-5 shadow-none">
                  <h3 className="text-sm font-semibold text-foreground">{item.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.a}</p>
                </Card>
              ))}
            </div>

            {/* 底部延伸阅读 */}
            <div className="grid gap-3 pt-4 sm:grid-cols-3">
              <Link href="/websit/plugin-guide" className="group block">
                <Card className="h-full border-border p-4 shadow-none transition-colors group-hover:border-foreground/30">
                  <div className="flex items-center justify-between">
                    <Puzzle className="h-4 w-4 text-foreground" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {isZh ? '插件安装和使用教程' : 'Extension Setup Guide'}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isZh ? '了解如何连接小红书、抖音等平台账号' : 'Connect social platform accounts'}
                  </p>
                </Card>
              </Link>
              <Link href="/websit/privacy-policy" className="group block">
                <Card className="h-full border-border p-4 shadow-none transition-colors group-hover:border-foreground/30">
                  <div className="flex items-center justify-between">
                    <Shield className="h-4 w-4 text-foreground" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {isZh ? '隐私政策' : 'Privacy Policy'}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isZh ? '本地优先数据与凭证隔离说明' : 'Local-first data & credential policy'}
                  </p>
                </Card>
              </Link>
              <Link href="/websit/terms-of-service" className="group block">
                <Card className="h-full border-border p-4 shadow-none transition-colors group-hover:border-foreground/30">
                  <div className="flex items-center justify-between">
                    <FolderOpen className="h-4 w-4 text-foreground" />
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-foreground">
                    {isZh ? '服务条款' : 'Terms of Service'}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isZh ? '内容权属与第三方平台合规规范' : 'Content ownership & platform compliance'}
                  </p>
                </Card>
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
