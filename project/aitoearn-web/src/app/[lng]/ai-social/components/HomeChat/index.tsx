/**
 * HomeChat - AI 运营策划台（核心定位：一鱼多吃跨平台改写、爆款脚本策划、热点排期）
 * 与「排版工坊」清晰分工：这里负责从 0 到 1 策划全案与多平台改写；排版工坊负责单篇精细调图与 7 平台手机仿真预览。
 */

'use client'

import { Check, Link2 } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTransClient } from '@/app/i18n/client'
import { useChannelManagerStore } from '@/components/ChannelManager'
import { ChatInput } from '@/components/Chat/ChatInput'
import {
  ContextUsageRing,
  estimateConversationContextTokens,
} from '@/components/Chat/ContextUsageRing'
import { TextModelPicker } from '@/components/draft-box/components/TextModelPicker'
import { useMediaUpload } from '@/hooks/useMediaUpload'
import { isLocalFreeTextModel, usePlannerTextModels } from '@/hooks/usePlannerTextModels'
import { useAccountStore } from '@/store/account'
import { useAgentStore } from '@/store/agent'
import { useUserStore } from '@/store/user'
import { navigateToLogin } from '@/utils/auth'
import { cn } from '@/utils/className'
import { toast } from '@/utils/ui/toast'
import './style.css'

export interface IHomeChatProps {
  onLoginRequired?: () => void
  className?: string
  externalPrompt?: string
  externalMaterials?: string[]
  onClearExternalPrompt?: () => void
  agentTaskId?: string
}

export interface IHomeChatRef {
  handleFileDrop: (files: FileList) => void
}

interface TargetPlatformOption {
  id: string
  label: string
  hint: string
}

const TARGET_PLATFORMS: TargetPlatformOption[] = [
  { id: 'xhs', label: '小红书', hint: '种草笔记' },
  { id: 'douyin', label: '抖音', hint: '短平快口播' },
  { id: 'bilibili', label: 'B站', hint: '深度测评/动态' },
  { id: 'twitter', label: 'X', hint: '精炼推文/Thread' },
  { id: 'instagram', label: 'Instagram', hint: '视觉大片' },
  { id: 'youtube', label: 'YouTube', hint: '长视频/Shorts' },
  { id: 'wxSph', label: '视频号', hint: '私域转化' },
]

