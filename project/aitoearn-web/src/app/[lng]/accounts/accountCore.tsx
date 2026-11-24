'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import type { AccountsViewMode } from '@/app/[lng]/accounts/components/AccountsTopNav'
import type { IPublishDialogRef } from '@/components/PublishDialog'
import { NoSSR } from '@kwooshung/react-no-ssr'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { apiGetDraftInfo, apiGetMaterialGroupList, apiGetMaterialList } from '@/api/materials/material.api'
import AccountsTopNav from '@/app/[lng]/accounts/components/AccountsTopNav'
import CalendarTiming from '@/app/[lng]/accounts/components/CalendarTiming'
import ScheduledDraftBoxView from '@/app/[lng]/accounts/components/ScheduledDraftBoxView'
import { AccountStatus } from '@/app/config/accountConfig'
import { PlatType } from '@/app/config/platConfig'
import { useTransClient } from '@/app/i18n/client'
import rightArrow from '@/assets/images/jiantou.png'
import { useChannelManagerStore } from '@/components/ChannelManager'
import PublishDialog from '@/components/PublishDialog'
import { applyDraftToPublishDialog, SCHEDULE_DRAFT_STORAGE_KEY } from '@/components/PublishDialog/draftSchedule.util'
import { VideoGrabFrame } from '@/components/PublishDialog/PublishDialog.util'
import { usePublishDialog } from '@/components/PublishDialog/usePublishDialog'
import { useAccountStore } from '@/store/account'
import { generateUUID } from '@/utils/common'
import { toast } from '@/utils/ui/toast'
import { useCalendarTiming } from './components/CalendarTiming/useCalendarTiming'
import { useNewWork } from './hooks/useNewWork'
import 'driver.js/dist/driver.css'

interface AccountPageCoreProps {
  searchParams?: {
    platform?: string
    spaceId?: string
    addChannel?: string // 添加频道引导参数
    updateChannel?: string // 更新频道授权参数
    action?: string // 动作类型：publish / scheduleDraft 等
    view?: string // calendar | drafts
    draftId?: string // 排版工坊一键排期草稿 ID
    // AI生成的内容参数
    aiGenerated?: string
    accountId?: string
    taskId?: string
    title?: string
    description?: string
    tags?: string
    medias?: string
  }
}

