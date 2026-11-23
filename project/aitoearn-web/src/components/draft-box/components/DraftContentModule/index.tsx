/**
 * DraftContentModule - 内容管理核心模块
 * 可复用的草稿管理区域，包含 AI生成栏、草稿列表、相关弹框
 */

'use client'

import type { DraftListSectionTab } from '../DraftListSection'
import { ArrowLeft, Dna, LayoutList, Loader2, Maximize2, Minimize2, Network } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTransClient } from '@/app/i18n/client'
import './workspace.css'
import { PubType } from '@/app/config/publishConfig'
import PublishDialog from '@/components/PublishDialog'
import { buildPublishParamsFromDraft } from '@/components/PublishDialog/PublishDialog.util'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { useAccountStore } from '@/store/account'
import { usePlanDetailStore } from '@/store/draft-box/planDetailStore'
import { getPlatformInfoSync } from '@/store/platformMetadata'
import { isPlatformAvailable } from '@/store/platformMetadata/utils'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import { toast } from '@/utils/ui/toast'
import { useGenerationPolling } from '../../hooks/useGenerationPolling'
import AiBatchGenerateBar from '../AiBatchGenerateBar'
import { useMediaTabStore } from '../ContentTabs/mediaTabStore'
import { CreateMaterialModal } from '../CreateMaterialModal'
import { DraftDetailDialog } from '../DraftDetailDialog'
import { DraftListSection } from '../DraftListSection'
import { GenerationDetailDialog } from '../GenerationDetailDialog'
import { InfiniteCanvasStudio } from '../StudioModes/InfiniteCanvasStudio'
import { VisualEvolutionStudio } from '../StudioModes/VisualEvolutionStudio'
import { TransferDraftDialog } from '../TransferDraftDialog'
import { VideoCreateDraftTaskWidget } from '../VideoCreateDraftTaskWidget'

type StudioViewMode = 'classic' | 'canvas' | 'evolution'

const STUDIO_MODE_STORAGE_KEY = 'foldframe:studio-view-mode'

const STUDIO_VIEW_MODES: Array<{
  id: StudioViewMode
  label: string
  badge?: string
  description: string
  icon: typeof LayoutList
}> = [
  {
    id: 'classic',
    label: '快捷工作台',
    description: '快捷指令栏 + 媒体资源网格',
    icon: LayoutList,
  },
  {
    id: 'canvas',
    label: '无限画布',
    badge: 'Agent',
    description: '无限画布节点连线 + 内嵌 Agent 实时协作',
    icon: Network,
  },
  {
    id: 'evolution',
    label: '多维改图',
    badge: '二创',
    description: '围绕参考图按角度、光影、场景、画风、穿搭、表情灵活二创',
    icon: Dna,
  },
]

interface DraftContentModuleProps {
  /** 外部指定草稿箱 ID，不依赖当前草稿箱 */
  groupId?: string
  /** 草稿列表可见 Tab */
  draftListTabs?: DraftListSectionTab[]
  /** 草稿列表默认 Tab */
  draftListDefaultTab?: DraftListSectionTab
  /** 是否强制使用草稿生成模式 */
  forceDraftMode?: boolean
  /** 是否允许转移草稿 */
  allowTransfer?: boolean
  /** 是否显示视频生成草稿长任务悬浮窗 */
  showVideoCreateDraftTaskWidget?: boolean
  /** 内容区域外层样式 */
  contentClassName?: string
  /** 是否嵌入到其他弹框/面板中 */
  embedded?: boolean
  /** 是否允许拖拽草稿/素材到发布弹框 */
  enablePublishDrag?: boolean
}