export const HomeChat = forwardRef<IHomeChatRef, IHomeChatProps>(
  ({ className, externalPrompt, externalMaterials, onClearExternalPrompt, agentTaskId }, ref) => {
    const { t } = useTransClient('chat')
    const { t: tHome } = useTransClient('home')
    const router = useRouter()
    const { lng } = useParams()
    const token = useUserStore(state => state.token)

    const defaultPlaceholder = '描述主题、卖点或上传参考图，AI 一键生成多平台成稿…'

    const [inputValue, setInputValue] = useState('')
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['xhs', 'douyin', 'bilibili'])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // 文本模型列表与当前上下文窗口配置（复刻视觉创作台的分层零闪烁选择器）
    const {
      models: textModelOptions,
      groups: textModelGroups,
      selectedModel,
      setSelectedModel,
      contextWindowTokens,
    } = usePlannerTextModels()

    const { openConnectList } = useChannelManagerStore(
      useShallow(state => ({
        openConnectList: state.openConnectList,
      })),
    )

    const handleAddChannelClick = useCallback(() => {
      if (!token) {
        navigateToLogin()
        return
      }
      openConnectList()
    }, [token, openConnectList])

    const {
      medias,
      setMedias,
      isUploading,
      handleMediasChange,
      handleMediaRemove,
      handleMediaUpdate,
    } = useMediaUpload({
      onError: () => toast.error(t('media.uploadFailed')),
    })

    useImperativeHandle(
      ref,
      () => ({
        handleFileDrop: (files: FileList) => {
          handleMediasChange(files)
        },
      }),
      [handleMediasChange],
    )

    useEffect(() => {
      if (agentTaskId) {
        let desc = ''
        try {
          const stored = localStorage.getItem('agentExternalPrompt')
          if (stored) {
            desc = stored
            localStorage.removeItem('agentExternalPrompt')
          }
        }
        catch {}
        desc = externalPrompt || desc || defaultPlaceholder
        setInputValue(`${desc} TaskId: ${agentTaskId}`)
        onClearExternalPrompt?.()
        return
      }

      if (externalPrompt) {
        setInputValue(externalPrompt)
      }

      if (externalMaterials && externalMaterials.length > 0) {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const newMedias = externalMaterials.map((url, idx) => ({
          id: `external-${Date.now()}-${idx}`,
          url: url.startsWith('http') ? url : `${origin}${url}`,
          type: 'image' as const,
        }))
        setMedias(newMedias)
      }

      if (externalPrompt || (externalMaterials && externalMaterials.length > 0)) {
        onClearExternalPrompt?.()
      }
    }, [externalPrompt, externalMaterials, onClearExternalPrompt, agentTaskId, setMedias])

    const searchParams = useSearchParams()

    useEffect(() => {
      try {
        if (!searchParams) return
        const promptParam = searchParams.get('prompt')
        if (promptParam) {
          setInputValue(decodeURIComponent(promptParam))
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.delete('prompt')
            window.history.replaceState({}, '', url.toString())
          }
        }

        const aiGenerated = searchParams.get('aiGenerated')
        if (aiGenerated === 'true') {
          const mediasParam = searchParams.get('medias')
          const descriptionParam = searchParams.get('description')
          if (descriptionParam) {
            setInputValue(decodeURIComponent(descriptionParam))
          }
          if (mediasParam) {
            try {
              const parsed = JSON.parse(decodeURIComponent(mediasParam))
              if (Array.isArray(parsed) && parsed.length > 0) {
                setMedias(prev => [
                  {
                    id: `shared-${Date.now()}`,
                    url: parsed[0].url,
                    type: 'image',
                    file: undefined,
                  },
                  ...prev,
                ])
              }
            }
            catch {}
          }
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            url.searchParams.delete('aiGenerated')
            url.searchParams.delete('medias')
            url.searchParams.delete('description')
            window.history.replaceState({}, '', url.toString())
          }
        }
      }
      catch {}
    }, [searchParams, setMedias])

    const { setPendingTask, setActionContext } = useAgentStore()

    useEffect(() => {
      setActionContext({
        router,
        lng: lng as string,
        t: tHome,
      })
    }, [router, lng, tHome, setActionContext])

    const togglePlatform = (id: string) => {
      setSelectedPlatforms(prev => (
        prev.includes(id)
          ? (prev.length > 1 ? prev.filter(p => p !== id) : prev)
          : [...prev, id]
      ))
    }

    const buildFinalPrompt = useCallback((raw: string) => {
      const base = raw.trim()
      if (!base) return ''
      const labels = selectedPlatforms
        .map(id => TARGET_PLATFORMS.find(p => p.id === id)?.label)
        .filter(Boolean)
      if (labels.length === 0) return base
      return `【目标分发平台：${labels.join('、')}】\n${base}`
    }, [selectedPlatforms])

    const draftContextTokens = useMemo(() => {
      const promptPreview = buildFinalPrompt(inputValue)
      return estimateConversationContextTokens({
        draftText: promptPreview,
        draftMediaCount: medias.length,
      })
    }, [buildFinalPrompt, inputValue, medias.length])

    const doSend = useCallback(() => {
      const currentPrompt = buildFinalPrompt(inputValue)
      if (!currentPrompt && medias.length === 0) return
      const currentMedias = [...medias]
      setIsSubmitting(true)
      setPendingTask({
        prompt: currentPrompt || '请分析我上传的参考素材并给出多平台运营策划方案。',
        medias: currentMedias,
        model: selectedModel,
      })
      router.push('/chat/new')
    }, [buildFinalPrompt, inputValue, medias, router, selectedModel, setPendingTask])

    const handleSend = useCallback(async () => {
      const currentPrompt = buildFinalPrompt(inputValue)
      if (!currentPrompt && medias.length === 0) {
        toast.warning('请输入策划主题、产品卖点或上传参考图')
        return
      }

      if (!token) {
        sessionStorage.setItem(
          'pendingTask',
          JSON.stringify({ prompt: currentPrompt, medias, model: selectedModel }),
        )
        navigateToLogin('/chat/new')
        return
      }

      const creditsBalance = useUserStore.getState().creditsBalance
      if (!isLocalFreeTextModel(selectedModel) && creditsBalance < 50) {
        useAccountStore.getState().setLowBalanceAlertOpen(true)
        return
      }

      doSend()
    }, [token, buildFinalPrompt, inputValue, medias, selectedModel, doSend])

    return (
      <div className={cn('w-full max-w-4xl mx-auto space-y-5', className)} data-testid="ai-planner-home">
        {/* 极简标题区 */}
        <div className="text-center pb-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            一句话策划，多平台分发
          </h1>
        </div>

        {/* 主指令输入框（接入分层文本模型选择器 + 上下文占比镂空圆环）+ 目标平台多选条 */}
        <div>
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            medias={medias}
            onMediasChange={handleMediasChange}
            onMediaRemove={handleMediaRemove}
            onMediaUpdate={handleMediaUpdate}
            isGenerating={isSubmitting}
            isUploading={isUploading}
            placeholder={defaultPlaceholder}
            mode="large"
            rightToolbarExtra={(
              <div className="flex items-center gap-1.5">
                <ContextUsageRing
                  usedTokens={draftContextTokens}
                  totalTokens={contextWindowTokens}
                  testId="planner-context-ring"
                />
                <TextModelPicker
                  value={selectedModel}
                  models={textModelOptions}
                  groups={textModelGroups}
                  onChange={setSelectedModel}
                  variant="pill"
                  minimalTrigger
                  autoCloseOnMouseLeave
                  side="bottom"
                  align="end"
                  testId="planner-text-model"
                />
              </div>
            )}
          />

          <div className="relative -mt-3 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border border-t-0 border-border/80 bg-muted/45 px-4 pb-3 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                适配平台：
              </span>
              {TARGET_PLATFORMS.map((plat) => {
                const active = selectedPlatforms.includes(plat.id)
                return (
                  <button
                    key={plat.id}
                    type="button"
                    data-testid={`planner-platform-${plat.id}`}
                    onClick={() => togglePlatform(plat.id)}
                    title={`${plat.label} · ${plat.hint}`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all cursor-pointer',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                        : 'border-border/80 bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <span>{plat.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={handleAddChannelClick}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5" />
              绑定授权频道
            </button>
          </div>
        </div>
      </div>
    )
  },
)

export default HomeChat
