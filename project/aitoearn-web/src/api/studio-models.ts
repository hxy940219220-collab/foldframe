import http from '@/utils/request'

export interface LocalEngineInfo {
  id: string
  name: string
  installed: boolean
  running?: boolean
  loggedIn?: boolean
  accountLabel?: string
  effectiveDefaultModel?: string
  autoFallbackNotice?: string
  path?: string | null
  version?: string | null
  credits?: number | string | null
  models?: string[]
  imageModels?: string[]
  videoModels?: string[]
  baseUrl?: string
  installHint?: string
  loginHint?: string
}

export interface LocalAuthStartResponse {
  ok: boolean
  status: 'pending' | 'authorized' | 'not_installed' | 'error'
  verificationUri?: string
  userCode?: string
  deviceCode?: string
  pollIntervalSec?: number
  expiresAt?: string
  detail: string
  engine?: LocalEngineInfo
}

export interface LocalAuthPollResponse {
  ok: boolean
  status: 'pending' | 'authorized' | 'expired' | 'not_installed' | 'error'
  detail: string
  engine?: LocalEngineInfo
}

export interface StudioModelsHubConfig {
  agent: {
    engine: 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty'
    model: string
    protocol: 'anthropic' | 'openai' | 'openrouter' | 'deepseek' | 'gemini'
    baseUrl?: string
    apiKey?: string
    backgroundModel?: string
    thinkModel?: string
  }
  chat: {
    engine: 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty'
    model: string
    thirdPartyChannel?: 'openai' | 'anthropic' | 'gemini' | 'deepseek'
  }
  planner: {
    engine: 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty'
    model: string
    thirdPartyChannel?: 'openai' | 'gemini' | 'deepseek' | 'anthropic'
  }
  image: {
    engine: 'dreamina' | 'codex' | 'openai' | 'gemini'
    model: string
    resolution: '1k' | '2k' | '4k'
  }
  video: {
    engine: 'dreamina' | 'volcengine' | 'dashscope' | 'grok' | 'openai' | 'relay'
    model: string
  }
  providers: {
    openai: { baseUrl: string, apiKey: string }
    anthropic: { baseUrl: string, apiKey: string }
    gemini: { baseUrl: string, apiKey: string }
    grok: { baseUrl: string, apiKey: string }
    dashscope: { baseUrl: string, apiKey: string }
    volcengine: { baseUrl: string, apiKey: string }
    relay: { url: string, apiKey: string }
  }
}

export interface StudioModelsHubResponse {
  bridge: {
    reachable: boolean
    bridgeUrl: string
    error?: string
    engines: {
      agy?: LocalEngineInfo
      codex?: LocalEngineInfo
      dreamina?: LocalEngineInfo
      grok?: LocalEngineInfo
      workbuddy?: LocalEngineInfo
    }
  }
  config: StudioModelsHubConfig
  catalog: {
    chatModels: Array<{ name: string, description: string, channel: string, scenes: string[] }>
    imageModels: Array<{ model: string, displayName: string }>
    videoModels: Array<{ name: string, description: string, channel: string }>
  }
}

export interface ConnectionTestRequest {
  kind: 'agy' | 'codex' | 'dreamina' | 'grok' | 'workbuddy' | 'thirdParty'
  model?: string
  protocol?: 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'gemini'
  baseUrl?: string
  apiKey?: string
}

export interface ConnectionTestResult {
  ok: boolean
  latencyMs: number
  detail: string
  reply?: string
  data?: unknown
}

export function getStudioModelsHubApi() {
  return http.get<StudioModelsHubResponse>('ai/studio/models-hub', undefined, true)
}

export function saveStudioModelsHubApi(data: StudioModelsHubConfig) {
  return http.put<StudioModelsHubResponse>('ai/studio/models-hub', data, true)
}

export function testStudioModelConnectionApi(data: ConnectionTestRequest) {
  return http.post<ConnectionTestResult>('ai/studio/test', data, true)
}

export function startDreaminaAuthApi(force = false) {
  return http.post<LocalAuthStartResponse>('ai/studio/auth/dreamina/start', { force }, true)
}

export function pollDreaminaAuthApi(deviceCode: string) {
  return http.post<LocalAuthPollResponse>('ai/studio/auth/dreamina/poll', { deviceCode }, true)
}

export function logoutDreaminaAuthApi() {
  return http.post<{ ok: boolean, detail: string, engine?: LocalEngineInfo }>('ai/studio/auth/dreamina/logout', {}, true)
}

export function startCodexAuthApi() {
  return http.post<LocalAuthStartResponse>('ai/studio/auth/codex/start', {}, true)
}

export function getCodexAuthStatusApi() {
  return http.get<LocalAuthPollResponse>('ai/studio/auth/codex/status', undefined, true)
}

export function startGrokAuthApi() {
  return http.post<LocalAuthStartResponse>('ai/studio/auth/grok/start', {}, true)
}

export function getGrokAuthStatusApi() {
  return http.get<LocalAuthPollResponse>('ai/studio/auth/grok/status', undefined, true)
}

export function logoutGrokAuthApi() {
  return http.post<{ ok: boolean, detail: string, engine?: LocalEngineInfo }>('ai/studio/auth/grok/logout', {}, true)
}

export function startWorkBuddyAuthApi(methodId: 'internal' | 'external' = 'internal') {
  return http.post<LocalAuthStartResponse>('ai/studio/auth/workbuddy/start', { methodId }, true)
}

export function getWorkBuddyAuthStatusApi() {
  return http.get<LocalAuthPollResponse>('ai/studio/auth/workbuddy/status', undefined, true)
}

export function logoutWorkBuddyAuthApi() {
  return http.post<{ ok: boolean, detail: string, engine?: LocalEngineInfo }>('ai/studio/auth/workbuddy/logout', {}, true)
}
