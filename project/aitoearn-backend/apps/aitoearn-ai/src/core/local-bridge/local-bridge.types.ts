export type LocalAgentEngineName = 'agy' | 'codex'

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

export interface LocalEnginesResponse {
  reachable: boolean
  bridgeUrl: string
  error?: string
  engines: {
    agy?: LocalEngineInfo
    codex?: LocalEngineInfo
    dreamina?: LocalEngineInfo
    ollama?: LocalEngineInfo
  }
}

export interface LocalAgentUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
}

export type LocalAgentBridgeEvent
  = | { type: 'session', sessionId: string }
    | { type: 'text_delta', text: string }
    | { type: 'tool_use', id: string, name: string, input: Record<string, unknown> }
    | { type: 'tool_result', toolUseId: string, name: string, content: string, isError?: boolean }
    | { type: 'usage', usage: LocalAgentUsage }
    | { type: 'result', text: string, sessionId?: string, usage?: LocalAgentUsage, costUsd?: number, isError?: boolean, error?: string }
    | { type: 'error', message: string }

export interface LocalAgentRunRequest {
  runId: string
  engine: LocalAgentEngineName
  model?: string
  prompt: string
  systemPrompt?: string
  sessionId?: string
  imageUrls?: string[]
  mcpUrl: string
  skillsDir?: string
}

export interface DreaminaImageGenerateRequest {
  prompt: string
  modelVersion?: string
  aspectRatio?: string
  resolutionType?: string
  count?: number
  referenceImageUrls?: string[]
}

export interface DreaminaImageGenerateResponse {
  submitId: string
  modelVersion: string
  creditsUsed?: number
  creditsRemaining?: number
  images: Array<{
    b64_json: string
    mimeType: string
    filename?: string
  }>
}

export interface CodexImageGenerateRequest {
  prompt: string
  aspectRatio?: string
  imageSize?: string
  count?: number
  referenceImageUrls?: string[]
}

export interface CodexImageGenerateResponse {
  threadId: string
  modelVersion: string
  creditsUsed?: number
  images: Array<{
    b64_json: string
    mimeType: string
    filename?: string
  }>
}

export interface DreaminaVideoSubmitRequest {
  prompt: string
  modelVersion?: string
  mode?: string
  duration?: number
  resolution?: string
  aspectRatio?: string
  imageUrls?: string[]
  videoUrls?: string[]
  audioUrls?: string[]
}

export interface DreaminaVideoSubmitResponse {
  submitId: string
  status: 'in_progress'
  subcommand: string
  modelVersion: string
  duration: number
  resolution: string
}

export interface DreaminaVideoStatusResponse {
  submitId: string
  status: 'in_progress' | 'completed' | 'failed'
  fileUrl?: string
  remoteUrl?: string
  duration?: number
  creditsUsed?: number
  creditsRemaining?: number
  error?: string
}

export interface StudioModelsHubPayload {
  agent: {
    engine: 'agy' | 'codex' | 'thirdParty'
    model: string
    protocol: 'anthropic' | 'openai' | 'openrouter' | 'deepseek' | 'gemini'
    baseUrl?: string
    apiKey?: string
    backgroundModel?: string
    thinkModel?: string
  }
  chat: {
    engine: 'agy' | 'codex' | 'thirdParty' | 'ollama'
    model: string
    thirdPartyChannel?: 'openai' | 'anthropic' | 'gemini' | 'deepseek'
  }
  planner: {
    engine: 'agy' | 'codex' | 'thirdParty' | 'ollama'
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

export interface ConnectionTestRequest {
  kind: 'agy' | 'codex' | 'dreamina' | 'ollama' | 'thirdParty'
  model?: string
  protocol?: 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'gemini'
  baseUrl?: string
  apiKey?: string
}
