/**
 * EcosystemDiagram - PostPilot AI 创作到多平台分发动态星环交互图
 * 保留精致的星轨旋转、脉冲能量流与点击切换节点动效，内容完全重构为 PostPilot 核心闭环
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/className'

type StageKey = 'models' | 'create' | 'layout' | 'queue'

interface StageInfo {
  key: StageKey
  label: string
  angle: number
  title: string
  bullets: string[]
}

const STAGES: StageInfo[] = [
  {
    key: 'models',
    label: '多模型接入',
    angle: -135,
    title: '多模型直连 · 思考强度可控',
    bullets: [
      '直连 Antigravity、Codex、Grok、WorkBuddy（实时同步 Hy4 / DeepSeek-V4 / GLM-5.3 / Kimi-K3）',
      '支持快捷接入国内外第三方 API，自由切换模型与推理深度',
    ],
  },
  {
    key: 'create',
    label: '视觉生成二创',
    angle: -45,
    title: '商业大片与短视频一站产出',
    bullets: [
      '快捷工作台直出即梦 5.0 商业图与 Seedance 短视频',
      '无限画布连线衍生 + 六维精准改图（支持自定义输入与真人/2D/3D 分类画风）',
    ],
  },
  {
    key: 'layout',
    label: '仿真手机排版',
    angle: 45,
    title: '图文 / 视频分流 · 所见即所得',
    bullets: [
      '小红书、抖音、Instagram 高保真手机屏实时预览',
      '竖排比例与自由裁剪控制栏，AI 一键润色标题、正文与话题标签',
    ],
  },
  {
    key: 'queue',
    label: '发布待办排期',
    angle: 135,
    title: '全平台待办日历与任务追踪',
    bullets: [
      '排版定稿一键存入发布待办，统一管理多账号排期计划',
      '支持小红书、抖音、视频号、B站、YouTube、TikTok、Instagram、X 等 13+ 平台',
    ],
  },
]

export function EcosystemDiagram() {
  const [activeKey, setActiveKey] = useState<StageKey>('models')
  const [isAutoPlay, setIsAutoPlay] = useState(true)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAutoPlay) return
    autoTimerRef.current = setInterval(() => {
      setActiveKey((prev) => {
        const idx = STAGES.findIndex(s => s.key === prev)
        return STAGES[(idx + 1) % STAGES.length].key
      })
    }, 4200)
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    }
  }, [isAutoPlay])

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
  }, [])

  const handleSelect = (key: StageKey) => {
    setIsAutoPlay(false)
    setActiveKey(key)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => setIsAutoPlay(true), 8000)
  }

  const currentStage = STAGES.find(s => s.key === activeKey) || STAGES[0]

  return (
    <section className="relative overflow-hidden px-4 py-12 md:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            PostPilot AI 创作到分发闭环
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
            点击星轨上的任意环节，了解 PostPilot 如何将创意直达全平台
          </p>
        </div>

        {/* 轻奢玻璃容器 */}
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 shadow-[0_12px_36px_-18px_rgba(67,56,202,0.18)] backdrop-blur-md">
          <div className="relative z-10 px-6 py-10 md:px-12 md:py-12">
            {/* 桌面端动态星环双核架构 */}
            <div className="hidden items-center justify-center gap-10 md:flex lg:gap-14">
              {/* 左侧主星环：PostPilot 创作引擎 */}
              <div className="relative h-[300px] w-[300px] lg:h-[330px] lg:w-[330px]">
                <div className="pointer-events-none absolute -inset-4 rounded-full bg-gradient-to-r from-indigo-500/8 via-violet-500/8 to-sky-500/8 blur-2xl animate-pulse" />

                <div className="absolute inset-0 rounded-full border border-dashed border-indigo-400/30 animate-[spin_55s_linear_infinite]">
                  <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/70 shadow-[0_0_8px_2px_rgba(99,102,241,0.45)]" />
                </div>
                <div className="absolute inset-7 rounded-full border border-violet-400/25 animate-[spin_40s_linear_infinite_reverse]">
                  <div className="absolute right-0 top-1/2 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/70 shadow-[0_0_8px_2px_rgba(139,92,246,0.45)]" />
                </div>

                {/* 内核星球 */}
                <div className="absolute inset-[74px] flex items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-gradient-to-br from-indigo-50/95 via-white to-violet-50/95 shadow-[inset_0_0_24px_rgba(79,70,229,0.12),0_10px_28px_-10px_rgba(67,56,202,0.22)]">
                  <div className="text-center">
                    <div className="text-[10.5px] font-semibold uppercase tracking-widest text-primary">PostPilot</div>
                    <div className="mt-0.5 text-base font-bold text-foreground">创作核心</div>
                  </div>
                </div>

                {/* 4 个可交互卫星节点 */}
                {STAGES.map((stage) => {
                  const rad = (stage.angle * Math.PI) / 180
                  const radius = 52
                  const x = 50 + radius * Math.cos(rad)
                  const y = 50 + radius * Math.sin(rad)
                  const isActive = activeKey === stage.key
                  return (
                    <button
                      key={stage.key}
                      type="button"
                      onClick={() => handleSelect(stage.key)}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      className={cn(
                        'absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-300 cursor-pointer',
                        isActive
                          ? 'scale-105 bg-gradient-back text-white shadow-[0_8px_22px_-6px_rgba(67,56,202,0.55)]'
                          : 'border border-border bg-background/95 text-foreground shadow-sm hover:scale-105 hover:border-primary/40 hover:text-primary',
                      )}
                    >
                      {stage.label}
                    </button>
                  )
                })}
              </div>

              {/* 中间脉冲分发流 */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="relative flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-2 text-xs font-semibold text-primary shadow-sm">
                  <span>一键直达</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
                <div className="relative h-0.5 w-24 overflow-hidden rounded-full bg-border">
                  <div className="absolute inset-y-0 left-0 w-10 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-[energyFlow_1.8s_linear_infinite]" />
                </div>
                <span className="text-[11px] text-muted-foreground">图文 / 视频智能适配</span>
              </div>

              {/* 右侧副星环：13+ 全平台触达 */}
              <div className="relative h-36 w-36 lg:h-40 lg:w-40">
                <div className="pointer-events-none absolute -inset-3 rounded-full bg-gradient-to-br from-indigo-500/10 to-violet-500/12 blur-xl animate-pulse" />
                <div className="absolute -inset-2 rounded-full border border-dashed border-violet-400/35 animate-[spin_36s_linear_infinite]">
                  <div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/80" />
                </div>
                <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-white via-indigo-50/70 to-violet-50/80 p-3 text-center shadow-[0_10px_28px_-12px_rgba(67,56,202,0.28)]">
                  <span className="text-lg font-bold text-primary">13+</span>
                  <span className="mt-0.5 text-xs font-semibold text-foreground">社媒平台矩阵</span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground">国内 + 出海</span>
                </div>
              </div>
            </div>

            {/* 移动端紧凑切换胶囊 */}
            <div className="flex flex-wrap justify-center gap-2 md:hidden">
              {STAGES.map(stage => (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => handleSelect(stage.key)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer',
                    activeKey === stage.key
                      ? 'bg-gradient-back text-white shadow-sm'
                      : 'border border-border bg-background text-muted-foreground',
                  )}
                >
                  {stage.label}
                </button>
              ))}
            </div>

            {/* 底部动态详情面板 */}
            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border/80 bg-background/80 p-4 backdrop-blur-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <h4 className="text-sm font-semibold text-foreground">{currentStage.title}</h4>
              </div>
              <ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-muted-foreground">
                {currentStage.bullets.map(b => (
                  <li key={b} className="list-disc">{b}</li>
                ))}
              </ul>

              {/* 进度指示点 */}
              <div className="mt-3.5 flex items-center justify-center gap-1.5">
                {STAGES.map(stage => (
                  <button
                    key={stage.key}
                    type="button"
                    aria-label={stage.label}
                    onClick={() => handleSelect(stage.key)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300 cursor-pointer',
                      activeKey === stage.key ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground/40',
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>
        {`
        @keyframes energyFlow {
          0% { transform: translateX(-100%); opacity: 0.2; }
          50% { opacity: 1; }
          100% { transform: translateX(260%); opacity: 0.2; }
        }
        `}
      </style>
    </section>
  )
}

export default EcosystemDiagram
