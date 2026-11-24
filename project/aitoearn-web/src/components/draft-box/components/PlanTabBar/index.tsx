/**
 * PlanTabBar - 创作空间切换栏
 * 支持内联模式（融入创作工作台统一顶栏）和独立模式（用于发布弹窗草稿面板）
 */

'use client'

import { Ellipsis, FolderOpen, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useBrandPromotionStore } from '@/store/draft-box/brandPromotionStore'
import { usePlanTabStore } from '@/store/draft-box/planTabStore'
import { cn } from '@/utils/className'
import MorePanel from './MorePanel'
import { planLabel } from './planLabel'
import styles from './PlanTabBar.module.scss'

interface PlanTabBarProps {
  onPlanChange?: (planId: string) => void
  /** 内联胶囊模式：嵌入到工作台顶部栏中，不渲染单独的整行底边栏 */
  inline?: boolean
}

function PlanTabBar({ onPlanChange, inline = false }: PlanTabBarProps) {
  const { t } = useTransClient('brandPromotion')
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  const {
    tabPlans,
    tabPlansLoading,
    selectedPlanId,
  } = usePlanTabStore(
    useShallow(state => ({
      tabPlans: state.tabPlans,
      tabPlansLoading: state.tabPlansLoading,
      selectedPlanId: state.selectedPlanId,
    })),
  )

  const selectPlan = usePlanTabStore(state => state.selectPlan)
  const openCreatePlanModal = useBrandPromotionStore(state => state.openCreatePlanModal)

  // PC端鼠标滚轮水平滚动
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isMobile)
      return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0)
        return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isMobile])

  // 选中 Tab 后自动滚动到容器水平居中位置
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      const container = scrollRef.current
      const tab = activeTabRef.current
      const scrollLeft = tab.offsetLeft - container.offsetWidth / 2 + tab.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
    }
  }, [selectedPlanId])

  const handleTabClick = (planId: string) => {
    if (planId === selectedPlanId) {
      return
    }
    selectPlan(planId)
    onPlanChange?.(planId)
  }

  if (tabPlansLoading) {
    return inline
      ? (
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-16 rounded-lg" />
          </div>
        )
      : (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-20 rounded-lg" />
          </div>
        )
  }

  if (tabPlans.length === 0)
    return null

  const pillsContent = (
    <div
      data-testid="draftbox-plan-tabs"
      className={cn(
        'flex items-center gap-1.5 min-w-0',
        inline ? 'max-w-full' : 'flex-1',
      )}
    >
      {/* 可滚动空间胶囊组 */}
      <div
        ref={scrollRef}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-xl border border-border/80 bg-muted/50 p-0.5 overflow-x-auto min-w-0',
          inline ? 'max-w-[260px] sm:max-w-[340px] lg:max-w-[420px]' : 'max-w-full',
          styles.scrollContainer,
        )}
      >
        {tabPlans.map((plan) => {
          const active = plan.id === selectedPlanId
          return (
            <button
              key={plan.id}
              type="button"
              ref={active ? activeTabRef : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs cursor-pointer transition-all whitespace-nowrap',
                active
                  ? 'bg-card text-foreground font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground font-medium',
              )}
              onClick={() => handleTabClick(plan.id)}
            >
              <FolderOpen className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-primary' : 'opacity-65')} />
              <span>{planLabel(plan, t('studio.home'))}</span>
            </button>
          )
        })}
      </div>

      {/* 紧邻空间胶囊的新建与管理按钮（消除大段空白割裂感） */}
      <button
        type="button"
        onClick={openCreatePlanModal}
        title={t('planTab.newPlan')}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border bg-card/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" />
        {!isMobile && <span>{t('planTab.newPlan')}</span>}
      </button>

      <MorePanel
        trigger={(
          <Button
            variant="ghost"
            size="sm"
            title={t('planTab.moreTitle')}
            className="cursor-pointer h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded-lg"
          >
            <Ellipsis className="h-3.5 w-3.5" />
            {!isMobile && !inline && <span className="ml-1">{t('planTab.more')}</span>}
          </Button>
        )}
        onPlanChange={onPlanChange}
      />
    </div>
  )

  if (inline) {
    return pillsContent
  }

  return (
    <div className="flex items-center px-3 py-2 border-b border-border bg-card/85 backdrop-blur-xs">
      {pillsContent}
    </div>
  )
}

export default PlanTabBar