export default function AccountPageCore({ searchParams }: AccountPageCoreProps) {
  const { accountInit, accountLoading, accountListInitialized } = useAccountStore(
    useShallow(state => ({
      accountInit: state.accountInit,
      accountLoading: state.accountLoading,
      accountListInitialized: state.accountListInitialized,
    })),
  )

  const { t } = useTransClient('account')
  const urlSearchParams = useSearchParams()

  // 频道管理器相关方法
  const { openConnectList, openAndAuth } = useChannelManagerStore(
    useShallow(state => ({
      openConnectList: state.openConnectList,
      openAndAuth: state.openAndAuth,
    })),
  )

  // 微信浏览器提示弹窗开关
  const [showWechatBrowserTip, setShowWechatBrowserTip] = useState(false)
  // 视图切换：排期日历 | 排版草稿箱
  const [activeView, setActiveView] = useState<AccountsViewMode>(
    searchParams?.view === 'drafts' ? 'drafts' : 'calendar',
  )
  const [draftCount, setDraftCount] = useState<number>(0)
  // 待预填的排版草稿
  const [pendingScheduleDraft, setPendingScheduleDraft] = useState<PromotionMaterial | null>(null)
  // 发布弹窗状态
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [defaultAccountIds, setDefaultAccountIds] = useState<string[]>()
  const [aiGeneratedData, setAiGeneratedData] = useState<any>(null)
  const publishDialogRef = useRef<IPublishDialogRef>(null)
  const handledDraftQueryRef = useRef<string | null>(null)
  const accountListInitialLoading = accountLoading && !accountListInitialized

  // 使用新建作品 hook
  const { openNewWork, allAccounts } = useNewWork({
    publishDialogRef,
    setPublishDialogOpen,
    setDefaultAccountIds,
  })

  useEffect(() => {
    accountInit()
  }, [])

  // 加载排版草稿箱数量（供顶部角标展示）
  const refreshDraftCount = useCallback(async () => {
    try {
      const groupRes = await apiGetMaterialGroupList(1, 20)
      const groups = groupRes?.data?.list || []
      if (groups.length === 0) {
        setDraftCount(0)
        return
      }
      const lists = await Promise.all(
        groups.slice(0, 5).map(async (g) => {
          const res = await apiGetMaterialList(g.id, 1, 50)
          return res?.data?.list || []
        }),
      )
      const uniqueIds = new Set(lists.flat().map(item => item.id))
      setDraftCount(uniqueIds.size)
    }
    catch {}
  }, [])

  useEffect(() => {
    void refreshDraftCount()
  }, [refreshDraftCount])

  // 从排版草稿箱或排版工坊一键排期发布
  const handleScheduleDraft = useCallback((draft: PromotionMaterial) => {
    setPendingScheduleDraft(draft)

    // 优先匹配草稿目标平台账号
    const targetTypes = new Set(draft.accountTypes || [])
    let matched = allAccounts.filter(
      acc => targetTypes.has(acc.type) && acc.status === AccountStatus.USABLE,
    )
    if (matched.length === 0 && targetTypes.size > 0) {
      matched = allAccounts.filter(acc => targetTypes.has(acc.type))
    }
    if (matched.length === 0) {
      matched = allAccounts.filter(acc => acc.status === AccountStatus.USABLE)
    }
    if (matched.length === 0 && allAccounts.length > 0) {
      matched = [allAccounts[0]]
    }
    setDefaultAccountIds(matched.length > 0 ? matched.map(a => a.id) : undefined)
    setPublishDialogOpen(true)
  }, [allAccounts])

  // 响应 URL 参数：?view=drafts 或 ?action=scheduleDraft&draftId=...
  useEffect(() => {
    const viewParam = urlSearchParams?.get('view') || searchParams?.view
    if (viewParam === 'drafts') {
      setActiveView('drafts')
    }

    const actionParam = urlSearchParams?.get('action') || searchParams?.action
    const draftIdParam = urlSearchParams?.get('draftId') || searchParams?.draftId
    if (actionParam === 'scheduleDraft') {
      const key = `${actionParam}:${draftIdParam || 'session'}`
      if (handledDraftQueryRef.current === key) return
      handledDraftQueryRef.current = key

      const hydrateAndOpen = async () => {
        let draft: PromotionMaterial | null = null
        try {
          const raw = sessionStorage.getItem(SCHEDULE_DRAFT_STORAGE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as PromotionMaterial
            if (!draftIdParam || parsed.id === draftIdParam || parsed.title) {
              draft = parsed
            }
            sessionStorage.removeItem(SCHEDULE_DRAFT_STORAGE_KEY)
          }
        }
        catch {}

        if (!draft && draftIdParam) {
          try {
            const res = await apiGetDraftInfo(draftIdParam)
            if (res?.code === 0 && res.data) {
              draft = res.data
            }
          }
          catch {}
        }

        if (draft) {
          handleScheduleDraft(draft)
        }
        else {
          setPublishDialogOpen(true)
        }

        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('action')
          url.searchParams.delete('draftId')
          window.history.replaceState({}, '', url.toString())
        }
      }

      void hydrateAndOpen()
    }
  }, [urlSearchParams, searchParams?.view, searchParams?.action, searchParams?.draftId, handleScheduleDraft])

  // PublishDialog 打开后自动填充待排期草稿
  useEffect(() => {
    if (!pendingScheduleDraft || !publishDialogOpen) return
    let cancelled = false

    const timer = setTimeout(async () => {
      if (cancelled) return
      try {
        const result = await applyDraftToPublishDialog(pendingScheduleDraft)
        if (!cancelled) {
          if (result.hasAccounts) {
            toast.success('已自动填入排版工坊草稿，选择时间即可排期发布')
          }
          else {
            toast.info('已带入排版草稿内容，先绑定渠道后即可一键排期发布')
          }
          setPendingScheduleDraft(null)
        }
      }
      catch (err) {
        console.error('[AccountPageCore] Failed to apply pending draft:', err)
      }
    }, 380)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pendingScheduleDraft, publishDialogOpen])

  // 处理URL参数
  useEffect(() => {
    // 处理更新频道授权（直接打开授权弹窗并自动触发）
    if (searchParams?.updateChannel) {
      const platform = searchParams.updateChannel as PlatType
      const validPlatforms = Object.values(PlatType)

      if (validPlatforms.includes(platform)) {
        // 直接打开频道管理器并触发授权
        setTimeout(() => {
          openAndAuth(platform)
        }, 500)

        // 清除URL参数
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('updateChannel')
          window.history.replaceState({}, '', url.toString())
        }
      }
      return
    }

    // Handle AI-generated content params
    if (searchParams?.aiGenerated === 'true' && allAccounts.length > 0) {
      try {
        const medias = searchParams.medias
          ? JSON.parse(decodeURIComponent(searchParams.medias))
          : []
        const tags = searchParams.tags ? JSON.parse(decodeURIComponent(searchParams.tags)) : []

        const data = {
          taskId: searchParams.taskId,
          title: searchParams.title ? decodeURIComponent(searchParams.title) : '',
          description: searchParams.description ? decodeURIComponent(searchParams.description) : '',
          tags,
          medias,
        }

        setAiGeneratedData(data)

        // 选择账号：优先使用 accountId，其次选择对应平台的账号
        let targetAccount = null

        if (searchParams.accountId) {
          // 如果指定了 accountId，查找该账号
          targetAccount = allAccounts.find(account => account.id === searchParams.accountId)
        }
        else if (searchParams.platform) {
          // 如果指定了 platform，选择该平台的第一个在线账号
          const platform = searchParams.platform as PlatType
          targetAccount = allAccounts.find((account) => {
            const isOnline = account.status === AccountStatus.USABLE
            const isPlatformMatch = account.type === platform
            return isOnline && isPlatformMatch
          })
          // 如果没有在线账号，选择该平台的第一个账号
          if (!targetAccount) {
            targetAccount = allAccounts.find(account => account.type === platform)
          }
        }
        else {
          // 没有指定平台，选择第一个在线账户
          targetAccount = allAccounts.find((account) => {
            const isOnline = account.status === AccountStatus.USABLE
            return isOnline
          })
        }

        if (targetAccount) {
          setDefaultAccountIds([targetAccount.id])
        }
        else if (allAccounts[0]) {
          // 如果没有找到符合条件的账户，退而求其次选择第一个账户
          setDefaultAccountIds([allAccounts[0].id])
        }

        // Open publish dialog
        setTimeout(() => {
          setPublishDialogOpen(true)
        }, 500)

        // Clear URL params
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('action')
          url.searchParams.delete('aiGenerated')
          url.searchParams.delete('platform')
          url.searchParams.delete('accountId')
          url.searchParams.delete('taskId')
          url.searchParams.delete('title')
          url.searchParams.delete('description')
          url.searchParams.delete('tags')
          url.searchParams.delete('medias')
          window.history.replaceState({}, '', url.toString())
        }
      }
      catch (error) {
        console.error('Failed to parse AI generated data:', error)
      }
    }

    // 注意：只有在不是 AI 发布场景时才处理 platform 参数打开添加账号弹窗
    if (
      (searchParams?.platform || searchParams?.spaceId)
      && searchParams?.action !== 'publish'
      && searchParams?.aiGenerated !== 'true'
    ) {
      // 验证平台类型是否有效
      const platform = searchParams.platform as PlatType
      const validPlatforms = Object.values(PlatType)
      const spaceId = searchParams.spaceId

      if (searchParams.platform && validPlatforms.includes(platform)) {
        // 有指定平台，直接授权
        openAndAuth(platform, spaceId)
      }
      else if (spaceId) {
        // 只有spaceId，打开连接频道列表
        openConnectList(spaceId)
      }
    }
  }, [searchParams, allAccounts.length, openAndAuth, openConnectList])

  /**
   * 检测是否为微信浏览器
   */
  const isWechatBrowser = () => {
    if (typeof window === 'undefined')
      return false
    const ua = window.navigator.userAgent.toLowerCase()
    return ua.includes('micromessenger')
  }

  /**
   * 在移动端首次进入时，如果是微信浏览器，显示微信浏览器提示
   */
  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const isMobile = window.innerWidth <= 768
    const hasShownWechatTip = sessionStorage.getItem('accountsWechatTipShown')

    if (isMobile && isWechatBrowser() && !hasShownWechatTip) {
      setShowWechatBrowserTip(true)
      sessionStorage.setItem('accountsWechatTipShown', '1')
    }
  }, [])

  /**
   * 关闭微信浏览器提示弹窗
   */
  const closeWechatBrowserTip = () => {
    setShowWechatBrowserTip(false)
  }

  const wechatBrowserTexts = (() => {
    return {
      title: t('browserTip.title'),
      desc: t('browserTip.description'),
      cta: t('browserTip.button'),
    }
  })()

  // Fill AI-generated data after publish dialog opens
  useEffect(() => {
    if (aiGeneratedData && publishDialogOpen && allAccounts.length > 0) {
      let innerTimeoutId: ReturnType<typeof setTimeout> | undefined
      // Delay filling to ensure PublishDialog is fully initialized
      const timeoutId = setTimeout(() => {
        try {
          const store = usePublishDialog.getState()

          // If pubList is not initialized yet, retry after delay
          if (!store.pubList || store.pubList.length === 0) {
            innerTimeoutId = setTimeout(() => {
              const retryStore = usePublishDialog.getState()
              if (retryStore.pubList && retryStore.pubList.length > 0) {
                fillAIData(retryStore)
              }
            }, 1000)
            return
          }

          fillAIData(store)
        }
        catch (error) {
          console.error('Failed to fill AI data:', error)
        }
      }, 1000)

      // Helper function to fill data
      const fillAIData = async (store: any) => {
        // Build params - append tags to description
        let description = aiGeneratedData.description || ''
        if (aiGeneratedData.tags && aiGeneratedData.tags.length > 0) {
          const tagsText = aiGeneratedData.tags.map((tag: string) => `#${tag}`).join(' ')
          description = `${description}\n\n${tagsText}`
        }

        const params: any = {
          des: description,
          title: aiGeneratedData.title || '',
        }

        // Handle media files - support multiple medias
        const medias = aiGeneratedData.medias || []

        if (medias.length > 0) {
          // Check if there's a video
          const videoMedia = medias.find((m: any) => m.type === 'VIDEO')
          if (videoMedia) {
            try {
              let coverInfo

              // If API returned cover URL, use it directly (support both coverUrl and thumbUrl)
              const coverUrl = videoMedia.coverUrl || videoMedia.thumbUrl
              if (coverUrl) {
                // Load cover image to get dimension info
                coverInfo = await new Promise((resolve) => {
                  const img = document.createElement('img')
                  img.crossOrigin = 'anonymous'
                  img.onload = () => {
                    resolve({
                      id: generateUUID(),
                      width: img.width,
                      height: img.height,
                      imgUrl: coverUrl,
                      ossUrl: coverUrl,
                      filename: `ai_${aiGeneratedData.taskId}_cover.jpg`,
                      imgPath: '',
                      size: 0,
                      file: null as any,
                    })
                  }
                  img.onerror = () => {
                    resolve(null)
                  }
                  img.src = coverUrl
                })
              }

              // If no cover URL or cover load failed, try to extract from video
              if (!coverInfo) {
                try {
                  const videoInfo = await VideoGrabFrame(videoMedia.url, 0)

                  params.video = {
                    size: 0,
                    file: null as any,
                    videoUrl: videoMedia.url,
                    ossUrl: videoMedia.url,
                    filename: `ai_${aiGeneratedData.taskId}.mp4`,
                    width: videoInfo.width,
                    height: videoInfo.height,
                    duration: videoInfo.duration,
                    cover: videoInfo.cover,
                  }
                }
                catch (extractError) {
                  // Cross-origin video cannot extract cover, use placeholder
                  // Create a cover using video URL as imgUrl (browser will auto-display first frame)
                  const video = document.createElement('video')
                  video.src = videoMedia.url
                  video.crossOrigin = 'anonymous'

                  await new Promise((resolve) => {
                    video.addEventListener('loadedmetadata', () => {
                      // Use video URL as cover imgUrl, browser video tag's poster will handle it automatically
                      const placeholderCover: any = {
                        id: generateUUID(),
                        size: 0,
                        file: null as any,
                        imgUrl: videoMedia.url, // Use video URL, video tag will show first frame
                        filename: `ai_${aiGeneratedData.taskId}_cover.jpg`,
                        imgPath: '',
                        width: video.videoWidth,
                        height: video.videoHeight,
                        ossUrl: '', // No separate cover URL
                      }

                      params.video = {
                        size: 0,
                        file: null as any,
                        videoUrl: videoMedia.url,
                        ossUrl: videoMedia.url,
                        filename: `ai_${aiGeneratedData.taskId}.mp4`,
                        width: video.videoWidth,
                        height: video.videoHeight,
                        duration: Math.floor(video.duration),
                        cover: placeholderCover,
                      }
                      video.remove()
                      resolve(null)
                    })
                    video.addEventListener('error', () => {
                      // Complete failure, use default values
                      const defaultCover: any = {
                        id: generateUUID(),
                        size: 0,
                        file: null as any,
                        imgUrl: videoMedia.url,
                        filename: `ai_${aiGeneratedData.taskId}_cover.jpg`,
                        imgPath: '',
                        width: 1920,
                        height: 1080,
                        ossUrl: '',
                      }

                      params.video = {
                        size: 0,
                        file: null as any,
                        videoUrl: videoMedia.url,
                        ossUrl: videoMedia.url,
                        filename: `ai_${aiGeneratedData.taskId}.mp4`,
                        width: 1920,
                        height: 1080,
                        duration: 0,
                        cover: defaultCover,
                      }
                      video.remove()
                      resolve(null)
                    })
                    video.load()
                  })
                }
              }
              else {
                // Use API-returned cover, but still need to get width/height/duration from video
                const video = document.createElement('video')
                video.src = videoMedia.url
                video.crossOrigin = 'anonymous'

                await new Promise((resolve) => {
                  video.addEventListener('loadedmetadata', () => {
                    params.video = {
                      size: 0,
                      file: null as any,
                      videoUrl: videoMedia.url,
                      ossUrl: videoMedia.url,
                      filename: `ai_${aiGeneratedData.taskId}.mp4`,
                      width: video.videoWidth,
                      height: video.videoHeight,
                      duration: Math.floor(video.duration),
                      cover: coverInfo,
                    }
                    video.remove()
                    resolve(null)
                  })
                  video.addEventListener('error', () => {
                    // If video metadata loading fails, use default dimensions
                    params.video = {
                      size: 0,
                      file: null as any,
                      videoUrl: videoMedia.url,
                      ossUrl: videoMedia.url,
                      filename: `ai_${aiGeneratedData.taskId}.mp4`,
                      width: 1920,
                      height: 1080,
                      duration: 0,
                      cover: coverInfo,
                    }
                    video.remove()
                    resolve(null)
                  })
                  video.load()
                })
              }

              params.images = []
            }
            catch (error) {
              console.error('Failed to process video:', error)
              // If all methods fail, use default cover
              const defaultCover: any = {
                id: generateUUID(),
                size: 0,
                file: null as any,
                imgUrl: '', // Empty, will show default icon
                filename: `ai_${aiGeneratedData.taskId}_cover.jpg`,
                imgPath: '',
                width: 1920,
                height: 1080,
                ossUrl: '',
              }

              params.video = {
                size: 0,
                file: null as any,
                videoUrl: videoMedia.url,
                ossUrl: videoMedia.url,
                filename: `ai_${aiGeneratedData.taskId}.mp4`,
                width: 1920,
                height: 1080,
                duration: 0,
                cover: defaultCover,
              }
              params.images = []
            }
          }
          else {
            // Process all images
            const imageMedias = medias.filter((m: any) => m.type === 'IMAGE')
            if (imageMedias.length > 0) {
              params.images = imageMedias.map((media: any, index: number) => ({
                id: generateUUID(),
                size: 0,
                file: null as any,
                imgUrl: media.url, // Use ossUrl as preview URL
                filename: `ai_${aiGeneratedData.taskId}_${index + 1}.jpg`,
                imgPath: '',
                width: 1920,
                height: 1080,
                ossUrl: media.url, // AI-generated images already have ossUrl
              }))
              params.video = undefined
            }
          }
        }

        // Fill data to first selected account
        if (store.pubListChoosed && store.pubListChoosed.length > 0) {
          store.setOnePubParams(params, store.pubListChoosed[0].account.id)
        }
      }

      return () => {
        clearTimeout(timeoutId)
        if (innerTimeoutId)
          clearTimeout(innerTimeoutId)
      }
    }
  }, [aiGeneratedData, publishDialogOpen, allAccounts.length])

  return (
    <NoSSR>
      <div className="flex flex-col h-full bg-background">
        {/* SEO: h1 标题 - 视觉隐藏但对搜索引擎可见 */}
        <h1 className="sr-only">{t('title')}</h1>

        {/* Row 1: 顶部导航栏（含 排期日历 / 排版草稿箱 切换） */}
        <AccountsTopNav
          onNewWork={() => openNewWork()}
          onAddAccount={() => openConnectList()}
          activeView={activeView}
          onViewChange={setActiveView}
          draftCount={draftCount}
        />

        {/* 主内容区域: 排期日历 或 专用排版草稿箱 */}
        {activeView === 'drafts' ? (
          <ScheduledDraftBoxView
            onScheduleDraft={handleScheduleDraft}
            onDraftCountChange={setDraftCount}
          />
        ) : (
          <CalendarTiming />
        )}

        {/* 微信浏览器提示（遮罩 + 箭头指向右上角） */}
        {showWechatBrowserTip && (
          <>
            <div
              className="fixed inset-0 bg-black/85 z-[1000] animate-[fadeIn_0.2s_ease-out]"
              onClick={closeWechatBrowserTip}
            />
            <Image
              src={rightArrow}
              alt="rightArrow"
              width={120}
              height={120}
              className="fixed top-[10%] right-5 z-[1002] pointer-events-none bg-accent animate-[arrowPulse_2s_ease-in-out_infinite] rounded-full p-2.5"
            />
            <div className="fixed inset-0 z-[1001] flex items-center justify-center pointer-events-none">
              <div className="bg-background/95 rounded-2xl p-6 mx-5 max-w-[320px] shadow-[0_10px_40px_rgba(0,0,0,0.3)] backdrop-blur-[10px] pointer-events-auto animate-[tipFadeIn_0.3s_ease-out]">
                <div className="text-lg font-bold text-foreground text-center mb-5">
                  {wechatBrowserTexts.title}
                </div>
                <div className="mb-5">
                  <div className="flex items-center gap-3 mb-3 text-sm text-foreground leading-normal">
                    <span className="bg-gradient-back text-gradient-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 shadow-sm shadow-primary/20">
                      1
                    </span>
                    <span className="flex-1">
                      {t('wechatBrowserTip.clickCorner')}
                      <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-xs mx-1 inline-block">
                        ⋯
                      </span>
                      {t('wechatBrowserTip.dotsButton')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-3 text-sm text-foreground leading-normal">
                    <span className="bg-gradient-back text-gradient-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 shadow-sm shadow-primary/20">
                      2
                    </span>
                    <span className="flex-1">
                      {t('wechatBrowserTip.selectBrowser')}
                      <span className="bg-muted text-muted-foreground px-1.5 py-0.5 rounded text-xs mx-1 inline-block">
                        🌐
                      </span>
                      {t('wechatBrowserTip.openInBrowser')}
                    </span>
                  </div>
                </div>
                <button
                  className="w-full bg-gradient-back text-gradient-foreground border-none px-3 py-3 rounded-lg font-semibold cursor-pointer shadow-sm shadow-primary/20 transition-all hover:shadow-md hover:shadow-primary/25"
                  onClick={closeWechatBrowserTip}
                >
                  {wechatBrowserTexts.cta}
                </button>
              </div>
            </div>
          </>
        )}

        {/* 发布作品弹窗 */}
        <PublishDialog
          ref={publishDialogRef}
          open={publishDialogOpen}
          onClose={() => {
            setPublishDialogOpen(false)
            setAiGeneratedData(null)
            setPendingScheduleDraft(null)
            setDefaultAccountIds(undefined)
          }}
          accounts={allAccounts}
          defaultAccountIds={defaultAccountIds}
          accountListInitialLoading={accountListInitialLoading}
          onPubSuccess={() => {
            setPublishDialogOpen(false)
            setAiGeneratedData(null)
            setPendingScheduleDraft(null)
            setDefaultAccountIds(undefined)
            setActiveView('calendar')
            void refreshDraftCount()
            useCalendarTiming.getState().getPubRecord()
          }}
        />
      </div>
    </NoSSR>
  )
}
