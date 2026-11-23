'use client'

import type { LocalAuthStartResponse, LocalEngineInfo } from '@/api/studio-models'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCodexAuthStatusApi,
  pollDreaminaAuthApi,
  startCodexAuthApi,
  startDreaminaAuthApi,
} from '@/api/studio-models'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/utils/ui/toast'

export type WizardModalState
  = | null
    | { mode: 'dreamina-login', force?: boolean }
    | { mode: 'codex-login' }
    | { mode: 'setup-guide', engine: 'agy' | 'codex' | 'dreamina' | 'ollama' }

interface LocalAuthWizardDialogProps {
  state: WizardModalState
  onClose: () => void
  onAuthSuccess: (kind: 'dreamina' | 'codex', engine?: LocalEngineInfo) => void
  onRefreshEngines: () => void
}

interface GuideStep {
  title: string
  desc: string
  command?: string
  link?: { label: string, href: string }
}

const ENGINE_SETUP_GUIDES: Record<'agy' | 'codex' | 'dreamina' | 'ollama', {
  title: string
  subtitle: string
  steps: GuideStep[]
}> = {
  dreamina: {
    title: '即梦 AI CLI 快速上手指南',
    subtitle: '用于使用即梦积分调用即梦 5.0 生图、图生图与 Seedance 2.0/2.5 生视频',
    steps: [
      {
        title: '1. 安装即梦官方 CLI 工具',
        desc: '如果你还没有安装 dreamina，可以前往即梦官网下载并安装 CLI 到 ~/.local/bin/dreamina。',
        link: { label: '打开即梦官网', href: 'https://jimeng.jianying.com/' },
      },
      {
        title: '2. 回到 Foldframe 一键网页登录（无需终端）',
        desc: '安装完成后点下方「重新检测」，再点「一键网页登录即梦」，在电脑浏览器确认授权即可。',
      },
    ],
  },
  codex: {
    title: 'Codex CLI 快速上手指南',
    subtitle: '使用你的 ChatGPT Plus / Pro 订阅或 OpenAI 账号驱动 Foldframe Agent',
    steps: [
      {
        title: '1. 在 Mac 上安装 Codex（推荐安装 ChatGPT 桌面端或 Homebrew）',
        desc: '复制下方命令到「终端」粘贴并按回车即可安装：',
        command: 'brew install --cask codex',
      },
      {
        title: '2. 回到本页面一键网页登录',
        desc: '装好后点击下方「重新检测」，再点 Codex 卡片上的「一键网页登录 Codex」完成授权即可使用。',
      },
    ],
  },
  agy: {
    title: 'Antigravity CLI (agy) 快速上手指南',
    subtitle: 'Foldframe 默认原生 Agent 引擎，支持 Gemini / Claude 等多模型与 MCP 工具调用',
    steps: [
      {
        title: '1. 安装 Antigravity',
        desc: '安装 Antigravity 应用或 agy CLI（如果你已使用 Orca / Antigravity，Foldframe 会自动扫描并识别）。',
        link: { label: '查看 Antigravity 文档', href: 'https://antigravity.google/docs/cli/reference.md' },
      },
      {
        title: '2. 完成账号登录后点重新检测',
        desc: '登录完成后点击下方「重新检测」，无需填写任何 API Key 即可直接使用。',
      },
    ],
  },
  ollama: {
    title: 'Ollama 本机离线模型指引（可选）',
    subtitle: '完全在本地电脑运行的免费开源大模型，适合离线文案与规划',
    steps: [
      {
        title: '1. 下载并启动 Ollama 客户端',
        desc: '安装后打开 Ollama 应用（顶部菜单栏会出现小羊驼图标）。',
        link: { label: '下载 Ollama', href: 'https://ollama.com/download' },
      },
      {
        title: '2. 拉取一个推荐中文模型',
        desc: '打开终端复制运行下方命令即可下载：',
        command: 'ollama pull qwen2.5:14b',
      },
    ],
  },
}

function CopyableCode({ text, label = '复制' }: { text: string, label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 1800)
    }
    catch {
      toast.error('复制失败，请手动选中复制')
    }
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
      <code className="truncate font-mono text-xs text-foreground">{text}</code>
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => void handleCopy()}>
        {copied ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
        {copied ? '已复制' : label}
      </Button>
    </div>
  )
}

