/**
 * AgentFeatures - PostPilot 精简交互式核心创作能力轮播（6 大核心模块）
 */
'use client'

import type { FC } from 'react'
import type { Swiper as SwiperType } from 'swiper'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Cpu,
  ImagePlus,
  SlidersHorizontal,
  Smartphone,
  Workflow,
} from 'lucide-react'
import { useCallback, useRef } from 'react'
import { Autoplay, Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/className'

import 'swiper/css'
import 'swiper/css/pagination'
import './style.css'

interface AgentFeaturesProps {
  className?: string
}

const CORE_CAPABILITIES = [
  {
    key: 'commercial-gen',
    title: '商业生图与短视频',
    desc: '直连即梦 5.0 与 Seedance 视频模型，一句话产出商业大片与高转化宣传短片。',
    icon: ImagePlus,
    tint: 'bg-indigo-500/10 text-indigo-600',
  },
  {
    key: 'infinite-canvas',
    title: '无限画布与创作副驾',
    desc: '节点自由拖拽连线，@ 引用画布图/视频给副驾 Agent，快速延展多版创意。',
    icon: Workflow,
    tint: 'bg-violet-500/10 text-violet-600',
  },
  {
    key: 'six-dim-remix',
    title: '六维精准改图',
    desc: '锁定人物与产品主体，独立微调镜头、光影、场景、画风、穿搭与表情，支持自定义输入。',
    icon: SlidersHorizontal,
    tint: 'bg-sky-500/10 text-sky-600',
  },
  {
    key: 'phone-layout',
    title: '仿真手机排版工坊',
    desc: '图文与视频彻底分流，小红书/抖音/Instagram 实机比例裁切与 AI 文案实时预览。',
    icon: Smartphone,
    tint: 'bg-emerald-500/10 text-emerald-600',
  },
  {
    key: 'multi-platform',
    title: '13+ 平台发布待办',
    desc: '一键存入发布待办日历，支持国内外主流社媒多账号排期与状态追踪。',
    icon: CalendarCheck,
    tint: 'bg-amber-500/10 text-amber-600',
  },
  {
    key: 'local-models',
    title: '多模型直连与第三方 API',
    desc: '打通 Antigravity、Codex、Grok、WorkBuddy 及自定义 API，按需切换思考强度。',
    icon: Cpu,
    tint: 'bg-rose-500/10 text-rose-600',
  },
] as const

const AgentFeatures: FC<AgentFeaturesProps> = ({ className }) => {
  const swiperRef = useRef<SwiperType | null>(null)

  const onSwiper = useCallback((swiper: SwiperType) => {
    swiperRef.current = swiper
  }, [])

  return (
    <section className={cn('py-8 px-4 md:px-6 lg:px-8', className)}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              核心创作与发布能力
            </h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              从视觉生成到多平台分发的 6 个核心工作流模块
            </p>
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => swiperRef.current?.slidePrev()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => swiperRef.current?.slideNext()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="agent-features-swiper">
          <Swiper
            modules={[Autoplay, Pagination]}
            onSwiper={onSwiper}
            spaceBetween={14}
            slidesPerView={1}
            loop
            autoplay={{
              delay: 3600,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            pagination={{ clickable: true }}
            breakpoints={{
              0: { slidesPerView: 1, spaceBetween: 12 },
              640: { slidesPerView: 2, spaceBetween: 14 },
              1024: { slidesPerView: 3, spaceBetween: 16 },
            }}
          >
            {CORE_CAPABILITIES.map((item) => {
              const Icon = item.icon
              return (
                <SwiperSlide key={item.key} className="h-auto!">
                  <div className="group h-full rounded-2xl border border-border/80 bg-card/92 p-4 shadow-[0_4px_18px_-10px_rgba(67,56,202,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35">
                    <div className="mb-2.5 flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105', item.tint)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{item.desc}</p>
                  </div>
                </SwiperSlide>
              )
            })}
          </Swiper>
        </div>
      </div>
    </section>
  )
}

export default AgentFeatures
