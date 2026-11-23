import type { StudioModelsHubPayload } from './local-bridge.types'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { AiLogChannel } from '@yikart/mongodb'
import yaml from 'js-yaml'
import { appConfigSchema, config, reloadRuntimeConfig } from '../../config'
import { LocalBridgeService } from './local-bridge.service'

const DREAMINA_DEFAULT_IMAGE_MODELS = [
  {
    model: 'dreamina-5.0',
    displayName: '即梦 5.0 Lite (CLI)',
    runtimeModel: '5.0',
    queuePriority: 1,
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
    maxInputImages: 10,
    pricing: [{ resolution: '2K' }, { resolution: '4K' }],
  },
  {
    model: 'dreamina-5.0-pro',
    displayName: '即梦 5.0 Pro (CLI)',
    runtimeModel: '5.0Pro',
    queuePriority: 1,
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
    maxInputImages: 10,
    pricing: [{ resolution: '1K' }, { resolution: '2K' }, { resolution: '4K' }],
  },
  {
    model: 'codex-gpt-image-2',
    displayName: 'GPT Image 2 (本机 Codex)',
    runtimeModel: 'codex-gpt-image-2',
    queuePriority: 1,
    tags: [{ 'en-US': 'Codex CLI', 'zh-CN': 'ChatGPT 账号 · 免 API' }],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
    maxInputImages: 6,
    pricing: [{ resolution: '1K' }, { resolution: '2K' }, { resolution: '4K' }],
  },
  {
    model: 'dreamina-4.7',
    displayName: '即梦 4.7 (CLI)',
    runtimeModel: '4.7',
    queuePriority: 1,
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
    maxInputImages: 10,
    pricing: [{ resolution: '2K' }, { resolution: '4K' }],
  },
  {
    model: 'dreamina-4.5',
    displayName: '即梦 4.5 (CLI)',
    runtimeModel: '4.5',
    queuePriority: 1,
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'],
    maxInputImages: 10,
    pricing: [{ resolution: '2K' }, { resolution: '4K' }],
  },
]