export function LocalAuthWizardDialog({
  state,
  onClose,
  onAuthSuccess,
  onRefreshEngines,
}: LocalAuthWizardDialogProps) {
  const [loading, setLoading] = useState(false)
  const [authData, setAuthData] = useState<LocalAuthStartResponse | null>(null)
  const [pollStatus, setPollStatus] = useState<'idle' | 'pending' | 'authorized' | 'expired' | 'error'>('idle')
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [authorizedEngine, setAuthorizedEngine] = useState<LocalEngineInfo | undefined>()
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onAuthSuccessRef = useRef(onAuthSuccess)
  onAuthSuccessRef.current = onAuthSuccess

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [])

  const startLoginFlow = useCallback(async (mode: 'dreamina-login' | 'codex-login', force = false) => {
    clearTimers()
    setLoading(true)
    setAuthData(null)
    setPollStatus('idle')
    setStatusMessage('正在生成网页授权链接...')
    setAuthorizedEngine(undefined)
    setRemainingSec(null)

    try {
      const res = mode === 'dreamina-login'
        ? await startDreaminaAuthApi(force)
        : await startCodexAuthApi()
      const data = res?.data
      if (!res || res.code !== 0 || !data) {
        throw new Error(res?.message || '无法发起授权流程，请确认本机桥接服务正常运行')
      }
      setAuthData(data)
      if (data.status === 'authorized') {
        setPollStatus('authorized')
        setAuthorizedEngine(data.engine)
        setStatusMessage(data.detail || '登录成功！')
        onAuthSuccessRef.current(mode === 'dreamina-login' ? 'dreamina' : 'codex', data.engine)
        return
      }
      if (!data.ok || data.status !== 'pending' || !data.verificationUri) {
        setPollStatus('error')
        setStatusMessage(data.detail || '生成授权链接失败，请点击重试')
        return
      }

      setPollStatus('pending')
      setStatusMessage(data.detail || '等待在网页点击「确认授权」...')

      if (data.expiresAt) {
        const expMs = Date.parse(data.expiresAt)
        if (!Number.isNaN(expMs)) {
          const updateCountdown = () => {
            const left = Math.max(0, Math.floor((expMs - Date.now()) / 1000))
            setRemainingSec(left)
            if (left <= 0) {
              clearTimers()
              setPollStatus('expired')
              setStatusMessage('授权链接已过期，请点击下方「重新生成授权链接」')
            }
          }
          updateCountdown()
          countdownTimerRef.current = setInterval(updateCountdown, 1000)
        }
      }

      const intervalMs = Math.max(2000, (data.pollIntervalSec || 2) * 1000)
      pollTimerRef.current = setInterval(async () => {
        try {
          const pollRes = mode === 'dreamina-login'
            ? await pollDreaminaAuthApi(data.deviceCode || '')
            : await getCodexAuthStatusApi()
          const pData = pollRes?.data
          if (!pData) return
          if (pData.status === 'authorized') {
            clearTimers()
            setPollStatus('authorized')
            setAuthorizedEngine(pData.engine)
            setStatusMessage(pData.detail || '授权成功！')
            toast.success(mode === 'dreamina-login' ? '即梦登录成功！现在可以直接生图和生视频了' : 'Codex 登录成功！')
            onAuthSuccessRef.current(mode === 'dreamina-login' ? 'dreamina' : 'codex', pData.engine)
          }
          else if (pData.status === 'expired') {
            clearTimers()
            setPollStatus('expired')
            setStatusMessage(pData.detail || '授权已过期，请重新获取')
          }
          else if (pData.status === 'error') {
            setStatusMessage(pData.detail || '正在重试检测...')
          }
        }
        catch {}
      }, intervalMs)
    }
    catch (err) {
      setPollStatus('error')
      setStatusMessage(err instanceof Error ? err.message : String(err))
    }
    finally {
      setLoading(false)
    }
  }, [clearTimers])

  const modalKey = state
    ? (state.mode === 'dreamina-login' ? `dreamina:${Boolean(state.force)}` : state.mode)
    : ''

  useEffect(() => {
    if (!state) {
      clearTimers()
      return
    }
    if (state.mode === 'dreamina-login') {
      void startLoginFlow('dreamina-login', Boolean(state.force))
    }
    else if (state.mode === 'codex-login') {
      void startLoginFlow('codex-login', false)
    }
    return () => clearTimers()
  }, [modalKey, startLoginFlow, clearTimers])

  const openAuthPage = () => {
    if (!authData?.verificationUri) return
    window.open(authData.verificationUri, '_blank', 'noopener,noreferrer')
  }

  const copyUserCode = async () => {
    if (!authData?.userCode) return
    try {
      await navigator.clipboard.writeText(authData.userCode)
      setCopiedCode(true)
      toast.success('已复制验证码')
      setTimeout(() => setCopiedCode(false), 1800)
    }
    catch {}
  }

  if (!state) return null

  if (state.mode === 'setup-guide') {
    const guide = ENGINE_SETUP_GUIDES[state.engine]
    return (
      <Dialog open onOpenChange={open => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-5 w-5 text-primary" />
              {guide.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {guide.subtitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {guide.steps.map(step => (
              <div key={step.title} className="space-y-2 rounded-xl border border-border bg-muted/30 p-3.5">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
                {step.command && <CopyableCode text={step.command} label="复制命令" />}
                {step.link && (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" asChild>
                    <a href={step.link.href} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      {step.link.label}
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              关闭
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onClose()
                onRefreshEngines()
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              我已装好，重新检测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  const isDreamina = state.mode === 'dreamina-login'
  const minutes = remainingSec != null ? Math.floor(remainingSec / 60) : null
  const seconds = remainingSec != null ? remainingSec % 60 : null

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            {isDreamina ? '一键网页登录即梦 AI（无需终端）' : '一键网页登录 Codex（无需终端）'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isDreamina
              ? '点下方按钮在电脑浏览器打开即梦官方授权页，确认后本页会自动完成登录。'
              : '打开 OpenAI 授权页面并填入验证码即可完成登录，全程无需敲命令行。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span>正在获取官方安全授权链接...</span>
            </div>
          )}

          {!loading && pollStatus === 'authorized' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-7 text-center">
              <CheckCircle2 className="h-11 w-11 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  {isDreamina ? '即梦账号登录成功！' : 'Codex 登录成功！'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {statusMessage}
                </p>
                {isDreamina && authorizedEngine?.credits != null && (
                  <Badge variant="outline" className="mt-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    当前剩余积分：{authorizedEngine.credits}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                现在可以直接回到工作台生成图片、Seedance 视频或使用 Agent 创作了。
              </p>
            </div>
          )}

          {!loading && (pollStatus === 'error' || pollStatus === 'expired') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{pollStatus === 'expired' ? '授权链接已过期' : '获取授权失败'}</AlertTitle>
              <AlertDescription className="mt-1 text-xs">
                {statusMessage}
              </AlertDescription>
            </Alert>
          )}

          {!loading && pollStatus === 'pending' && authData?.verificationUri && (
            <>
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
                    <p className="leading-5 text-foreground">
                      {isDreamina
                        ? '点击下方按钮在当前电脑浏览器打开即梦授权页（已自动带好授权码，无需手动输入）。'
                        : '先复制下方验证码，再点击按钮打开 OpenAI 授权页面粘贴确认。'}
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">2</span>
                    <p className="leading-5 text-foreground">
                      {isDreamina
                        ? '若电脑浏览器已登录即梦，直接点「确认授权」即可；若未登录，点登录框下方的抖音 / 剪映图标用手机扫码登录后再确认。'
                        : '在页面中点击确认授权，然后切回此窗口即可。'}
                    </p>
                  </div>
                </div>

                {!isDreamina && authData.userCode && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground">一次性授权验证码</p>
                      <p className="font-mono text-base font-bold tracking-widest text-primary">{authData.userCode}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => void copyUserCode()}>
                      {copiedCode ? <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                      {copiedCode ? '已复制' : '复制码'}
                    </Button>
                  </div>
                )}

                <Button type="button" size="default" className="w-full" onClick={openAuthPage}>
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  {isDreamina ? '在电脑浏览器打开即梦授权页' : '打开 OpenAI 授权页'}
                </Button>
              </div>

              {/* Live auto-polling bar */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>等待网页确认授权，确认后自动完成...</span>
                </div>
                {minutes != null && seconds != null && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    剩余 {minutes}:{String(seconds).padStart(2, '0')}
                  </span>
                )}
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">
                  浏览器拦截了新标签页？点此复制授权链接手动打开
                </summary>
                <div className="mt-2">
                  <CopyableCode text={authData.verificationUri} label="复制链接" />
                </div>
              </details>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {pollStatus !== 'authorized' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void startLoginFlow(state.mode, true)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              重新生成链接
            </Button>
          )}
          <Button type="button" variant={pollStatus === 'authorized' ? 'default' : 'outline'} size="sm" onClick={onClose}>
            {pollStatus === 'authorized' ? '完成，开始创作' : '先关闭'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
