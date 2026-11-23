import type {
  CodexImageGenerateRequest,
  CodexImageGenerateResponse,
  ConnectionTestRequest,
  DreaminaImageGenerateRequest,
  DreaminaImageGenerateResponse,
  DreaminaVideoStatusResponse,
  DreaminaVideoSubmitRequest,
  DreaminaVideoSubmitResponse,
  LocalAgentBridgeEvent,
  LocalAgentRunRequest,
  LocalAuthPollResponse,
  LocalAuthStartResponse,
  LocalEngineInfo,
  LocalEnginesResponse,
} from './local-bridge.types'
import { Injectable, Logger } from '@nestjs/common'
import { config } from '../../config'

export function isLocalBridgeChatModel(model?: string): boolean {
  if (!model) return false
  return /^(?:agy|codex|ollama)(?:[:/]|$)/i.test(model.trim())
}

export function isDreaminaModelName(model?: string): boolean {
  if (!model) return false
  return /^dreamina[-_:/]/i.test(model.trim())
}

export function isCodexImageModelName(model?: string): boolean {
  if (!model) return false
  return /^codex[-_:/](?:gpt-)?image/i.test(model.trim())
}

@Injectable()
export class LocalBridgeService {
  private readonly logger = new Logger(LocalBridgeService.name)

  getBridgeUrl(): string {
    const raw = process.env['LOCAL_BRIDGE_URL'] || config.localBridge?.url || 'http://host.docker.internal:18787'
    return raw.replace(/\/+$/, '')
  }

  getBridgeToken(): string {
    return (process.env['LOCAL_BRIDGE_TOKEN'] || config.localBridge?.token || '').trim()
  }

  getPublicOrigin(): string {
    const raw = process.env['LOCAL_PUBLIC_ORIGIN'] || config.localBridge?.publicOrigin || 'http://127.0.0.1:8080'
    return raw.replace(/\/+$/, '')
  }

  getHostSkillsDir(): string | undefined {
    const dir = (process.env['FOLDFRAME_HOST_SKILLS_DIR'] || config.localBridge?.skillsDir || '').trim()
    return dir || undefined
  }

  getOpenAIBaseUrl(): string {
    return `${this.getBridgeUrl()}/v1`
  }