const DREAMINA_DEFAULT_VIDEO_MODELS = [
  {
    name: 'dreamina-seedance-2.0-fast',
    description: '即梦 Seedance 2.0 Fast (CLI)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    name: 'dreamina-seedance-2.0',
    description: '即梦 Seedance 2.0 (CLI)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    name: 'dreamina-seedance-2.0-fast-vip',
    description: '即梦 Seedance 2.0 Fast VIP (CLI)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦 VIP' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    name: 'dreamina-seedance-2.0-vip',
    description: '即梦 Seedance 2.0 VIP (CLI · 4K)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦 VIP' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['720p', '1080p', '4k'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    name: 'dreamina-seedance-2.5',
    description: '即梦 Seedance 2.5 VIP (CLI · 1080p/30s)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦 VIP' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['480p', '720p', '1080p'],
    durations: [4, 5, 6, 8, 10, 12, 15, 20, 30],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
  {
    name: 'dreamina-seedance-2.0-mini',
    description: '即梦 Seedance 2.0 Mini (CLI)',
    tags: [{ 'en-US': 'Local CLI', 'zh-CN': '本机即梦' }],
    channel: AiLogChannel.Relay,
    retry: 0,
    modes: ['text2video', 'image2video', 'flf2video', 'multi-image2video', 'multi-ref'] as const,
    resolutions: ['720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    maxInputImages: 9,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaults: { resolution: '720p', aspectRatio: '16:9', duration: 5 },
  },
]

const STANDARD_IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536', '1920x1920', '2560x1440', '1440x2560']

@Injectable()
export class StudioModelsService implements OnModuleInit {
  private readonly logger = new Logger(StudioModelsService.name)

  constructor(private readonly localBridgeService: LocalBridgeService) {}

  onModuleInit() {
    try {
      this.bootstrapLocalCatalogAndDefaults()
    }
    catch (error) {
      this.logger.warn(`Skipped local model catalog bootstrap: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private bootstrapLocalCatalogAndDefaults() {
    const raw = this.readRawConfig()
    let dirty = false

    const hasChat = (name: string) => Array.isArray(raw.ai?.models?.chat) && raw.ai.models.chat.some((m: any) => m.name === name)
    if (!hasChat('agy:default') || !hasChat('codex:default') || !hasChat('grok:default') || !hasChat('workbuddy:default')) {
      this.ensureChatModelEntry(raw.ai.models.chat, 'workbuddy:default', 'WorkBuddy (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
      this.ensureChatModelEntry(raw.ai.models.chat, 'grok:default', 'Grok CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
      this.ensureChatModelEntry(raw.ai.models.chat, 'codex:default', 'Codex CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
      this.ensureChatModelEntry(raw.ai.models.chat, 'agy:default', 'Antigravity CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
      dirty = true
    }

    // Migrate away from removed ollama entries if present in existing config.yaml
    if (Array.isArray(raw.ai?.models?.chat)) {
      const beforeLen = raw.ai.models.chat.length
      raw.ai.models.chat = raw.ai.models.chat.filter((m: any) => !/^ollama[:/]/i.test(String(m?.name || '')))
      if (raw.ai.models.chat.length !== beforeLen) dirty = true
    }
    if (raw.studio?.chat?.engine === 'ollama') {
      raw.studio.chat = { engine: 'agy', model: 'agy:default' }
      dirty = true
    }
    if (raw.studio?.planner?.engine === 'ollama') {
      raw.studio.planner = { engine: 'agy', model: 'agy:default' }
      raw.ai.draftGeneration.planner.defaultModel = 'agy:default'
      dirty = true
    }

    const catalogChanged = this.ensureDreaminaCatalog(
      raw,
      raw.studio?.image?.model || 'dreamina-5.0',
      raw.studio?.video?.model || 'dreamina-seedance-2.0-fast',
    )
    if (catalogChanged) {
      dirty = true
    }

    const hasAnyExternalKey = Boolean(
      raw.ai?.openai?.apiKey
      || raw.ai?.anthropic?.apiKey
      || raw.ai?.gemini?.apiKey
      || raw.ai?.relay?.apiKey
      || (raw.agent?.apiKey && raw.agent.apiKey !== 'sk-placeholder'),
    )

    if (!raw.studio && !hasAnyExternalKey) {
      raw.agent = raw.agent || {}
      raw.agent.engine = 'agy'
      raw.agent.protocol = raw.agent.protocol || 'anthropic'
      raw.agent.localModel = 'default'
      const models = new Set<string>(Array.isArray(raw.agent.models) ? raw.agent.models : [])
      models.add('agy:default')
      models.add('codex:default')
      raw.agent.models = [...models]
      raw.agent.defaultModel = 'agy:default'
      raw.agent.backgroundModel = 'agy:default'
      raw.agent.thinkModel = 'agy:default'
      raw.ai.draftGeneration.planner.defaultModel = 'agy:default'
      raw.studio = {
        agent: { engine: 'agy', model: 'agy:default', protocol: 'anthropic' },
        chat: { engine: 'agy', model: 'agy:default' },
        planner: { engine: 'agy', model: 'agy:default' },
        image: { engine: 'dreamina', model: 'dreamina-5.0', resolution: '2k' },
        video: { engine: 'dreamina', model: 'dreamina-seedance-2.0-fast' },
      }
      dirty = true
    }

    if (dirty) {
      this.writeRawConfig(raw)
      this.logger.log('Bootstrapped local agy/codex/dreamina catalog in config.yaml')
    }
  }

  private resolveConfigFilePath(): string {
    const candidates = [
      process.env['CONFIG_PATH'],
      resolve(process.cwd(), 'config.yaml'),
      resolve(process.cwd(), 'apps/aitoearn-ai/config/config.yaml'),
    ].filter((p): p is string => Boolean(p))
    const found = candidates.find(p => existsSync(p))
    if (!found) {
      throw new BadRequestException('未找到 AI 服务配置文件 config.yaml')
    }
    return found
  }

  private readRawConfig(): Record<string, any> {
    const filePath = this.resolveConfigFilePath()
    const parsed = yaml.load(readFileSync(filePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('config.yaml 内容无效')
    }
    return parsed as Record<string, any>
  }

  private writeRawConfig(nextRaw: Record<string, any>): void {
    const parsed = appConfigSchema.safeParse(nextRaw)
    if (!parsed.success) {
      throw new BadRequestException(`配置校验失败：${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    }
    const filePath = this.resolveConfigFilePath()
    writeFileSync(filePath, yaml.dump(nextRaw, { lineWidth: 120, noRefs: true }), 'utf8')
    reloadRuntimeConfig(parsed.data)
    this.logger.log('Updated config.yaml and hot-reloaded runtime AI configuration')
  }

  private inferChatEngine(modelName: string): 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty' {
    if (/^agy(?:[:/]|$)/i.test(modelName)) return 'agy'
    if (/^codex(?:[:/]|$)/i.test(modelName)) return 'codex'
    if (/^grok(?:[:/]|$)/i.test(modelName)) return 'grok'
    if (/^workbuddy(?:[:/]|$)/i.test(modelName)) return 'workbuddy'
    return 'thirdParty'
  }

  async getHubState() {
    const bridge = await this.localBridgeService.getEngines()
    const currentAgentEngine = config.studio?.agent?.engine
      || (config.agent.engine === 'agy' || config.agent.engine === 'codex' || config.agent.engine === 'grok' || config.agent.engine === 'workbuddy'
        ? config.agent.engine
        : 'thirdParty')
    const plannerModel = config.studio?.planner?.model || config.ai.draftGeneration.planner.defaultModel
    const chatModel = config.studio?.chat?.model || config.ai.models.chat[0]?.name || plannerModel
    const imageModel = config.studio?.image?.model || config.ai.draftGeneration.imageModels[0]?.model || 'dreamina-5.0'
    const videoModel = config.studio?.video?.model || config.ai.models.video.generation[0]?.name || 'dreamina-seedance-2.0-fast'

    const payload: StudioModelsHubPayload = {
      agent: {
        engine: currentAgentEngine,
        model: config.studio?.agent?.model || (currentAgentEngine === 'thirdParty' ? config.agent.defaultModel : `${currentAgentEngine}:${config.agent.localModel || 'default'}`),
        protocol: config.studio?.agent?.protocol || config.agent.protocol || 'anthropic',
        baseUrl: config.agent.baseUrl || '',
        apiKey: config.agent.apiKey === 'sk-placeholder' ? '' : (config.agent.apiKey || ''),
        backgroundModel: config.agent.backgroundModel,
        thinkModel: config.agent.thinkModel,
      },
      chat: {
        engine: config.studio?.chat?.engine || this.inferChatEngine(chatModel),
        model: chatModel,
        thirdPartyChannel: this.findChatChannel(chatModel),
      },
      planner: {
        engine: config.studio?.planner?.engine || this.inferChatEngine(plannerModel),
        model: plannerModel,
        thirdPartyChannel: this.findChatChannel(plannerModel),
      },
      image: {
        engine: config.studio?.image?.engine
          || (imageModel.startsWith('dreamina-') ? 'dreamina' : imageModel.startsWith('codex-') ? 'codex' : imageModel.startsWith('gemini-') ? 'gemini' : 'openai'),
        model: imageModel,
        resolution: config.studio?.image?.resolution || '2k',
      },
      video: {
        engine: config.studio?.video?.engine || (videoModel.startsWith('dreamina-') ? 'dreamina' : 'relay'),
        model: videoModel,
      },
      providers: {
        openai: { baseUrl: config.ai.openai.baseUrl || '', apiKey: config.ai.openai.apiKey || '' },
        anthropic: { baseUrl: config.ai.anthropic.baseUrl || '', apiKey: config.ai.anthropic.apiKey || '' },
        gemini: { baseUrl: config.ai.gemini.baseUrl || '', apiKey: config.ai.gemini.apiKey || '' },
        grok: { baseUrl: config.ai.grok.baseUrl || '', apiKey: config.ai.grok.apiKey || '' },
        dashscope: { baseUrl: config.ai.dashscope.baseUrl || '', apiKey: config.ai.dashscope.apiKey || '' },
        volcengine: { baseUrl: config.ai.volcengine.baseUrl || '', apiKey: config.ai.volcengine.apiKey || '' },
        relay: { url: config.ai.relay?.url || '', apiKey: config.ai.relay?.apiKey || '' },
      },
    }

    return {
      bridge,
      config: payload,
      catalog: {
        chatModels: config.ai.models.chat.map(m => ({ name: m.name, description: m.description, channel: m.channel, scenes: m.scenes || [] })),
        imageModels: config.ai.draftGeneration.imageModels.map(m => ({ model: m.model, displayName: m.displayName })),
        videoModels: config.ai.models.video.generation.map(m => ({ name: m.name, description: m.description, channel: m.channel })),
      },
    }
  }

  private findChatChannel(modelName: string): 'openai' | 'anthropic' | 'gemini' | 'deepseek' {
    const found = config.ai.models.chat.find(m => m.name === modelName)
    if (found?.channel === AiLogChannel.Anthropic) return 'anthropic'
    if (found?.channel === AiLogChannel.Gemini) return 'gemini'
    if (found?.channel === AiLogChannel.DeepSeek) return 'deepseek'
    return 'openai'
  }

  private ensureChatModelEntry(
    chatList: Array<Record<string, any>>,
    modelName: string,
    description: string,
    channel: AiLogChannel,
    scenes: string[],
  ) {
    const existing = chatList.find(item => item.name === modelName)
    if (existing) {
      existing.channel = channel
      const mergedScenes = new Set([...(existing.scenes || []), ...scenes])
      existing.scenes = [...mergedScenes]
      return
    }
    chatList.unshift({
      name: modelName,
      description,
      tags: [],
      channel,
      scenes,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
    })
  }

  private ensureDreaminaCatalog(raw: Record<string, any>, preferredImageModel?: string, preferredVideoModel?: string): boolean {
    let changed = false
    raw.ai.draftGeneration.imageModels = raw.ai.draftGeneration.imageModels || []
    raw.ai.models.image.generation = raw.ai.models.image.generation || []
    raw.ai.models.image.edit = raw.ai.models.image.edit || []
    raw.ai.models.video.generation = raw.ai.models.video.generation || []

    for (const dm of [...DREAMINA_DEFAULT_IMAGE_MODELS].reverse()) {
      const existingDraft = raw.ai.draftGeneration.imageModels.find((item: any) => item.model === dm.model)
      if (!existingDraft) {
        raw.ai.draftGeneration.imageModels.unshift({ ...dm })
        changed = true
      }
      else if (existingDraft.displayName !== dm.displayName) {
        existingDraft.displayName = dm.displayName
        existingDraft.tags = dm.tags
        existingDraft.pricing = dm.pricing
        changed = true
      }

      const existingGen = raw.ai.models.image.generation.find((item: any) => item.name === dm.model)
      if (!existingGen) {
        raw.ai.models.image.generation.unshift({
          name: dm.model,
          description: dm.displayName,
          tags: dm.tags,
          runtimeModel: dm.runtimeModel,
          retry: 0,
          sizes: STANDARD_IMAGE_SIZES,
          qualities: ['auto', 'high'],
          styles: [],
        })
        changed = true
      }
      else if (existingGen.description !== dm.displayName) {
        existingGen.description = dm.displayName
        existingGen.tags = dm.tags
        changed = true
      }

      const existingEdit = raw.ai.models.image.edit.find((item: any) => item.name === dm.model)
      if (!existingEdit) {
        raw.ai.models.image.edit.unshift({
          name: dm.model,
          description: dm.displayName,
          tags: dm.tags,
          runtimeModel: dm.runtimeModel,
          retry: 0,
          sizes: STANDARD_IMAGE_SIZES,
          maxInputImages: dm.maxInputImages,
        })
        changed = true
      }
      else if (existingEdit.description !== dm.displayName) {
        existingEdit.description = dm.displayName
        existingEdit.tags = dm.tags
        changed = true
      }
    }

    if (preferredImageModel && (preferredImageModel.startsWith('dreamina-') || preferredImageModel.startsWith('codex-'))) {
      const idx = raw.ai.draftGeneration.imageModels.findIndex((item: any) => item.model === preferredImageModel)
      if (idx > 0) {
        const [picked] = raw.ai.draftGeneration.imageModels.splice(idx, 1)
        raw.ai.draftGeneration.imageModels.unshift(picked)
        changed = true
      }
    }

    for (const vm of [...DREAMINA_DEFAULT_VIDEO_MODELS].reverse()) {
      const existingVid = raw.ai.models.video.generation.find((item: any) => item.name === vm.name)
      if (!existingVid) {
        raw.ai.models.video.generation.unshift({ ...vm, modes: [...vm.modes], resolutions: [...vm.resolutions], durations: [...vm.durations], aspectRatios: [...vm.aspectRatios] })
        changed = true
      }
      else if (
        existingVid.description !== vm.description
        || JSON.stringify(existingVid.resolutions || []) !== JSON.stringify(vm.resolutions)
      ) {
        existingVid.description = vm.description
        existingVid.resolutions = [...vm.resolutions]
        existingVid.durations = [...vm.durations]
        existingVid.tags = vm.tags
        changed = true
      }
    }

    if (preferredVideoModel && preferredVideoModel.startsWith('dreamina-')) {
      const idx = raw.ai.models.video.generation.findIndex((item: any) => item.name === preferredVideoModel)
      if (idx > 0) {
        const [picked] = raw.ai.models.video.generation.splice(idx, 1)
        raw.ai.models.video.generation.unshift(picked)
        changed = true
      }
    }

    return changed
  }

  async saveHubState(payload: StudioModelsHubPayload) {
    const raw = this.readRawConfig()

    // 1. Update third-party providers
    if (payload.providers?.openai) {
      raw.ai.openai.baseUrl = payload.providers.openai.baseUrl.trim() || raw.ai.openai.baseUrl
      raw.ai.openai.apiKey = payload.providers.openai.apiKey.trim()
    }
    if (payload.providers?.anthropic) {
      raw.ai.anthropic.baseUrl = payload.providers.anthropic.baseUrl.trim() || raw.ai.anthropic.baseUrl
      raw.ai.anthropic.apiKey = payload.providers.anthropic.apiKey.trim()
    }
    if (payload.providers?.gemini) {
      raw.ai.gemini.baseUrl = payload.providers.gemini.baseUrl.trim() || raw.ai.gemini.baseUrl
      raw.ai.gemini.apiKey = payload.providers.gemini.apiKey.trim()
    }
    if (payload.providers?.grok) {
      raw.ai.grok.baseUrl = payload.providers.grok.baseUrl.trim() || raw.ai.grok.baseUrl
      raw.ai.grok.apiKey = payload.providers.grok.apiKey.trim()
    }
    if (payload.providers?.dashscope) {
      raw.ai.dashscope.baseUrl = payload.providers.dashscope.baseUrl.trim() || raw.ai.dashscope.baseUrl
      raw.ai.dashscope.apiKey = payload.providers.dashscope.apiKey.trim()
    }
    if (payload.providers?.volcengine) {
      raw.ai.volcengine.baseUrl = payload.providers.volcengine.baseUrl.trim() || raw.ai.volcengine.baseUrl
      raw.ai.volcengine.apiKey = payload.providers.volcengine.apiKey.trim()
    }
    if (payload.providers?.relay) {
      raw.ai.relay = raw.ai.relay || { url: 'https://aitoearn.ai/', apiKey: '', timeout: 300000 }
      raw.ai.relay.url = payload.providers.relay.url.trim() || raw.ai.relay.url
      raw.ai.relay.apiKey = payload.providers.relay.apiKey.trim()
    }

    // 2. Sync Agent configuration
    const agentEngine = payload.agent.engine === 'thirdParty' ? 'claude-sdk' : payload.agent.engine
    const agentModel = (payload.agent.model || (agentEngine === 'claude-sdk' ? 'claude-opus-4-6' : `${agentEngine}:default`)).trim()
    raw.agent.engine = agentEngine
    raw.agent.protocol = payload.agent.protocol || 'anthropic'
    if (agentEngine === 'agy' || agentEngine === 'codex' || agentEngine === 'grok' || agentEngine === 'workbuddy') {
      const bareLocal = agentModel.replace(/^(?:agy|codex|grok|workbuddy)[:/]?/i, '').trim()
      raw.agent.localModel = bareLocal || 'default'
    }
    else {
      raw.agent.baseUrl = (payload.agent.baseUrl || raw.agent.baseUrl || '').trim()
      raw.agent.apiKey = (payload.agent.apiKey || raw.agent.apiKey || 'sk-placeholder').trim() || 'sk-placeholder'
    }

    const agentModels = new Set<string>(Array.isArray(raw.agent.models) ? raw.agent.models : [])
    agentModels.add('agy:default')
    agentModels.add('codex:default')
    agentModels.add('grok:default')
    agentModels.add('workbuddy:default')
    agentModels.add(agentModel)
    const bgModel = (payload.agent.backgroundModel || agentModel).trim()
    const thinkModel = (payload.agent.thinkModel || agentModel).trim()
    agentModels.add(bgModel)
    agentModels.add(thinkModel)
    raw.agent.models = [...agentModels]
    raw.agent.defaultModel = agentModel
    raw.agent.backgroundModel = bgModel
    raw.agent.thinkModel = thinkModel

    // 3. Sync Chat & Planner models
    const chatModel = (payload.chat.model || 'agy:default').trim()
    const chatChannel = this.resolveChannelForTextSlot(payload.chat.engine, payload.chat.thirdPartyChannel)
    this.ensureChatModelEntry(
      raw.ai.models.chat,
      chatModel,
      this.describeTextModel(payload.chat.engine, chatModel),
      chatChannel,
      ['web', 'comment', 'draft-generation'],
    )

    const plannerModel = (payload.planner.model || chatModel).trim()
    const plannerChannel = this.resolveChannelForTextSlot(payload.planner.engine, payload.planner.thirdPartyChannel)
    this.ensureChatModelEntry(
      raw.ai.models.chat,
      plannerModel,
      this.describeTextModel(payload.planner.engine, plannerModel),
      plannerChannel,
      ['web', 'draft-generation'],
    )
    raw.ai.draftGeneration.planner.defaultModel = plannerModel

    // Always keep local CLI defaults available in chat catalog
    this.ensureChatModelEntry(raw.ai.models.chat, 'workbuddy:default', 'WorkBuddy (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
    this.ensureChatModelEntry(raw.ai.models.chat, 'grok:default', 'Grok CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
    this.ensureChatModelEntry(raw.ai.models.chat, 'codex:default', 'Codex CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])
    this.ensureChatModelEntry(raw.ai.models.chat, 'agy:default', 'Antigravity CLI (本机)', AiLogChannel.OpenAI, ['web', 'comment', 'draft-generation'])

    // 4. Sync Image & Video models (including Dreamina CLI catalog)
    const imageModel = (payload.image.model || 'dreamina-5.0').trim()
    const videoModel = (payload.video.model || 'dreamina-seedance-2.0-fast').trim()
    this.ensureDreaminaCatalog(raw, imageModel, videoModel)

    if (payload.image.engine === 'openai' && imageModel && !imageModel.startsWith('dreamina-')) {
      if (!raw.ai.draftGeneration.imageModels.some((item: any) => item.model === imageModel)) {
        raw.ai.draftGeneration.imageModels.unshift({
          model: imageModel,
          displayName: imageModel,
          runtimeModel: imageModel,
          queuePriority: 1,
          tags: [],
          supportedAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
          maxInputImages: 8,
          pricing: [{ resolution: '1K' }, { resolution: '2K' }],
        })
      }
      if (!raw.ai.models.image.generation.some((item: any) => item.name === imageModel)) {
        raw.ai.models.image.generation.unshift({
          name: imageModel,
          description: imageModel,
          tags: [],
          runtimeModel: imageModel,
          retry: 1,
          sizes: STANDARD_IMAGE_SIZES,
          qualities: ['auto', 'high'],
          styles: [],
        })
      }
    }

    // 5. Persist structured studio section
    raw.studio = {
      agent: {
        engine: payload.agent.engine,
        model: agentModel,
        protocol: payload.agent.protocol || 'anthropic',
      },
      chat: {
        engine: payload.chat.engine,
        model: chatModel,
      },
      planner: {
        engine: payload.planner.engine,
        model: plannerModel,
      },
      image: {
        engine: payload.image.engine,
        model: imageModel,
        resolution: payload.image.resolution || '2k',
      },
      video: {
        engine: payload.video.engine,
        model: videoModel,
      },
    }

    this.writeRawConfig(raw)
    return await this.getHubState()
  }

  private resolveChannelForTextSlot(
    engine: 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty',
    thirdPartyChannel?: 'openai' | 'anthropic' | 'gemini' | 'deepseek',
  ): AiLogChannel {
    if (engine === 'agy' || engine === 'codex' || engine === 'grok' || engine === 'workbuddy') {
      return AiLogChannel.OpenAI
    }
    switch (thirdPartyChannel) {
      case 'anthropic': return AiLogChannel.Anthropic
      case 'gemini': return AiLogChannel.Gemini
      case 'deepseek': return AiLogChannel.DeepSeek
      default: return AiLogChannel.OpenAI
    }
  }

  private describeTextModel(engine: 'agy' | 'codex' | 'grok' | 'workbuddy' | 'thirdParty', model: string): string {
    if (engine === 'agy') return `Antigravity CLI (${model})`
    if (engine === 'codex') return `Codex CLI (${model})`
    if (engine === 'grok') return `Grok CLI (${model})`
    if (engine === 'workbuddy') return `WorkBuddy (${model})`
    return model
  }
}
