/**
 * AI 社媒内容组件 - AI social media Page Content
 * 客户端组件，包含所有交互逻辑
 */
'use client'

import type { IHomeChatRef } from './components/HomeChat'
import type { PromotionPlan } from '@/api/materials/material.types'
import { ArrowUp, Loader2, Smartphone, Sparkles, Upload } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetMaterialGroupList } from '@/api/materials/material.api'
import { LivePreviewStudio } from '@/components/draft-box/components/StudioModes/LivePreviewStudio'
import { StudioSelect } from '@/components/draft-box/components/StudioModes/StudioSelect'
import { Button } from '@/components/ui/button'
import { useAgentStore } from '@/store/agent'
import { usePlanDetailStore } from '@/store/draft-box/planDetailStore'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import { toast } from '@/utils/ui/toast'
import { useTransClient } from '../../i18n/client'
import AgentFeatures from './components/AgentFeatures'
import EcosystemDiagram from './components/EcosystemDiagram'
import { HomeChat } from './components/HomeChat'
import PromptGallery from './components/PromptGallery'
import TaskPreview from './components/TaskPreview'

type AiPublishMode = 'chat' | 'publisher'
const AI_PUBLISH_MODE_KEY = 'foldframe:ai-publish-mode'

export function AiSocialPageContent() {
  const { t } = useTransClient('home')

  // Store 方法
  const { setDebugFiles } = useAgentStore()
  const currentPlanId = usePlanDetailStore(state => state.currentPlan?.id)

  // AI 发布模式切换：AI 对话发布 | 排版工坊
  const [publishMode, setPublishMode] = useState<AiPublishMode>('chat')
  const [materialGroups, setMaterialGroups] = useState<PromotionPlan[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string>('')
  const [groupsLoading, setGroupsLoading] = useState(false)
  const prevSidebarCollapsedRef = useRef<boolean | null>(null)

  // 拖拽上传状态
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const homeChatRef = useRef<IHomeChatRef>(null)

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = e.dataTransfer.files
    if (files.length > 0) {
      homeChatRef.current?.handleFileDrop(files)
    }
  }, [])

  /**
   * 回到顶部按钮组件
   * @param position 按钮位置，'left' 或 'right'
   */
  function BackToTop({ position = 'left' }: { position?: 'left' | 'right' }) {
    const [isVisible, setIsVisible] = useState(false)

    // 监听滚动显示/隐藏按钮
    useEffect(() => {
      const handleScroll = () => {
        // 滚动超过 400px 显示按钮
        setIsVisible(window.scrollY > 400)
      }

      window.addEventListener('scroll', handleScroll, { passive: true })
      return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // 点击回到顶部
    const scrollToTop = useCallback(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    return (
      <Button
        size="icon"
        onClick={scrollToTop}
        className={cn(
          'fixed bottom-8 z-50 w-12 h-12 rounded-full',
          'shadow-lg transition-all duration-300 transform',
          position === 'left' ? 'left-8' : 'right-8',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
        )}
        aria-label="Back to top"
      >
        <ArrowUp className="w-5 h-5" />
      </Button>
    )
  }

  const [appliedPrompt, setAppliedPrompt] = useState<string>('')
  const [appliedMaterials, setAppliedMaterials] = useState<string[]>([])

  // 处理提示词应用
  const handleApplyPrompt = useCallback(
    (data: { prompt: string, materials?: string[], mode: 'edit' | 'generate' }) => {
      setAppliedPrompt(data.prompt)
      setAppliedMaterials(data.materials || [])
      // 滚动到顶部
      window.scrollTo({ top: 0, behavior: 'smooth' })
      toast.success('Prompt applied!')
    },
    [],
  )

  // 从 URL query 读取 agentExternalPrompt 和 agentTaskId（由任务页通过 query 传参）
  const searchParams = useSearchParams()
  const router = useRouter()
  const [agentTaskId, setAgentTaskId] = useState<string>('')
  const params = useParams()

  // 解析 debug URL 参数，设置 debug 模式
  useEffect(() => {
    try {
      const debugParam = searchParams.get('debug')
      if (debugParam) {
        // 解析 debug=[file1.txt,file2.txt] 或 debug=file1.txt,file2.txt 格式
        const cleanedParam = debugParam.replace(/^\[|\]$/g, '')
        const files = cleanedParam
          .split(',')
          .map(f => f.trim())
          .filter(Boolean)

        if (files.length > 0) {
          setDebugFiles(files)

          // 清理 URL 上的 debug 参数
          const url = new URL(window.location.href)
          url.searchParams.delete('debug')
          router.replace(url.pathname + url.search)
        }
      }
    }
    catch (e) {
      console.warn('[AiSocialPageContent] Failed to parse debug param:', e)
    }
  }, [searchParams, router, setDebugFiles])

  useEffect(() => {
    try {
      const prompt = searchParams.get('agentExternalPrompt')
      const id = searchParams.get('agentTaskId')
      if (prompt) {
        setAppliedPrompt(prompt)
      }
      if (id) {
        setAgentTaskId(id)
      }
      // 清理 URL 上的 query，避免重复
      if (prompt || id) {
        router.replace(`/${params.lng}/ai-social`)
      }
    }
    catch (e) {
      // ignore
    }
  }, [searchParams, router, params.lng])

  // 读取 URL tab 参数或记忆模式
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'publisher' || tab === 'chat') {
      setPublishMode(tab)
      return
    }
    try {
      const saved = window.localStorage.getItem(AI_PUBLISH_MODE_KEY)
      if (saved === 'publisher' || saved === 'chat') {
        setPublishMode(saved)
      }
    }
    catch {}
  }, [searchParams])

  const handleSelectPublishMode = useCallback((mode: AiPublishMode) => {
    setPublishMode(mode)
    try {
      window.localStorage.setItem(AI_PUBLISH_MODE_KEY, mode)
    }
    catch {}
  }, [])

  // 进入排版工坊时自动收起左侧导航栏以释放空间，离开时恢复
  useEffect(() => {
    const userStore = useUserStore.getState()
    if (publishMode === 'publisher') {
      if (prevSidebarCollapsedRef.current === null) {
        prevSidebarCollapsedRef.current = userStore.sidebarCollapsed
      }
      if (!userStore.sidebarCollapsed) {
        userStore.setSidebarCollapsed(true)
      }
    }
    else if (prevSidebarCollapsedRef.current !== null) {
      userStore.setSidebarCollapsed(prevSidebarCollapsedRef.current)
      prevSidebarCollapsedRef.current = null
    }
  }, [publishMode])

  useEffect(() => {
    return () => {
      if (prevSidebarCollapsedRef.current !== null) {
        useUserStore.getState().setSidebarCollapsed(prevSidebarCollapsedRef.current)
        prevSidebarCollapsedRef.current = null
      }
    }
  }, [])

  // 加载用户素材库分组，使排版工坊直接拉取当前素材库内容
  useEffect(() => {
    if (publishMode !== 'publisher') return
    let mounted = true
    setGroupsLoading(true)
    apiGetMaterialGroupList(1, 30)
      .then((res) => {
        if (!mounted) return
        const list = res?.data?.list || []
        setMaterialGroups(list)
        if (!activeGroupId) {
          const preferred = (currentPlanId && list.find(g => g.id === currentPlanId)?.id)
            || list.find(g => g.isDefault)?.id
            || list[0]?.id
            || currentPlanId
            || ''
          if (preferred) setActiveGroupId(preferred)
        }
      })
      .catch(() => {
        if (mounted && currentPlanId && !activeGroupId) {
          setActiveGroupId(currentPlanId)
        }
      })
      .finally(() => {
        if (mounted) setGroupsLoading(false)
      })
    return () => { mounted = false }
  }, [publishMode, currentPlanId, activeGroupId])

  // 清除外部提示词
  const handleClearExternalPrompt = useCallback(() => {
    setAppliedPrompt('')
    setAppliedMaterials([])
  }, [])

  return (
    <div
      className="min-h-full bg-background"
      onDragEnter={publishMode === 'chat' ? handleDragEnter : undefined}
      onDragLeave={publishMode === 'chat' ? handleDragLeave : undefined}
      onDragOver={publishMode === 'chat' ? handleDragOver : undefined}
      onDrop={publishMode === 'chat' ? handleDrop : undefined}
    >
      {/* 顶部模式切换栏：AI 策划台 | 排版工坊 */}
      <div className="sticky top-0 z-20 border-b border-border/70 bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/50 p-1">
              <button
                type="button"
                data-testid="tab-ai-planner"
                onClick={() => handleSelectPublishMode('chat')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer',
                  publishMode === 'chat'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI 策划台
              </button>
              <button
                type="button"
                data-testid="tab-compose-studio"
                onClick={() => handleSelectPublishMode('publisher')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer',
                  publishMode === 'publisher'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                排版工坊
              </button>
            </div>
          </div>

          {publishMode === 'publisher' && materialGroups.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>素材来源：</span>
              <StudioSelect
                className="w-[160px]"
                triggerClassName="h-8 text-xs"
                value={activeGroupId}
                options={materialGroups.map(g => ({ value: g.id, label: g.name || g.title || '默认素材库' }))}
                onChange={setActiveGroupId}
              />
            </div>
          )}
        </div>
      </div>

      {publishMode === 'publisher' ? (
        <section className="px-4 py-4 md:px-6">
          {activeGroupId ? (
            <LivePreviewStudio key={activeGroupId} groupId={activeGroupId} />
          ) : groupsLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-sm text-muted-foreground">
              暂无可用素材分组，请先前往「视觉创作」生成视觉素材
            </div>
          )}
        </section>
      ) : (
        <>
          {/* 拖拽遮罩层 */}
          {isDragging && (
            <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-primary bg-card">
                <Upload className="w-12 h-12 text-primary" />
                <p className="text-lg font-medium text-foreground">{t('dropToUpload')}</p>
              </div>
            </div>
          )}

          {/* 首屏 Chat 区域 */}
          <section className="min-h-[38vh] flex items-center justify-center px-4 pt-12 pb-8 md:pt-16 md:pb-10">
            <HomeChat
              ref={homeChatRef}
              externalPrompt={appliedPrompt}
              externalMaterials={appliedMaterials}
              onClearExternalPrompt={handleClearExternalPrompt}
              agentTaskId={agentTaskId}
            />
          </section>

          {/* 任务预览区域 - 无数据时自动隐藏 */}
          <TaskPreview limit={4} className="px-4 py-8" />

          {/* 提示词画廊区域 */}
          <PromptGallery onApplyPrompt={handleApplyPrompt} />

          {/* AI Agent 功能亮点（独立展示） */}
          <AgentFeatures />

          {/* 一图解读 AiToEarn 生态 */}
          <EcosystemDiagram />

          {/* 回到顶部按钮 - 右侧 */}
          <BackToTop position="right" />
        </>
      )}
    </div>
  )
}