  isConfigured(): boolean {
    return Boolean(this.getBridgeUrl() && this.getBridgeToken())
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const token = this.getBridgeToken()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    }
  }

  private async requestJson<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
    const url = `${this.getBridgeUrl()}${path}`
    const timeoutMs = init?.timeoutMs ?? 60000
    const res = await fetch(url, {
      ...init,
      headers: this.authHeaders(init?.headers as Record<string, string> | undefined),
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    })

    const text = await res.text()
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = text ? JSON.parse(text) as Record<string, unknown> : null
    }
    catch {
      parsed = null
    }

    if (!res.ok) {
      const errorObj = parsed?.['error'] as { message?: string } | string | undefined
      const errMsg = typeof errorObj === 'string'
        ? errorObj
        : errorObj?.message || (parsed?.['message'] as string) || text.slice(0, 300) || `HTTP ${res.status}`
      throw new Error(`LocalBridge ${path} failed (${res.status}): ${errMsg}`)
    }

    return parsed as T
  }

  async getEngines(): Promise<LocalEnginesResponse> {
    const bridgeUrl = this.getBridgeUrl()
    if (!this.getBridgeToken()) {
      return {
        reachable: false,
        bridgeUrl,
        error: '未配置 LOCAL_BRIDGE_TOKEN，请使用 ./启动本地版.command 启动本机桥接服务。',
        engines: {},
      }
    }
    try {
      const data = await this.requestJson<{ ok: boolean, engines: LocalEnginesResponse['engines'] }>('/v1/engines', {
        method: 'GET',
        timeoutMs: 20000,
      })
      return {
        reachable: true,
        bridgeUrl,
        engines: data.engines || {},
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Host local bridge unreachable at ${bridgeUrl}: ${message}`)
      return {
        reachable: false,
        bridgeUrl,
        error: `无法连接宿主机桥接服务（${bridgeUrl}）：${message}`,
        engines: {},
      }
    }
  }

  async testConnection(payload: ConnectionTestRequest): Promise<{
    ok: boolean
    latencyMs: number
    detail: string
    reply?: string
    data?: unknown
  }> {
    if (payload.kind !== 'thirdParty') {
      return await this.requestJson('/v1/test', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: 90000,
      })
    }

    const startedAt = Date.now()
    const protocol = payload.protocol || 'openai'
    const baseUrl = (payload.baseUrl || '').trim().replace(/\/+$/, '')
    const apiKey = (payload.apiKey || '').trim()
    const model = (payload.model || '').trim()

    if (!baseUrl || !apiKey) {
      return { ok: false, latencyMs: 0, detail: '请填写接口地址（Base URL）和 API Key。' }
    }

    try {
      if (protocol === 'anthropic') {
        const endpoint = baseUrl.endsWith('/messages')
          ? baseUrl
          : baseUrl.endsWith('/v1')
            ? `${baseUrl}/messages`
            : `${baseUrl}/v1/messages`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-6',
            max_tokens: 16,
            messages: [{ role: 'user', content: 'Reply OK' }],
          }),
          signal: AbortSignal.timeout(25000),
        })
        const text = await res.text()
        if (!res.ok) {
          return { ok: false, latencyMs: Date.now() - startedAt, detail: `HTTP ${res.status}: ${text.slice(0, 220)}` }
        }
        return { ok: true, latencyMs: Date.now() - startedAt, detail: `Anthropic 协议连通正常（${Date.now() - startedAt}ms）` }
      }

      if (protocol === 'gemini') {
        const targetModel = model || 'gemini-2.5-flash'
        const normalizedBase = baseUrl.endsWith('/v1beta') ? baseUrl : `${baseUrl}/v1beta`
        const endpoint = `${normalizedBase}/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(apiKey)}`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply OK' }] }],
          }),
          signal: AbortSignal.timeout(25000),
        })
        const text = await res.text()
        if (!res.ok) {
          return { ok: false, latencyMs: Date.now() - startedAt, detail: `HTTP ${res.status}: ${text.slice(0, 220)}` }
        }
        return { ok: true, latencyMs: Date.now() - startedAt, detail: `Gemini 协议连通正常（${Date.now() - startedAt}ms）` }
      }

      // OpenAI / DeepSeek / OpenRouter compatible
      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
        signal: AbortSignal.timeout(25000),
      })
      const text = await res.text()
      if (!res.ok) {
        return { ok: false, latencyMs: Date.now() - startedAt, detail: `HTTP ${res.status}: ${text.slice(0, 220)}` }
      }
      return { ok: true, latencyMs: Date.now() - startedAt, detail: `OpenAI 兼容接口连通正常（${Date.now() - startedAt}ms）` }
    }
    catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        detail: `连接异常：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  async dreaminaGenerateImage(params: DreaminaImageGenerateRequest): Promise<DreaminaImageGenerateResponse> {
    return await this.requestJson<DreaminaImageGenerateResponse>('/v1/dreamina/images/generate', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 300000,
    })
  }

  async codexGenerateImage(params: CodexImageGenerateRequest): Promise<CodexImageGenerateResponse> {
    return await this.requestJson<CodexImageGenerateResponse>('/v1/codex/images/generate', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 360000,
    })
  }

  async dreaminaSubmitVideo(params: DreaminaVideoSubmitRequest): Promise<DreaminaVideoSubmitResponse> {
    return await this.requestJson<DreaminaVideoSubmitResponse>('/v1/dreamina/videos/submit', {
      method: 'POST',
      body: JSON.stringify(params),
      timeoutMs: 120000,
    })
  }

  async dreaminaGetVideoStatus(submitId: string): Promise<DreaminaVideoStatusResponse> {
    return await this.requestJson<DreaminaVideoStatusResponse>(
      `/v1/dreamina/videos/${encodeURIComponent(submitId)}`,
      { method: 'GET', timeoutMs: 70000 },
    )
  }

  async dreaminaDownloadFile(fileUrl: string): Promise<{ buffer: Buffer, mimeType: string }> {
    const targetUrl = fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
      ? fileUrl
      : `${this.getBridgeUrl()}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`
    const headers = targetUrl.startsWith(this.getBridgeUrl())
      ? this.authHeaders()
      : {}
    const res = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(180000),
    })
    if (!res.ok) {
      throw new Error(`Failed to download Dreamina output (${res.status})`)
    }
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type') || 'video/mp4',
    }
  }

  async *streamLocalAgentRun(
    params: LocalAgentRunRequest,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LocalAgentBridgeEvent, void> {
    const url = `${this.getBridgeUrl()}/v1/agent/runs`
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders({ Accept: 'text/event-stream' }),
      body: JSON.stringify({
        ...params,
        skillsDir: params.skillsDir || this.getHostSkillsDir(),
      }),
      signal: abortSignal,
    })

    if (!res.ok) {
      const text = await res.text()
      let msg = text.slice(0, 400)
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } }
        if (parsed?.error?.message) msg = parsed.error.message
      }
      catch {}
      throw new Error(msg || `Local bridge agent failed (${res.status})`)
    }

    if (!res.body) {
      throw new Error('Local bridge returned empty stream')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() || ''

        for (const frame of parts) {
          for (const line of frame.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
              yield JSON.parse(payload) as LocalAgentBridgeEvent
            }
            catch {
              // ignore malformed keepalive frame
            }
          }
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }

  async abortLocalAgentRun(runId: string): Promise<void> {
    try {
      await this.requestJson(`/v1/agent/runs/${encodeURIComponent(runId)}/abort`, {
        method: 'POST',
        timeoutMs: 5000,
      })
    }
    catch (error) {
      this.logger.warn(`Failed to abort local bridge run ${runId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async startDreaminaAuth(force = false): Promise<LocalAuthStartResponse> {
    return await this.requestJson<LocalAuthStartResponse>('/v1/dreamina/auth/start', {
      method: 'POST',
      body: JSON.stringify({ force }),
      timeoutMs: 25000,
    })
  }

  async pollDreaminaAuth(deviceCode: string): Promise<LocalAuthPollResponse> {
    return await this.requestJson<LocalAuthPollResponse>('/v1/dreamina/auth/poll', {
      method: 'POST',
      body: JSON.stringify({ deviceCode }),
      timeoutMs: 15000,
    })
  }

  async logoutDreaminaAuth(): Promise<{ ok: boolean, detail: string, engine?: LocalEngineInfo }> {
    return await this.requestJson('/v1/dreamina/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 15000,
    })
  }

  async startCodexAuth(): Promise<LocalAuthStartResponse> {
    return await this.requestJson<LocalAuthStartResponse>('/v1/codex/auth/start', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 15000,
    })
  }

  async getCodexAuthStatus(): Promise<LocalAuthPollResponse> {
    return await this.requestJson<LocalAuthPollResponse>('/v1/codex/auth/status', {
      method: 'GET',
      timeoutMs: 10000,
    })
  }
}