function DraftContentModule({
  groupId,
  draftListTabs,
  draftListDefaultTab,
  forceDraftMode = false,
  allowTransfer = true,
  showVideoCreateDraftTaskWidget = true,
  contentClassName = 'space-y-6 p-4 md:p-6',
  embedded = false,
  enablePublishDrag = false,
}: DraftContentModuleProps) {
  const { t } = useTransClient('brandPromotion')
  const {
    currentPlan,
    createMaterialModalOpen,
    editingMaterial,
    generationTasks,
    publishDialogOpen,
    publishingDraft,
    closeMaterialModal,
    fetchMaterials,
    closePublishDialog,
    syncGenerationTasks,
    updateGeneratingCount,
  } = usePlanDetailStore(
    useShallow(state => ({
      currentPlan: state.currentPlan,
      createMaterialModalOpen: state.createMaterialModalOpen,
      editingMaterial: state.editingMaterial,
      generationTasks: state.generationTasks,
      publishDialogOpen: state.publishDialogOpen,
      publishingDraft: state.publishingDraft,
      closeMaterialModal: state.closeMaterialModal,
      fetchMaterials: state.fetchMaterials,
      closePublishDialog: state.closePublishDialog,
      syncGenerationTasks: state.syncGenerationTasks,
      updateGeneratingCount: state.updateGeneratingCount,
    })),
  )

  const selectedPlanId = groupId || currentPlan?.id || null
  const [studioViewMode, setStudioViewMode] = useState<StudioViewMode>('classic')
  const [studioFullscreen, setStudioFullscreen] = useState(false)
  const prevSidebarCollapsedRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (embedded) return
    try {
      const saved = window.localStorage.getItem(STUDIO_MODE_STORAGE_KEY)
      if (saved === 'classic' || saved === 'canvas' || saved === 'evolution') {
        setStudioViewMode(saved)
      }
      else {
        setStudioViewMode('classic')
      }
    }
    catch {}
  }, [embedded])

  const handleSelectStudioViewMode = useCallback((mode: StudioViewMode) => {
    setStudioViewMode(mode)
    if (mode === 'canvas') {
      setStudioFullscreen(true)
    }
    else if (mode === 'classic') {
      setStudioFullscreen(false)
    }
    try {
      window.localStorage.setItem(STUDIO_MODE_STORAGE_KEY, mode)
    }
    catch {}
  }, [])

  const effectiveStudioMode: StudioViewMode = embedded ? 'classic' : studioViewMode
  const isImmersiveFullscreen = !embedded && effectiveStudioMode !== 'classic' && studioFullscreen

  // Auto-collapse left navigation sidebar when entering Canvas / Evolution / Publisher modes to maximize workspace area
  useEffect(() => {
    if (embedded) return
    const userStore = useUserStore.getState()
    if (effectiveStudioMode !== 'classic') {
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
  }, [effectiveStudioMode, embedded])

  // Restore sidebar state on unmount (when navigating to another route)
  useEffect(() => {
    return () => {
      if (prevSidebarCollapsedRef.current !== null) {
        useUserStore.getState().setSidebarCollapsed(prevSidebarCollapsedRef.current)
        prevSidebarCollapsedRef.current = null
      }
    }
  }, [])

  // Allow Esc key to exit immersive fullscreen
  useEffect(() => {
    if (!isImmersiveFullscreen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStudioFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isImmersiveFullscreen])

  const previousMediaResetPlanIdRef = useRef<string | null>(null)
  const pollingTaskIds = useMemo(
    () => generationTasks.filter(task => task.status === 'generating').map(task => task.id),
    [generationTasks],
  )

  const accountList = useAccountStore(state => state.accountList)

  // Plan 切换时重置媒体 Tab 数据
  useLayoutEffect(() => {
    const previousPlanId = previousMediaResetPlanIdRef.current

    if (!selectedPlanId) {
      return
    }

    if (previousPlanId === selectedPlanId) {
      return
    }

    previousMediaResetPlanIdRef.current = selectedPlanId
    useMediaTabStore.getState().reset(selectedPlanId)
  }, [selectedPlanId])

  const notifiedFailedTaskIdsRef = useRef<Set<string>>(new Set())

  // AI 批量生成轮询
  useGenerationPolling({
    enabled: pollingTaskIds.length > 0,
    taskIds: pollingTaskIds,
    interval: 2000,
    onTasksUpdate: (tasks) => {
      syncGenerationTasks(tasks)
      for (const task of tasks) {
        if (task.status === 'failed' && !notifiedFailedTaskIdsRef.current.has(task.id)) {
          notifiedFailedTaskIdsRef.current.add(task.id)
          const rawErr = (task.errorMessage || '').trim()
          const detail = rawErr || '生成失败，请前往「模型接入」检查引擎登录与配置状态'
          toast.error(detail.startsWith('图片生成失败') ? detail : `生成失败：${detail}`)
        }
      }
    },
    onTaskCompleted: () => {
      if (selectedPlanId) {
        // silentRefreshAll 内部已同步草稿数据到 planDetailStore，无需单独调用 silentRefreshMaterials
        useMediaTabStore.getState().silentRefresh(selectedPlanId)
        useMediaTabStore.getState().silentRefreshAll(selectedPlanId, selectedPlanId)
      }
      useUserStore.getState().fetchCreditsBalance()
    },
    onCountUpdate: updateGeneratingCount,
  })

  // 根据草稿类型计算默认选中的账户
  const defaultAccountIds = useMemo(() => {
    if (!publishingDraft) {
      return undefined
    }
    const isVideo = publishingDraft.mediaList?.some(m => m.type === 'video')
    const targetPubType = isVideo ? PubType.VIDEO : PubType.ImageText

    const ids = accountList
      .filter((acc) => {
        const platConfig = getPlatformInfoSync(acc.type)
        return isPlatformAvailable(platConfig) && platConfig.pubTypes.has(targetPubType) && acc.status !== 0
      })
      .map(acc => acc.id)
    return ids
  }, [publishingDraft, accountList])

  // 发布弹框打开后预填草稿数据
  useEffect(() => {
    if (!publishDialogOpen || !publishingDraft)
      return

    const timer = setTimeout(async () => {
      const store = usePublishDialog.getState()
      if (!store.pubListChoosed?.length) {
        return
      }

      store.setPrefillLoading(true)
      try {
        store.setAccountAllParams(await buildPublishParamsFromDraft(publishingDraft))
      }
      finally {
        store.setPrefillLoading(false)
      }
    }, 500)

    return () => {
      clearTimeout(timer)
      usePublishDialog.getState().setPrefillLoading(false)
    }
  }, [publishDialogOpen, publishingDraft])

  // 创建草稿成功回调
  const handleMaterialSuccess = useCallback(() => {
    if (selectedPlanId) {
      fetchMaterials(selectedPlanId, 1)
    }
    useUserStore.getState().fetchCreditsBalance()
  }, [fetchMaterials, selectedPlanId])

  return (
    <>
      <div
        data-creation-workspace
        data-studio-wide={!embedded && effectiveStudioMode !== 'classic' ? 'true' : undefined}
        data-studio-fullscreen={isImmersiveFullscreen ? 'true' : undefined}
        className={cn(
          embedded ? '@container' : 'creation-workspace',
          isImmersiveFullscreen && 'fixed inset-0 z-50 flex flex-col bg-background overflow-hidden',
        )}
      >
        <div
          className={cn(
            embedded ? 'flex flex-col gap-4 p-4' : contentClassName,
            isImmersiveFullscreen && 'flex h-full max-w-none flex-col !p-0',
          )}
        >
          {!embedded && (
            <div
              className={cn(
                'workspace-header-row',
                effectiveStudioMode !== 'classic' && 'workspace-header-compact',
                isImmersiveFullscreen && 'border-b border-border bg-card/95 px-4 py-2 !mb-0 backdrop-blur shrink-0',
              )}
            >
              <div className="flex items-center gap-2.5">
                {isImmersiveFullscreen ? (
                  <button
                    type="button"
                    onClick={() => handleSelectStudioViewMode('classic')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    返回工作台
                  </button>
                ) : (
                  <h1 className={cn('workspace-title', effectiveStudioMode !== 'classic' && '!text-lg')}>
                    {t('studio.title')}
                  </h1>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="studio-mode-switcher" role="tablist" aria-label="创作工作台模式切换">
                  {STUDIO_VIEW_MODES.map((mode) => {
                    const Icon = mode.icon
                    const active = effectiveStudioMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={mode.description}
                        data-active={active ? 'true' : 'false'}
                        onClick={() => handleSelectStudioViewMode(mode.id)}
                        className={cn('studio-mode-btn')}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{mode.label}</span>
                        {mode.badge && <span className="studio-mode-badge">{mode.badge}</span>}
                      </button>
                    )
                  })}
                </div>

                {effectiveStudioMode !== 'classic' && (
                  <button
                    type="button"
                    title={isImmersiveFullscreen ? '退出全屏 (Esc)' : '全屏专注模式（隐藏导航栏，最大化创作区）'}
                    onClick={() => setStudioFullscreen(v => !v)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground shadow-2xs hover:border-primary/40 hover:bg-muted cursor-pointer"
                  >
                    {isImmersiveFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    <span>{isImmersiveFullscreen ? '退出全屏' : '全屏'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {effectiveStudioMode === 'classic' && (
            <>
              {/* AI 批量生成输入栏 */}
              <AiBatchGenerateBar groupId={selectedPlanId || undefined} forceDraftMode={forceDraftMode} />
              {/* 内容 Tabs：草稿箱 / 视频 / 图片 */}
              {selectedPlanId
                ? (
                    <DraftListSection
                      materialGroupId={selectedPlanId}
                      tabs={draftListTabs}
                      defaultTab={draftListDefaultTab}
                      allowTransfer={allowTransfer}
                      batchActionPosition={embedded ? 'sticky' : 'fixed'}
                      useContainerResponsive={embedded}
                      enablePublishDrag={enablePublishDrag}
                    />
                  )
                : (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
            </>
          )}

          {effectiveStudioMode === 'canvas' && (
            <div className={cn(isImmersiveFullscreen ? 'flex-1 min-h-0' : '')}>
              {selectedPlanId
                ? (
                    <InfiniteCanvasStudio
                      groupId={selectedPlanId}
                      isFullscreen={isImmersiveFullscreen}
                      onToggleFullscreen={() => setStudioFullscreen(v => !v)}
                    />
                  )
                : (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
            </div>
          )}

          {effectiveStudioMode === 'evolution' && (
            <div className={cn(isImmersiveFullscreen ? 'flex-1 overflow-y-auto p-4' : '')}>
              {selectedPlanId
                ? <VisualEvolutionStudio groupId={selectedPlanId} />
                : (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
            </div>
          )}
        </div>
      </div>

      {/* 创建草稿弹窗 */}
      <CreateMaterialModal
        open={createMaterialModalOpen}
        groupId={selectedPlanId}
        editingMaterial={editingMaterial}
        onClose={closeMaterialModal}
        onSuccess={handleMaterialSuccess}
      />

      {/* 草稿详情弹窗 */}
      <DraftDetailDialog allowTransfer={allowTransfer} />

      {/* 移动到草稿箱弹窗 */}
      {allowTransfer && <TransferDraftDialog />}

      {/* 生成任务详情弹框 */}
      <GenerationDetailDialog />

      {/* 发布弹框 */}
      {!embedded && (
        <PublishDialog
          open={publishDialogOpen}
          onClose={closePublishDialog}
          accounts={accountList}
          defaultAccountIds={defaultAccountIds}
          onPubSuccess={closePublishDialog}
        />
      )}

      {/* 视频生成草稿长任务悬浮窗 */}
      {showVideoCreateDraftTaskWidget && <VideoCreateDraftTaskWidget />}
    </>
  )
}

export default DraftContentModule
