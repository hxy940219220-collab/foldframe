import type { DraftGenerationData, DraftGenerationQueueInfo } from '@yikart/aitoearn-queue'
import { HumanMessage } from '@langchain/core/messages'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common'
import { QueueService } from '@yikart/aitoearn-queue'
import { AssetsService, VideoMetadataService } from '@yikart/assets'
import { AccountType, AppException, FileUtil, getErrorMessage, poll, ResponseCode, retry, UserType } from '@yikart/common'
import {
  AiLogChannel,
  AiLogRepository,
  AiLogStatus,
  AiLogType,
  AssetType,
  MaterialGroupRepository,
  MaterialRepository,
  MaterialSource,
  MaterialStatus,
  MaterialType,
  MediaRepository,
  MediaType,
} from '@yikart/mongodb'
import { z } from 'zod'
import { TaskStatus } from '../../common'
import { config } from '../../config'
import { AiAvailabilityService } from '../ai-availability'
import { ImageService } from '../ai/image/image.service'
import { VideoService } from '../ai/video/video.service'
import { isCodexImageModelName, isDreaminaModelName, isLocalBridgeChatModel, LocalBridgeService } from '../local-bridge'
import { DraftGenerationMemoryService } from './draft-generation-memory.service'
import { DraftGenerationPlannerService, ImageTextDraftPlanResult, VideoDraftPlanResult } from './draft-generation-planner.service'
import { getCompatibleAccountTypes } from './draft-generation-platforms'
import {
  CreateDraftFromVideoUrlDto,
  CreateDraftGenerationV2Dto,
  CreateImageTextDraftDto,
  DraftGenerationMemoryContentType,
  DraftType,
  ImageTextDraftType,
  ListDraftGenerationTasksDto,
  QueryDraftGenerationTasksDto,
} from './draft-generation.dto'
import { DraftGenerationPricingVo } from './draft-generation.vo'

export class DraftGenerationError extends Error {
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = 'DraftGenerationError'
  }
}

const VideoDraftMetadataResultSchema = z.object({
  title: z.string().max(200).describe('TikTok video title'),
  description: z.string().max(2200).describe('TikTok video description'),
  topics: z.array(z.string()).max(5).describe('Hashtag topics without # prefix'),
})

interface ImageGenerationPrompt {
  prompt: string
  promptIndex: number
}

interface ImageGenerationErrorDetail {
  promptIndex: number
  errorMessage: string
}

type ImageGenerationProgressHandler = (imageUrl: string, imageGenerationErrors: ImageGenerationErrorDetail[]) => Promise<void>

type DraftGenerationTaskWithQueue<T extends { id: string, status: AiLogStatus }> = T & {
  queue?: DraftGenerationQueueInfo
}

enum ImageExecutionReferenceHandling {
  None = 'none',
  Reference = 'reference',
  Edit = 'edit',
  Ignored = 'ignored',
}

const OPENAI_IMAGE_DEFAULT_ASPECT_RATIO = '2:3'
const OPENAI_IMAGE_DEFAULT_RESOLUTION = '1K'

function getOpenAIImageSizeProfile(imageSize: string): { maxEdge: number, maxPixels: number, squareSize?: string } {
  switch (imageSize) {
    case '1K':
      return { maxEdge: 1536, maxPixels: 1536 * 1024, squareSize: '1024x1024' }
    case '2K':
      return { maxEdge: 2560, maxPixels: 2560 * 1440 }
    case '4K':
      return { maxEdge: 3840, maxPixels: 3840 * 2160 }
    default:
      throw new BadRequestException('imageSize must be one of 1K, 2K, or 4K')
  }
}
const OPENAI_IMAGE_SIZE_MULTIPLE = 16
const OPENAI_IMAGE_MIN_ASPECT_RATIO = 1 / 3
const OPENAI_IMAGE_MAX_ASPECT_RATIO = 3

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)

  while (b !== 0) {
    const next = a % b
    a = b
    b = next
  }

  return a
}

interface ResolvedImageExecution {
  referenceHandling: ImageExecutionReferenceHandling
  resolvedSize?: string
  mode: 'gemini' | 'openai-generation' | 'openai-edit' | 'dreamina' | 'codex-image'
  channel: AiLogChannel
}

/** V2 视频草稿 AiLog.response */
interface V2DraftResponse {
  materialId?: string
  mediaId?: string
  title?: string
  description?: string
  topics?: string[]
  videoUrl?: string
  coverUrl?: string
  creditsUsed?: number
  plan?: VideoDraftPlanResult
}

/** 图文草稿 AiLog.response */
interface ImageTextDraftResponse {
  materialId?: string
  mediaIds?: string[]
  title?: string
  description?: string
  topics?: string[]
  coverUrl?: string
  imageUrls?: string[]
  requestedImageCount?: number
  generatedImageCount?: number
  creditsUsed?: number
  imageGenerationErrors?: ImageGenerationErrorDetail[]
  plan?: ImageTextDraftPlanResult
}

export interface DraftMediaGenerationMeta {
  found: boolean
  taskId?: string
  prompt?: string
  planTitle?: string
  model?: string
  modelDisplayName?: string
  mediaType?: 'image' | 'video'
  aspectRatio?: string
  imageSize?: string
  resolution?: string
  duration?: number
  imageCount?: number
  creditsUsed?: number | null
  creditsUnit?: 'dreamina' | 'codex' | 'points'
  generationDurationMs?: number
  createdAt?: string
  referenceImageUrls?: string[]
}

@Injectable()
export class DraftGenerationService {
  private readonly logger = new Logger(DraftGenerationService.name)

  constructor(
    private readonly materialGroupRepository: MaterialGroupRepository,
    private readonly materialRepository: MaterialRepository,
    private readonly aiLogRepository: AiLogRepository,
    private readonly queueService: QueueService,
    private readonly videoService: VideoService,
    private readonly assetsService: AssetsService,
    private readonly videoMetadataService: VideoMetadataService,
    private readonly aiAvailability: AiAvailabilityService,
    private readonly imageService: ImageService,
    private readonly mediaRepository: MediaRepository,
    private readonly draftGenerationPlannerService: DraftGenerationPlannerService,
    private readonly draftGenerationMemoryService: DraftGenerationMemoryService,
    @Optional() private readonly localBridgeService?: LocalBridgeService,
  ) { }

  async getTask(taskId: string, userId: string, userType: UserType) {
    const aiLog = await this.aiLogRepository.getByIdAndUserId(taskId, userId, userType)
    if (!aiLog) {
      throw new AppException(ResponseCode.AiLogNotFound)
    }
    return await this.attachQueueInfo(aiLog)
  }

  async listTasks(dto: QueryDraftGenerationTasksDto, userId: string, userType: UserType) {
    const tasks = await this.aiLogRepository.listByIdsAndUserId(dto.taskIds, userId, userType)
    return await this.attachQueueInfoToTasks(tasks)
  }

  async listTasksWithPagination(dto: ListDraftGenerationTasksDto, userId: string, userType: UserType) {
    const [tasks, total] = await this.aiLogRepository.listWithPagination({
      ...dto,
      userId,
      userType,
      type: AiLogType.DraftGeneration,
    })
    return [await this.attachQueueInfoToTasks(tasks), total] as const
  }

  async getAvailableTextModels(): Promise<{
    defaultModel: string
    models: Array<{ value: string, label: string, provider: string, tag?: string }>
  }> {
    const defaultModel = config.studio?.planner?.model
      || config.ai.draftGeneration.planner.defaultModel
      || 'agy:default'
    const map = new Map<string, { value: string, label: string, provider: string, tag?: string }>()
    const push = (item: { value: string, label: string, provider: string, tag?: string }) => {
      if (!item.value || map.has(item.value)) return
      map.set(item.value, item)
    }

    try {
      const bridge = this.localBridgeService ? await this.localBridgeService.getEngines() : null
      if (bridge?.reachable) {
        if (bridge.engines.agy?.installed) {
          push({ value: 'agy:default', label: 'Antigravity CLI (默认)', provider: 'agy', tag: '本机 LLM' })
          for (const m of (bridge.engines.agy.models || []).slice(0, 10)) {
            if (!m || m === 'default') continue
            push({ value: `agy:${m}`, label: `Antigravity · ${m}`, provider: 'agy', tag: '本机 LLM' })
          }
        }
        if (bridge.engines.codex?.installed && bridge.engines.codex.loggedIn !== false) {
          const eff = bridge.engines.codex.effectiveDefaultModel
          push({ value: 'codex:default', label: eff ? `Codex CLI (${eff})` : 'Codex CLI (默认)', provider: 'codex', tag: '本机 LLM' })
          for (const m of (bridge.engines.codex.models || []).slice(0, 8)) {
            if (!m || m === 'default') continue
            push({ value: `codex:${m}`, label: `Codex · ${m}`, provider: 'codex', tag: '本机 LLM' })
          }
        }
        if (bridge.engines.ollama?.running) {
          for (const m of (bridge.engines.ollama.models || []).slice(0, 8)) {
            if (!m) continue
            push({ value: `ollama:${m}`, label: `Ollama · ${m}`, provider: 'ollama', tag: '本地开源' })
          }
        }
      }
    }
    catch {}

    // Always include configured chat models whose provider is ready (or local bridge)
    const openaiReady = this.hasUsableApiKey(config.ai.openai?.apiKey)
    const anthropicReady = this.hasUsableApiKey(config.ai.anthropic?.apiKey)
    const geminiReady = this.hasUsableApiKey(config.ai.gemini?.apiKey)
    for (const cm of config.ai.models.chat) {
      if (isLocalBridgeChatModel(cm.name)) {
        push({ value: cm.name, label: cm.description || cm.name, provider: 'local', tag: '本机 LLM' })
      }
      else if (cm.channel === AiLogChannel.Gemini && geminiReady) {
        push({ value: cm.name, label: cm.description || cm.name, provider: 'gemini', tag: '第三方 API' })
      }
      else if (cm.channel === AiLogChannel.Anthropic && anthropicReady) {
        push({ value: cm.name, label: cm.description || cm.name, provider: 'anthropic', tag: '第三方 API' })
      }
      else if ((cm.channel === AiLogChannel.OpenAI || cm.channel === AiLogChannel.DeepSeek) && openaiReady) {
        push({ value: cm.name, label: cm.description || cm.name, provider: 'openai', tag: '第三方 API' })
      }
    }

    if (map.size === 0) {
      push({ value: 'agy:default', label: 'Antigravity CLI (默认)', provider: 'agy', tag: '本机 LLM' })
    }

    const models = [...map.values()].sort((a, b) => (a.value === defaultModel ? -1 : b.value === defaultModel ? 1 : 0))
    return {
      defaultModel: map.has(defaultModel) ? defaultModel : models[0].value,
      models,
    }
  }

  async quickTextAssist(
    userId: string,
    userType: UserType,
    dto: {
      mode: 'title' | 'caption' | 'script' | 'hashtags' | 'prompt'
      topic: string
      platform?: string
      currentText?: string
      model?: string
      referenceImageUrls?: string[]
    },
  ): Promise<{ text: string, model: string }> {
    const platformHint = dto.platform ? `目标平台：${dto.platform}。` : ''
    const modePrompts: Record<string, string> = {
      title: `你是爆款社媒标题专家。${platformHint}请直接输出 1 条高点击率、自然有网感、不超过 30 字的中文标题，不要解释、不要加引号、不要编号。`,
      caption: `你是资深新媒体文案策划。${platformHint}请直接输出一篇结构清晰、带情绪钩子与互动结尾的社媒正文文案（120-260 字），不要输出开场白或额外解释。`,
      script: `你是短视频分镜导演。${platformHint}请直接输出一份可直接拍摄/生视频的 3-4 镜短视频脚本（包含每镜景别、画面动作、口播/字幕），语言精炼。`,
      hashtags: `你是社媒标签运营专家。${platformHint}请直接输出 5 个精准话题标签，用空格分隔，每个以 # 开头，不要其他任何文字。`,
      prompt: `你是顶级 AI 绘画/视频提示词导演。请把用户的简短想法扩写为一段画面感极强、包含主体、光影、构图与质感的中文生成提示词（80-150 字），直接输出结果，不要解释。`,
    }
    const userPrompt = dto.currentText?.trim()
      ? `主题/需求：${dto.topic}\n当前内容（请在此基础上润色升级）：\n${dto.currentText.trim()}`
      : `主题/需求：${dto.topic}`
    return await this.draftGenerationPlannerService.quickTextAssist({
      userId,
      userType,
      model: dto.model,
      systemPrompt: modePrompts[dto.mode] || modePrompts.caption,
      userPrompt,
      referenceImageUrls: dto.referenceImageUrls,
    })
  }

  async getStats(userId: string, userType: UserType) {
    const generatingCount = await this.aiLogRepository.countByUserIdAndStatus(
      userId,
      userType,
      AiLogType.DraftGeneration,
      AiLogStatus.Generating,
    )
    return { generatingCount }
  }

  private buildUrlCandidates(rawUrl?: string): string[] {
    if (!rawUrl) return []
    const trimmed = rawUrl.trim()
    if (!trimmed) return []
    const out = new Set<string>([trimmed])
    const withoutQuery = trimmed.split(/[?#]/)[0]
    if (withoutQuery) out.add(withoutQuery)
    try {
      const parsed = new URL(trimmed)
      const pathname = parsed.pathname
      if (pathname) {
        out.add(pathname)
        out.add(pathname.replace(/^\/+/, ''))
        const strippedOss = pathname.replace(/^\/?(?:api\/)?oss\/+/, '')
        if (strippedOss) {
          out.add(strippedOss)
          out.add(`/${strippedOss}`)
        }
      }
    }
    catch {
      const strippedOss = withoutQuery.replace(/^\/?(?:api\/)?oss\/+/, '').replace(/^\/+/, '')
      if (strippedOss) {
        out.add(strippedOss)
        out.add(`/${strippedOss}`)
      }
    }
    return [...out].filter(Boolean)
  }

  private resolveModelDisplayName(model?: string): string | undefined {
    if (!model) return undefined
    const draftImg = config.ai.draftGeneration.imageModels.find(m => m.model === model) as { displayName?: string, name?: string } | undefined
    if (draftImg?.displayName) return draftImg.displayName
    if (draftImg?.name) return draftImg.name
    const genImg = config.ai.models.image.generation.find(m => m.name === model)
    if (genImg?.description) return genImg.description
    const videoModel = config.ai.models.video.generation.find(m => m.name === model)
    if (videoModel?.description) return videoModel.description
    return model
  }

  async getMediaGenerationMeta(
    userId: string,
    userType: UserType,
    params: { mediaId?: string, url?: string },
  ): Promise<DraftMediaGenerationMeta> {
    const mediaId = params.mediaId?.trim() || undefined
    const urlSet = new Set<string>(this.buildUrlCandidates(params.url))

    if (mediaId) {
      try {
        const media = await this.mediaRepository.getById(mediaId)
        if (media?.url) {
          for (const candidate of this.buildUrlCandidates(media.url)) {
            urlSet.add(candidate)
          }
        }
      }
      catch {
        // Ignore invalid ObjectId or lookup miss
      }
    }

    const urlCandidates = [...urlSet]
    if (!mediaId && urlCandidates.length === 0) {
      return { found: false }
    }

    const logs = await this.aiLogRepository.findMediaGenerationLogs(userId, userType, mediaId, urlCandidates)
    if (logs.length === 0) {
      return { found: false }
    }

    const draftLog = logs.find(l => l.type === AiLogType.DraftGeneration)
    const directLog = logs.find(l => l.type === AiLogType.Image || l.type === AiLogType.Video)
    const primary = draftLog ?? directLog ?? logs[0]

    const pReq = (primary.request ?? {}) as Record<string, unknown>
    const pRes = (primary.response ?? {}) as Record<string, unknown>
    const dReq = (directLog?.request ?? {}) as Record<string, unknown>
    const dRes = (directLog?.response ?? {}) as Record<string, unknown>

    const model = String(primary.model || pReq['imageModel'] || pReq['model'] || directLog?.model || '').trim() || undefined
    const plan = (pRes['plan'] ?? undefined) as { title?: string, imagePrompts?: string[], videoPrompt?: string } | undefined

    const rawPrompt = typeof pReq['prompt'] === 'string' && pReq['prompt'].trim()
      ? pReq['prompt'].trim()
      : (typeof dReq['prompt'] === 'string' && dReq['prompt'].trim() ? dReq['prompt'].trim() : undefined)

    const isVideo = primary.type === AiLogType.Video
      || pReq['draftType'] === 'video'
      || Boolean(pRes['videoUrl'] || dRes['videoUrl'])

    const aspectRatio = (typeof pReq['aspectRatio'] === 'string' ? pReq['aspectRatio'] : undefined)
      ?? (typeof dReq['aspectRatio'] === 'string' ? dReq['aspectRatio'] : undefined)
      ?? (typeof dReq['ratio'] === 'string' ? dReq['ratio'] : undefined)

    const imageSize = (typeof pReq['imageSize'] === 'string' ? pReq['imageSize'] : undefined)
      ?? (typeof dReq['imageSize'] === 'string' ? dReq['imageSize'] : undefined)

    const resolution = (typeof pReq['resolution'] === 'string' ? pReq['resolution'] : undefined)
      ?? (typeof dReq['resolution'] === 'string' ? dReq['resolution'] : undefined)

    const rawDuration = pRes['duration'] ?? dRes['duration'] ?? pReq['duration'] ?? dReq['duration']
    const duration = typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? rawDuration : undefined

    const rawImageCount = pRes['generatedImageCount'] ?? pReq['imageCount'] ?? dReq['count']
    const imageCount = typeof rawImageCount === 'number' && Number.isFinite(rawImageCount) ? rawImageCount : undefined

    const rawCredits = typeof pRes['creditsUsed'] === 'number'
      ? pRes['creditsUsed']
      : (typeof dRes['creditsUsed'] === 'number' ? dRes['creditsUsed'] : null)

    const fallbackPoints = (typeof primary.points === 'number' && primary.points > 0)
      ? primary.points
      : ((typeof directLog?.points === 'number' && directLog.points > 0) ? directLog.points : null)

    const isDreamina = isDreaminaModelName(model)
    const isCodexImage = isCodexImageModelName(model)
    const creditsUsed = isCodexImage ? 0 : (rawCredits !== null ? rawCredits : fallbackPoints)
    const creditsUnit: 'dreamina' | 'codex' | 'points' = isCodexImage
      ? 'codex'
      : rawCredits !== null
        ? (isDreamina ? 'dreamina' : 'points')
        : (fallbackPoints !== null ? 'points' : (isDreamina ? 'dreamina' : 'points'))

    const refImages = Array.isArray(pReq['imageUrls'])
      ? (pReq['imageUrls'] as unknown[]).filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
      : (Array.isArray(dReq['imageUrls'])
          ? (dReq['imageUrls'] as unknown[]).filter((u): u is string => typeof u === 'string' && Boolean(u.trim()))
          : undefined)

    const generationDurationMs = typeof primary.duration === 'number' && primary.duration > 0
      ? primary.duration
      : (typeof directLog?.duration === 'number' && directLog.duration > 0 ? directLog.duration : undefined)

    return {
      found: true,
      taskId: primary.id,
      prompt: rawPrompt,
      planTitle: plan?.title || (typeof pRes['title'] === 'string' ? pRes['title'] : undefined),
      model,
      modelDisplayName: this.resolveModelDisplayName(model),
      mediaType: isVideo ? 'video' : 'image',
      aspectRatio,
      imageSize,
      resolution,
      duration,
      imageCount,
      creditsUsed,
      creditsUnit,
      generationDurationMs,
      createdAt: primary.createdAt ? new Date(primary.createdAt).toISOString() : undefined,
      referenceImageUrls: refImages && refImages.length > 0 ? refImages : undefined,
    }
  }

  private async addDraftGenerationJob(data: DraftGenerationData): Promise<void> {
    const options = data.queuePriority == null ? undefined : { priority: data.queuePriority }
    if (
      data.queuePriority != null
      && data.queuePriority >= config.ai.draftGeneration.queue.lowPriorityMinPriority
    ) {
      await this.queueService.addLowPriorityDraftGenerationJob(data, options)
      return
    }

    await this.queueService.addDraftGenerationJob(data, options)
  }

  private async attachQueueInfo<T extends { id: string, status: AiLogStatus }>(task: T): Promise<DraftGenerationTaskWithQueue<T>> {
    if (task.status !== AiLogStatus.Generating) {
      return task
    }

    const queue = await this.queueService.getDraftGenerationQueueInfo(task.id)
    if (!queue) {
      return task
    }

    return { ...task, queue }
  }

  private async attachQueueInfoToTasks<T extends { id: string, status: AiLogStatus }>(tasks: T[]): Promise<Array<DraftGenerationTaskWithQueue<T>>> {
    return await Promise.all(tasks.map(task => this.attachQueueInfo(task)))
  }

  private getVideoDraftModelConfig(model: string) {
    const modelConfig = config.ai.models.video.generation.find(m => m.name === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    return modelConfig
  }

  private resolveVideoReferenceMode(
    modelConfig: ReturnType<DraftGenerationService['getVideoDraftModelConfig']>,
    videoUrls?: string[],
    audioUrls?: string[],
  ): 'multi-ref' | 'video2video' | undefined {
    const hasVideoReference = (videoUrls?.length ?? 0) > 0
    const hasAudioReference = (audioUrls?.length ?? 0) > 0
    if (!hasVideoReference && !hasAudioReference) {
      return undefined
    }

    if (modelConfig.modes.includes('multi-ref')) {
      return 'multi-ref'
    }

    if (hasVideoReference && !hasAudioReference && modelConfig.modes.includes('video2video')) {
      return 'video2video'
    }

    throw new AppException(ResponseCode.InvalidModel)
  }

  private getImageTextDraftModelConfig(model: string) {
    const modelConfig = config.ai.draftGeneration.imageModels.find(m => m.model === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    return modelConfig
  }

  private resolveOpenAIImageSize(aspectRatio?: string, imageSize = OPENAI_IMAGE_DEFAULT_RESOLUTION): string {
    const sizeProfile = getOpenAIImageSizeProfile(imageSize)
    const parts = (aspectRatio ?? OPENAI_IMAGE_DEFAULT_ASPECT_RATIO).split(':')
    if (parts.length !== 2) {
      throw new BadRequestException('image aspectRatio must use WIDTH:HEIGHT')
    }

    const widthRatio = Number(parts[0])
    const heightRatio = Number(parts[1])
    if (!Number.isInteger(widthRatio) || !Number.isInteger(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
      throw new BadRequestException('image aspectRatio must use positive integer WIDTH:HEIGHT')
    }

    const ratio = widthRatio / heightRatio
    if (ratio < OPENAI_IMAGE_MIN_ASPECT_RATIO || ratio > OPENAI_IMAGE_MAX_ASPECT_RATIO) {
      throw new BadRequestException('image aspectRatio must be between 1:3 and 3:1')
    }

    if (widthRatio === heightRatio) {
      return sizeProfile.squareSize ?? this.resolveScaledOpenAIImageSize(widthRatio, heightRatio, sizeProfile)
    }

    return this.resolveScaledOpenAIImageSize(widthRatio, heightRatio, sizeProfile)
  }

  private resolveScaledOpenAIImageSize(
    widthRatio: number,
    heightRatio: number,
    sizeProfile: { maxEdge: number, maxPixels: number },
  ): string {
    const divisor = getGreatestCommonDivisor(widthRatio, heightRatio)
    const reducedWidth = widthRatio / divisor
    const reducedHeight = heightRatio / divisor
    const maxScaleByEdge = Math.floor(sizeProfile.maxEdge / Math.max(reducedWidth, reducedHeight))
    const maxScaleByPixels = Math.floor(Math.sqrt(sizeProfile.maxPixels / (reducedWidth * reducedHeight)))
    const maxScale = Math.min(maxScaleByEdge, maxScaleByPixels)
    const scale = Math.floor(maxScale / OPENAI_IMAGE_SIZE_MULTIPLE) * OPENAI_IMAGE_SIZE_MULTIPLE

    if (scale < OPENAI_IMAGE_SIZE_MULTIPLE) {
      throw new BadRequestException('image aspectRatio cannot be converted to a supported size')
    }

    return `${reducedWidth * scale}x${reducedHeight * scale}`
  }

  private resolveImageExecution(
    imageModel: string,
    referenceImageUrls: string[],
    aspectRatio?: string,
    imageSize?: string,
  ): ResolvedImageExecution {
    this.getImageTextDraftModelConfig(imageModel)

    if (isDreaminaModelName(imageModel)) {
      return {
        mode: 'dreamina',
        channel: AiLogChannel.NewApi,
        referenceHandling: referenceImageUrls.length > 0 ? ImageExecutionReferenceHandling.Reference : ImageExecutionReferenceHandling.None,
      }
    }

    if (isCodexImageModelName(imageModel)) {
      return {
        mode: 'codex-image',
        channel: AiLogChannel.NewApi,
        referenceHandling: referenceImageUrls.length > 0 ? ImageExecutionReferenceHandling.Reference : ImageExecutionReferenceHandling.None,
      }
    }

    const geminiImageModel = config.ai.models.chat.find(model =>
      model.name === imageModel
      && model.channel === AiLogChannel.Gemini
      && model.outputModalities.includes('image'),
    )
    const generationModel = config.ai.models.image.generation.find(model => model.name === imageModel)
    const editModel = config.ai.models.image.edit.find(model => model.name === imageModel)

    if (geminiImageModel && (generationModel || editModel)) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    if (geminiImageModel) {
      return {
        mode: 'gemini',
        channel: geminiImageModel.channel,
        referenceHandling: referenceImageUrls.length > 0 ? ImageExecutionReferenceHandling.Reference : ImageExecutionReferenceHandling.None,
      }
    }

    const resolvedSize = this.resolveOpenAIImageSize(aspectRatio, imageSize)

    if (referenceImageUrls.length > 0 && editModel) {
      return {
        mode: 'openai-edit',
        channel: AiLogChannel.NewApi,
        referenceHandling: ImageExecutionReferenceHandling.Edit,
        resolvedSize,
      }
    }

    if (generationModel) {
      return {
        mode: 'openai-generation',
        channel: AiLogChannel.NewApi,
        referenceHandling: referenceImageUrls.length > 0 ? ImageExecutionReferenceHandling.Ignored : ImageExecutionReferenceHandling.None,
        resolvedSize,
      }
    }

    throw new AppException(ResponseCode.InvalidModel)
  }

  // ==================== V2: 固定管线（无 Agent） ====================

  /**
   * V2: 创建草稿生成任务（投递队列时标记 version=v2）
   * 支持选择 modelType、duration、aspectRatio
   */
  async createDraftsV2(userId: string, userType: UserType, dto: CreateDraftGenerationV2Dto): Promise<string[]> {
    const draftType = dto.draftType ?? 'draft'
    const modelConfig = config.ai.models.video.generation.find(m => m.name === dto.model)
      ?? (draftType === 'draft' ? config.ai.models.video.generation[0] : undefined)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const resolution = dto.resolution ?? modelConfig.defaults?.resolution
    const resolvedGroupId = await this.resolveDraftGroupId(userId, dto.groupId)
    const queuePriority = modelConfig.queuePriority
    const plannerModel = draftType === 'draft'
      ? (dto.plannerModel ?? config.studio?.planner?.model ?? config.ai.draftGeneration.planner.defaultModel ?? 'agy:default')
      : undefined
    if (
      plannerModel
      && !isLocalBridgeChatModel(plannerModel)
      && !config.ai.models.chat.some(model => model.name === plannerModel)
    ) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const effectiveLogModel = draftType === 'draft' ? (plannerModel || 'agy:default') : dto.model
    const quantity = dto.quantity ?? 1
    const aiLogIds: string[] = []

    for (let i = 0; i < quantity; i++) {
      const aiLog = await this.aiLogRepository.create({
        userId,
        userType,
        type: AiLogType.DraftGeneration,
        model: effectiveLogModel,
        channel: draftType === 'draft' ? AiLogChannel.OpenAI : modelConfig.channel as AiLogChannel,
        status: AiLogStatus.Generating,
        startedAt: new Date(),
        request: {
          groupId: resolvedGroupId,
          version: 'v2',
          model: effectiveLogModel,
          duration: dto.duration,
          resolution,
          aspectRatio: dto.aspectRatio,
          prompt: dto.prompt,
          captionPrompt: dto.captionPrompt,
          imageUrls: dto.imageUrls,
          videoUrls: dto.videoUrls,
          audioUrls: dto.audioUrls,
          draftType,
          plannerModel,
          queuePriority,
        },
        response: {},
      })

      await this.addDraftGenerationJob({
        aiLogId: aiLog.id,
        userId,
        userType,
        groupId: resolvedGroupId,
        version: 'v2',
        prompt: dto.prompt,
        captionPrompt: dto.captionPrompt,
        imageUrls: dto.imageUrls,
        model: dto.model,
        duration: dto.duration,
        resolution,
        aspectRatio: dto.aspectRatio,
        videoUrls: dto.videoUrls,
        audioUrls: dto.audioUrls,
        draftType,
        platforms: dto.platforms,
        plannerModel,
        disableMemory: dto.disableMemory,
        queuePriority,
      })

      aiLogIds.push(aiLog.id)
    }

    return aiLogIds
  }

  /**
   * V2: 固定管线执行草稿内容生成（由 Consumer 调用）
   *
   * 流程：
   * 1. 规划模型生成视频 prompt + 元数据
   * 2. 调用视频模型生成视频
   * 3. 截帧生成封面
   * 4. 保存素材 + 更新 AiLog
   */
  async generateContentV2(
    aiLogId: string,
    userId: string,
    userType: UserType,
    groupId: string,
    options?: {
      prompt?: string
      captionPrompt?: string
      imageUrls?: string[]
      model?: string
      duration?: number
      resolution?: string
      aspectRatio?: string
      videoUrls?: string[]
      audioUrls?: string[]
      draftType?: DraftType
      platforms?: string[]
      plannerModel?: string
      disableMemory?: boolean
    },
  ): Promise<void> {
    const startTime = Date.now()
    const draftType = options?.draftType ?? 'draft'

    const existingAiLog = await this.aiLogRepository.getById(aiLogId)
    const existing = (existingAiLog?.response ?? {}) as V2DraftResponse

    try {
      const candidateImageUrls = options?.imageUrls ?? []
      const model = options?.model ?? 'grok-imagine-video'
      const duration = options?.duration
      const aspectRatio = options?.aspectRatio ?? '9:16'
      const resolution = options?.resolution

      let plan: VideoDraftPlanResult | undefined
      let usedPlannerModel = options?.plannerModel ?? config.studio?.planner?.model ?? config.ai.draftGeneration.planner.defaultModel ?? 'agy:default'
      let videoPrompt = options?.prompt ?? ''
      if (draftType === 'draft') {
        if (existing.plan?.videoPrompt) {
          plan = existing.plan
          this.logger.log({ aiLogId }, 'V2: Reusing plan from previous attempt')
        }
        else {
          const memoryItems = options?.disableMemory
            ? []
            : (await this.draftGenerationMemoryService.getPlannerMemoryContext(userId, DraftGenerationMemoryContentType.Video)).memoryItems
          const planned = await this.draftGenerationPlannerService.planVideo({
            userId, userType,
            contentType: DraftGenerationMemoryContentType.Video,
            plannerModel: usedPlannerModel,
            userPrompt: options?.prompt,
            captionPrompt: options?.captionPrompt,
            memoryItems,
            referenceImageUrls: candidateImageUrls,
            referenceVideoUrls: options?.videoUrls,
            referenceAudioUrls: options?.audioUrls,
            platforms: options?.platforms,
            model: usedPlannerModel,
            duration,
            aspectRatio,
          })
          plan = planned.plan
          usedPlannerModel = planned.model

          await this.aiLogRepository.updateById(aiLogId, {
            $set: { 'response.plan': plan, 'request.plannerModel': planned.model },
          })
        }

        // 草稿模式：仅使用大语言模型生成文本/分镜脚本草稿，不调用生视频模型
        const draftPlan = plan!
        const scriptDesc = [
          draftPlan.description?.trim(),
          draftPlan.videoPrompt?.trim() ? `【视频分镜 / 画面脚本】\n${draftPlan.videoPrompt.trim()}` : '',
        ].filter(Boolean).join('\n\n')

        const attachedMedia: Array<{ url: string, type: MediaType, thumbUrl?: string }> = []
        if (options?.videoUrls?.length) {
          for (const url of options.videoUrls) attachedMedia.push({ url, type: MediaType.VIDEO })
        }
        else if (candidateImageUrls.length) {
          for (const url of candidateImageUrls) attachedMedia.push({ url, type: MediaType.IMG })
        }
        const attachedCover = candidateImageUrls[0] || undefined

        const materialId = existing.materialId ?? (await this.materialRepository.create({
          userId,
          userType,
          groupId,
          type: MaterialType.VIDEO,
          source: MaterialSource.PlaceDraft,
          status: MaterialStatus.SUCCESS,
          title: draftPlan.title,
          desc: scriptDesc,
          topics: draftPlan.topics,
          ...(attachedCover ? { coverUrl: attachedCover } : {}),
          mediaList: attachedMedia,
          useCount: 0,
          autoDeleteMedia: false,
          model: usedPlannerModel,
          generationParams: { ...options, plannerModel: usedPlannerModel, textOnlyDraft: true },
          accountTypes: (options?.platforms as AccountType[]) ?? getCompatibleAccountTypes({
            type: 'video',
            title: draftPlan.title,
            desc: scriptDesc,
            topics: draftPlan.topics,
            duration,
            aspectRatio,
          }),
        })).id

        const response: V2DraftResponse = {
          materialId,
          title: draftPlan.title,
          description: scriptDesc,
          topics: draftPlan.topics,
          ...(attachedCover ? { coverUrl: attachedCover } : {}),
          plan: draftPlan,
        }

        await this.aiLogRepository.updateById(aiLogId, {
          $set: {
            status: AiLogStatus.Success,
            model: usedPlannerModel,
            duration: Date.now() - startTime,
            response,
          },
        })
        return
      }

      // 视频 + 封面：复用已有结果或重新生成（一起保存，不可分开）
      let videoUrl: string
      let coverUrl: string
      if (existing.videoUrl && existing.coverUrl) {
        videoUrl = existing.videoUrl
        coverUrl = existing.coverUrl
        this.logger.log({ aiLogId }, 'V2: Reusing video+cover from previous attempt')
      }
      else {
        const { videoUrl: generatedVideoUrl } = await this.generateVideo(
          aiLogId,
          userId,
          userType,
          model,
          videoPrompt,
          candidateImageUrls.length > 0 ? candidateImageUrls : undefined,
          duration,
          resolution,
          aspectRatio,
          options?.videoUrls,
          options?.audioUrls,
        )

        const fullVideoUrl = FileUtil.buildUrl(generatedVideoUrl)
        const thumbnailBuffer = await this.videoMetadataService.extractThumbnailFromUrl(fullVideoUrl, 2)
        const uploadResult = await this.assetsService.uploadFromBuffer(userId, thumbnailBuffer, {
          type: AssetType.VideoThumbnail,
          mimeType: 'image/png',
          filename: 'thumbnail.png',
        })

        videoUrl = generatedVideoUrl
        coverUrl = uploadResult.asset.path

        await this.aiLogRepository.updateById(aiLogId, {
          $set: { 'response.videoUrl': videoUrl, 'response.coverUrl': coverUrl },
        })
      }

      if (draftType === 'video') {
        const mediaId = existing.mediaId ?? (await this.mediaRepository.create({
          userId,
          userType,
          materialGroupId: groupId,
          type: MediaType.VIDEO,
          url: videoUrl,
          thumbUrl: coverUrl,
        })).id

        const response: V2DraftResponse = {
          mediaId,
          videoUrl,
          coverUrl,
        }
        await this.aiLogRepository.updateById(aiLogId, {
          $set: {
            status: AiLogStatus.Success,
            model,
            duration: Date.now() - startTime,
            response,
          },
        })

        return
      }

      const draftPlan = plan!

      // draft 类型：复用已有 materialId 或创建新素材
      const materialId = existing.materialId ?? (await this.materialRepository.create({
        userId,
        userType,
        groupId,
        type: MaterialType.VIDEO,
        source: MaterialSource.PlaceDraft,
        status: MaterialStatus.SUCCESS,
        title: draftPlan.title,
        desc: draftPlan.description,
        topics: draftPlan.topics,
        coverUrl,
        mediaList: [{ url: videoUrl, type: MediaType.VIDEO, thumbUrl: coverUrl }],
        useCount: 0,
        autoDeleteMedia: false,
        model,
        generationParams: options,
        accountTypes: (options?.platforms as AccountType[]) ?? getCompatibleAccountTypes({
          type: 'video',
          title: draftPlan.title,
          desc: draftPlan.description,
          topics: draftPlan.topics,
          duration,
          aspectRatio,
        }),
      })).id

      const response: V2DraftResponse = {
        materialId,
        title: draftPlan.title,
        description: draftPlan.description,
        topics: draftPlan.topics,
        videoUrl,
        coverUrl,
        plan: draftPlan,
      }

      await this.aiLogRepository.updateById(aiLogId, {
        $set: {
          status: AiLogStatus.Success,
          model,
          duration: Date.now() - startTime,
          response,
        },
      })
    }
    catch (error) {
      this.logger.error(error, `v2 generateContentV2 failed aiLogId=${aiLogId}, userId=${userId}, groupId=${groupId}`)
      throw new DraftGenerationError(
        getErrorMessage(error),
        error,
      )
    }
  }

  /**
   * V2 辅助方法：使用 Grok 生成视频并轮询结果
   */
  private async generateVideo(
    aiLogId: string,
    userId: string,
    userType: UserType,
    model: string,
    videoPrompt: string,
    imageUrls?: string[],
    duration?: number,
    resolution?: string,
    aspectRatio?: string,
    videoUrls?: string[],
    audioUrls?: string[],
  ): Promise<{ videoUrl: string }> {
    let task: { id: string }
    try {
      const modelConfig = this.getVideoDraftModelConfig(model)
      const mode = this.resolveVideoReferenceMode(modelConfig, videoUrls, audioUrls)
      task = await this.videoService.userVideoGeneration({
        userId,
        userType,
        model,
        prompt: videoPrompt,
        image: imageUrls,
        video_url: mode === 'video2video' ? videoUrls?.[0] : undefined,
        videos: mode === 'multi-ref' ? videoUrls : undefined,
        audios: mode === 'multi-ref' ? audioUrls : undefined,
        mode,
        duration,
        resolution,
        ratio: aspectRatio,
        metadata: { aspectRatio, resolution },
      })
    }
    catch (error) {
      const errorMessage = getErrorMessage(error)
      await this.aiLogRepository.updateById(aiLogId, {
        $set: {
          status: AiLogStatus.Failed,
          errorMessage,
        },
      })
      throw error
    }

    this.logger.log({ aiLogId, taskId: task.id, model, duration, aspectRatio }, 'V2: video generation started')

    const url = await poll<string>(
      async () => {
        const result = await this.videoService.getVideoTaskStatus({ taskId: task.id, userId, userType })
        if (result.status === TaskStatus.Success) {
          return { done: true, data: result.videoUrl }
        }
        if (result.status === TaskStatus.Failure) {
          return { done: true, error: result.error?.message }
        }
        return { done: false }
      },
      {
        maxPollingMs: 30 * 60 * 1000,
        taskName: `Video generation (${model})`,
      },
    )

    return { videoUrl: url }
  }

  // ==================== 图文草稿生成 ====================

  private hasUsableApiKey(value?: string): boolean {
    const raw = (value || '').trim()
    if (!raw || raw.length < 8) return false
    if (/^(?:replace[-_]?with|your[-_]|sk-xxx|placeholder|dummy|changeme)/i.test(raw)) return false
    return true
  }

  getDraftGenerationPricing(): ReturnType<typeof DraftGenerationPricingVo.create> {
    const openaiReady = this.hasUsableApiKey(config.ai.openai?.apiKey)
    const geminiReady = this.hasUsableApiKey(config.ai.gemini?.apiKey)
    const volcengineReady = this.hasUsableApiKey(config.ai.volcengine?.apiKey)
    const dashscopeReady = this.hasUsableApiKey(config.ai.dashscope?.apiKey)
    const grokReady = this.hasUsableApiKey(config.ai.grok?.apiKey)
    const relayReady = this.hasUsableApiKey(config.ai.relay?.apiKey)

    const allImageModels = config.ai.draftGeneration.imageModels
    const filteredImageModels = allImageModels.filter((m) => {
      if (isDreaminaModelName(m.model) || isCodexImageModelName(m.model)) return true
      if (m.model.startsWith('gemini-')) return geminiReady
      return openaiReady
    })
    const preferredImg = config.studio?.image?.model
    const imageModels = (filteredImageModels.length > 0 ? filteredImageModels : allImageModels)
      .slice()
      .sort((a, b) => (a.model === preferredImg ? -1 : b.model === preferredImg ? 1 : 0))

    const allVideoModels = config.ai.models.video.generation
    const filteredVideoModels = allVideoModels.filter((m) => {
      if (isDreaminaModelName(m.name)) return true
      if (m.channel === AiLogChannel.Volcengine) return volcengineReady
      if (m.channel === AiLogChannel.Dashscope) return dashscopeReady
      if (m.channel === AiLogChannel.Grok) return grokReady
      if (m.channel === AiLogChannel.OpenAI) return openaiReady
      if (m.channel === AiLogChannel.Relay) return relayReady
      return false
    })
    const preferredVid = config.studio?.video?.model
    const videoModels = (filteredVideoModels.length > 0 ? filteredVideoModels : allVideoModels)
      .slice()
      .sort((a, b) => (a.name === preferredVid ? -1 : b.name === preferredVid ? 1 : 0))

    return DraftGenerationPricingVo.create({ imageModels, videoModels })
  }

  /**
   * 创建图文草稿生成任务（同步阶段）
   */
  async createImageTextDrafts(userId: string, userType: UserType, dto: CreateImageTextDraftDto): Promise<string[]> {
    const resolvedGroupId = await this.resolveDraftGroupId(userId, dto.groupId)
    const draftType = dto.draftType ?? 'draft'
    const plannerModel = draftType === 'draft'
      ? (dto.plannerModel ?? config.studio?.planner?.model ?? config.ai.draftGeneration.planner.defaultModel ?? 'agy:default')
      : undefined
    if (
      plannerModel
      && !isLocalBridgeChatModel(plannerModel)
      && !config.ai.models.chat.some(model => model.name === plannerModel)
    ) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const fallbackImageModel = dto.imageModel || config.ai.draftGeneration.imageModels[0]?.model || 'dreamina-5.0'
    const imageModelConfig = draftType === 'draft'
      ? (config.ai.draftGeneration.imageModels.find(m => m.model === fallbackImageModel) ?? config.ai.draftGeneration.imageModels[0])
      : this.getImageTextDraftModelConfig(dto.imageModel)
    const runtimeImageModel = imageModelConfig?.runtimeModel ?? fallbackImageModel
    const queuePriority = imageModelConfig?.queuePriority
    const imageExecution = draftType === 'draft'
      ? undefined
      : this.resolveImageExecution(dto.imageModel, dto.imageUrls ?? [], dto.aspectRatio, dto.imageSize)
    const channel = draftType === 'draft' ? AiLogChannel.OpenAI : imageExecution!.channel
    const effectiveLogModel = draftType === 'draft' ? (plannerModel || 'agy:default') : dto.imageModel

    const quantity = dto.quantity ?? 1
    const aiLogIds: string[] = []

    for (let i = 0; i < quantity; i++) {
      const aiLog = await this.aiLogRepository.create({
        userId,
        userType,
        type: AiLogType.DraftGeneration,
        model: effectiveLogModel,
        channel,
        status: AiLogStatus.Generating,
        startedAt: new Date(),
        request: {
          groupId: resolvedGroupId,
          version: 'v2-image-text',
          imageModel: effectiveLogModel,
          imageCount: dto.imageCount,
          imageSize: dto.imageSize,
          aspectRatio: dto.aspectRatio,
          prompt: dto.prompt,
          captionPrompt: dto.captionPrompt,
          imageUrls: dto.imageUrls,
          draftType,
          plannerModel,
          runtimeImageModel,
          queuePriority,
          ...(imageExecution ? { imageExecution } : {}),
        },
        response: {},
      })

      await this.addDraftGenerationJob({
        aiLogId: aiLog.id,
        userId,
        userType,
        groupId: resolvedGroupId,
        version: 'v2-image-text',
        prompt: dto.prompt,
        captionPrompt: dto.captionPrompt,
        imageUrls: dto.imageUrls,
        imageModel: dto.imageModel,
        imageCount: dto.imageCount ?? 3,
        imageSize: dto.imageSize,
        aspectRatio: dto.aspectRatio,
        imageTextDraftType: draftType,
        platforms: dto.platforms,
        plannerModel,
        disableMemory: dto.disableMemory,
        queuePriority,
      })

      aiLogIds.push(aiLog.id)
    }

    return aiLogIds
  }

  /**
   * 图文草稿内容生成（异步阶段，由 Consumer 调用）
   *
   * 流程：
   * 1. 规划模型生成 title / description / topics / imagePrompts
   * 2. 根据 imageModel 批量生成图片（Gemini 或 GPT Image）
   * 3. 保存素材（类型 ARTICLE）+ 更新 AiLog
   */
  async generateContentImageText(
    aiLogId: string,
    userId: string,
    userType: UserType,
    groupId: string,
    options: {
      prompt: string
      captionPrompt?: string
      imageUrls?: string[]
      imageModel: string
      imageCount: number
      imageSize?: string
      aspectRatio?: string
      draftType?: ImageTextDraftType
      platforms?: string[]
      plannerModel?: string
      disableMemory?: boolean
    },
  ): Promise<void> {
    const existingAiLog = await this.aiLogRepository.getById(aiLogId)
    const existing = (existingAiLog?.response ?? {}) as ImageTextDraftResponse
    const startTime = Date.now()
    const draftType = options.draftType ?? 'draft'
    const targetImageCount = options.imageCount

    try {
      const referenceImageUrls = options.imageUrls ?? []

      // 草稿模式：仅使用大语言模型生成纯文本图文文案草稿（若用户上传了参考图则附带保存，不调用生图模型）
      if (draftType === 'draft') {
        let plan = existing.plan
        let usedPlannerModel = options.plannerModel ?? config.studio?.planner?.model ?? config.ai.draftGeneration.planner.defaultModel ?? 'agy:default'
        if (!plan?.title) {
          const memoryItems = options.disableMemory
            ? []
            : (await this.draftGenerationMemoryService.getPlannerMemoryContext(userId, DraftGenerationMemoryContentType.ImageText)).memoryItems
          const planned = await this.draftGenerationPlannerService.planImageText({
            userId,
            userType,
            contentType: DraftGenerationMemoryContentType.ImageText,
            plannerModel: usedPlannerModel,
            userPrompt: options.prompt,
            captionPrompt: options.captionPrompt,
            memoryItems,
            referenceImageUrls,
            platforms: options.platforms,
            imageModel: usedPlannerModel,
            imageCount: Math.max(1, targetImageCount || 3),
            imageSize: options.imageSize,
            aspectRatio: options.aspectRatio,
          })
          plan = planned.plan
          usedPlannerModel = planned.model

          await this.aiLogRepository.updateById(aiLogId, {
            $set: { 'response.plan': plan, 'request.plannerModel': planned.model },
          })
        }

        const draftPlan = plan!
        const shotTips = (draftPlan.imagePrompts || []).filter(Boolean)
        const articleDesc = [
          draftPlan.description?.trim(),
          shotTips.length > 0 && referenceImageUrls.length === 0
            ? `【配图构想建议】\n${shotTips.map((tip, i) => `${i + 1}. ${tip}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n\n')

        const coverUrl = referenceImageUrls[0] || undefined
        const materialId = existing.materialId ?? (await this.materialRepository.create({
          userId,
          userType,
          groupId,
          type: MaterialType.ARTICLE,
          source: MaterialSource.PlaceDraft,
          status: MaterialStatus.SUCCESS,
          title: draftPlan.title,
          desc: articleDesc,
          topics: draftPlan.topics,
          ...(coverUrl ? { coverUrl } : {}),
          mediaList: referenceImageUrls.map(url => ({ url, type: MediaType.IMG })),
          useCount: 0,
          autoDeleteMedia: false,
          model: usedPlannerModel,
          generationParams: {
            ...options,
            plannerModel: usedPlannerModel,
            textOnlyDraft: true,
          },
          accountTypes: (options.platforms as AccountType[]) ?? getCompatibleAccountTypes({
            type: 'article',
            title: draftPlan.title,
            desc: articleDesc,
            topics: draftPlan.topics,
            imageCount: referenceImageUrls.length,
            aspectRatio: options.aspectRatio,
          }),
        })).id

        const response: ImageTextDraftResponse = {
          materialId,
          title: draftPlan.title,
          description: articleDesc,
          topics: draftPlan.topics,
          ...(coverUrl ? { coverUrl } : {}),
          imageUrls: referenceImageUrls,
          requestedImageCount: 0,
          generatedImageCount: referenceImageUrls.length,
          plan: draftPlan,
        }

        await this.aiLogRepository.updateById(aiLogId, {
          $set: {
            status: AiLogStatus.Success,
            model: usedPlannerModel,
            duration: Date.now() - startTime,
            response,
          },
        })
        return
      }

      const imageExecution = this.resolveImageExecution(options.imageModel, referenceImageUrls, options.aspectRatio, options.imageSize)
      this.logger.log(
        {
          aiLogId,
          imageModel: options.imageModel,
          imageCount: options.imageCount,
          aspectRatio: options.aspectRatio,
          refImageCount: referenceImageUrls.length,
          draftType,
          referenceHandling: imageExecution.referenceHandling,
          resolvedSize: imageExecution.resolvedSize,
        },
        'ImageText: Starting generation',
      )

      let plan: ImageTextDraftPlanResult | undefined
      let imagePromptTasks: ImageGenerationPrompt[]
      if (draftType === 'image') {
        imagePromptTasks = Array.from({ length: targetImageCount }, (_, promptIndex) => ({
          prompt: options.prompt,
          promptIndex,
        }))
      }
      else {
        const existingPlan = existing.plan
        if (existingPlan && existingPlan.imagePrompts.length >= targetImageCount) {
          plan = existingPlan
          this.logger.log({ aiLogId }, 'ImageText: Reusing plan from previous attempt')
        }
        else {
          const memoryItems = options.disableMemory
            ? []
            : (await this.draftGenerationMemoryService.getPlannerMemoryContext(userId, DraftGenerationMemoryContentType.ImageText)).memoryItems
          const planned = await this.draftGenerationPlannerService.planImageText({
            userId, userType,
            contentType: DraftGenerationMemoryContentType.ImageText,
            plannerModel: options.plannerModel,
            userPrompt: options.prompt,
            captionPrompt: options.captionPrompt,
            memoryItems,
            referenceImageUrls,
            platforms: options.platforms,
            imageModel: options.imageModel,
            imageCount: targetImageCount,
            imageSize: options.imageSize,
            aspectRatio: options.aspectRatio,
          })
          plan = planned.plan

          await this.aiLogRepository.updateById(aiLogId, {
            $set: { 'response.plan': plan, 'request.plannerModel': planned.model },
          })

          this.logger.log(
            { aiLogId, title: plan.title, imagePromptsCount: plan.imagePrompts.length, plannerModel: planned.model },
            'ImageText: Planning completed',
          )
        }

        imagePromptTasks = plan.imagePrompts
          .slice(0, targetImageCount)
          .map((prompt, promptIndex) => ({ prompt, promptIndex }))
      }
      let generatedImageUrls = (existing.imageUrls ?? []).slice(0, targetImageCount)
      let totalCreditsUsed: number | undefined = existing.creditsUsed
      const updateImageProgress = async (
        imageUrls: string[],
        imageGenerationErrors: ImageGenerationErrorDetail[] = [],
      ) => {
        const response: Record<string, unknown> = {
          'response.imageUrls': [...imageUrls],
          'response.requestedImageCount': targetImageCount,
          'response.generatedImageCount': imageUrls.length,
          'response.imageGenerationErrors': [...imageGenerationErrors],
        }
        if (plan) {
          response['response.plan'] = plan
        }
        await this.aiLogRepository.updateById(aiLogId, {
          $set: response,
        })
      }

      if (generatedImageUrls.length > 0) {
        this.logger.log({ aiLogId, count: generatedImageUrls.length, targetImageCount }, 'ImageText: Reusing images from previous attempt')
      }

      if (generatedImageUrls.length < targetImageCount) {
        const missingPromptTasks = imagePromptTasks.slice(generatedImageUrls.length, targetImageCount)
        const previousGeneratedImageCount = generatedImageUrls.length
        const progressImageUrls = [...generatedImageUrls]
        const { urls, imageGenerationErrors, creditsUsed } = await this.generateImages(
          userId,
          userType,
          options.imageModel,
          missingPromptTasks,
          imageExecution,
          referenceImageUrls,
          options.aspectRatio,
          options.imageSize,
          async (imageUrl, imageGenerationErrors) => {
            if (progressImageUrls.length < targetImageCount) {
              progressImageUrls.push(imageUrl)
            }
            await updateImageProgress(progressImageUrls, [
              ...(existing.imageGenerationErrors ?? []),
              ...imageGenerationErrors,
            ])
          },
        )
        if (typeof creditsUsed === 'number' && Number.isFinite(creditsUsed)) {
          totalCreditsUsed = Math.round(((totalCreditsUsed ?? 0) + creditsUsed) * 100) / 100
        }
        generatedImageUrls = progressImageUrls.length > previousGeneratedImageCount
          ? progressImageUrls.slice(0, targetImageCount)
          : [...generatedImageUrls, ...urls].slice(0, targetImageCount)

        await updateImageProgress(generatedImageUrls, imageGenerationErrors)

        this.logger.log(
          { aiLogId, generatedCount: generatedImageUrls.length, targetImageCount, errorCount: imageGenerationErrors.length },
          'ImageText: Image generation completed',
        )

        if (generatedImageUrls.length < targetImageCount) {
          const firstReason = imageGenerationErrors[0]?.errorMessage
            ?.replace(/^LocalBridge\s+\S+\s+failed\s*\(\d+\):\s*/i, '')
            .trim()
          throw new Error(
            firstReason
              ? `图片生成失败（成功 ${generatedImageUrls.length}/${targetImageCount} 张）：${firstReason}`
              : `ImageText: generated ${generatedImageUrls.length}/${targetImageCount} images`,
          )
        }
      }

      if (draftType === 'image') {
        const mediaIds = (existing.mediaIds ?? []).slice(0, targetImageCount)
        for (const imageUrl of generatedImageUrls.slice(mediaIds.length)) {
          const media = await this.mediaRepository.create({
            userId,
            userType,
            materialGroupId: groupId,
            type: MediaType.IMG,
            url: imageUrl,
          })
          mediaIds.push(media.id)
        }

        const response: ImageTextDraftResponse = {
          mediaIds,
          imageUrls: generatedImageUrls,
          requestedImageCount: targetImageCount,
          generatedImageCount: generatedImageUrls.length,
          ...(totalCreditsUsed !== undefined ? { creditsUsed: totalCreditsUsed } : {}),
        }
        await this.aiLogRepository.updateById(aiLogId, {
          $set: {
            status: AiLogStatus.Success,
            model: options.imageModel,
            duration: Date.now() - startTime,
            response,
          },
        })

        return
      }

      // draft 类型：复用已有 materialId 或创建新素材
      const coverUrl = generatedImageUrls[0]
      const draftPlan = plan!

      const materialId = existing.materialId ?? (await this.materialRepository.create({
        userId,
        userType,
        groupId,
        type: MaterialType.ARTICLE,
        source: MaterialSource.PlaceDraft,
        status: MaterialStatus.SUCCESS,
        title: draftPlan.title,
        desc: draftPlan.description,
        topics: draftPlan.topics,
        coverUrl,
        mediaList: generatedImageUrls.map(url => ({ url, type: MediaType.IMG })),
        useCount: 0,
        autoDeleteMedia: false,
        model: options.imageModel,
        generationParams: {
          model: options.imageModel,
          ...options,
        },
        accountTypes: (options.platforms as AccountType[]) ?? getCompatibleAccountTypes({
          type: 'article',
          title: draftPlan.title,
          desc: draftPlan.description,
          topics: draftPlan.topics,
          imageCount: generatedImageUrls.length,
          aspectRatio: options.aspectRatio,
        }),
      })).id

      const response: ImageTextDraftResponse = {
        materialId,
        title: draftPlan.title,
        description: draftPlan.description,
        topics: draftPlan.topics,
        coverUrl,
        imageUrls: generatedImageUrls,
        requestedImageCount: targetImageCount,
        generatedImageCount: generatedImageUrls.length,
        ...(totalCreditsUsed !== undefined ? { creditsUsed: totalCreditsUsed } : {}),
        plan: draftPlan,
      }

      await this.aiLogRepository.updateById(aiLogId, {
        $set: {
          status: AiLogStatus.Success,
          model: options.imageModel,
          duration: Date.now() - startTime,
          response,
        },
      })
    }
    catch (error) {
      this.logger.error(error, `v2 generateContentImageText failed aiLogId=${aiLogId}, userId=${userId}, groupId=${groupId}`)
      throw new DraftGenerationError(
        getErrorMessage(error),
        error,
      )
    }
  }

  /**
   * 根据模型类型批量生成图片
   */
  private async generateImages(
    userId: string,
    userType: UserType,
    imageModel: string,
    imagePrompts: ImageGenerationPrompt[],
    imageExecution: ResolvedImageExecution,
    referenceImageUrls: string[],
    aspectRatio?: string,
    imageSize?: string,
    onImageGenerated?: ImageGenerationProgressHandler,
  ): Promise<{ urls: string[], imageGenerationErrors: ImageGenerationErrorDetail[], creditsUsed?: number }> {
    if (imageExecution.mode === 'dreamina') {
      return this.generateImagesWithDreamina(userId, userType, imageModel, imagePrompts, referenceImageUrls, aspectRatio, imageSize, onImageGenerated)
    }

    if (imageExecution.mode === 'codex-image') {
      return this.generateImagesWithCodex(userId, userType, imageModel, imagePrompts, referenceImageUrls, aspectRatio, imageSize, onImageGenerated)
    }

    if (imageExecution.mode === 'gemini') {
      return this.generateImagesWithGemini(userId, userType, imageModel, imagePrompts, referenceImageUrls, aspectRatio, imageSize, onImageGenerated)
    }

    return this.generateImagesWithOpenAI(userId, userType, imageModel, imagePrompts, imageExecution, referenceImageUrls, imageSize, onImageGenerated)
  }

  private async generateImagesWithCodex(
    userId: string,
    userType: UserType,
    model: string,
    imagePrompts: ImageGenerationPrompt[],
    referenceImageUrls: string[],
    aspectRatio?: string,
    imageSize?: string,
    onImageGenerated?: ImageGenerationProgressHandler,
  ): Promise<{ urls: string[], imageGenerationErrors: ImageGenerationErrorDetail[], creditsUsed?: number }> {
    const urls: string[] = []
    const imageGenerationErrors: ImageGenerationErrorDetail[] = []

    for (const { prompt, promptIndex } of imagePrompts) {
      this.logger.log({ model, promptIndex, aspectRatio, imageSize }, 'ImageText: Generating image with Codex CLI built-in image_gen')
      try {
        const result = await this.imageService.userCodexGeneration({
          userId,
          userType,
          model,
          prompt,
          imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          aspectRatio,
          imageSize,
          count: 1,
        })
        const remainingSlots = imagePrompts.length - urls.length
        if (remainingSlots <= 0) break
        for (const image of result.images.slice(0, remainingSlots)) {
          urls.push(image.url)
          await onImageGenerated?.(image.url, imageGenerationErrors)
        }
        if (urls.length >= imagePrompts.length) break
      }
      catch (error) {
        imageGenerationErrors.push({
          promptIndex,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        this.logger.warn(error, `ImageText: Codex image generation failed for promptIndex=${promptIndex}`)
      }
    }

    return { urls, imageGenerationErrors, creditsUsed: 0 }
  }

  private async generateImagesWithDreamina(
    userId: string,
    userType: UserType,
    model: string,
    imagePrompts: ImageGenerationPrompt[],
    referenceImageUrls: string[],
    aspectRatio?: string,
    imageSize?: string,
    onImageGenerated?: ImageGenerationProgressHandler,
  ): Promise<{ urls: string[], imageGenerationErrors: ImageGenerationErrorDetail[], creditsUsed?: number }> {
    const urls: string[] = []
    const imageGenerationErrors: ImageGenerationErrorDetail[] = []
    let creditsUsedTotal: number | undefined

    const addCredits = (delta?: number) => {
      if (typeof delta === 'number' && Number.isFinite(delta) && delta >= 0) {
        creditsUsedTotal = Math.round(((creditsUsedTotal ?? 0) + delta) * 100) / 100
      }
    }

    // Fast path: when all prompts are identical (e.g. image-only batch N images), request them in one Dreamina call
    const allSamePrompt = imagePrompts.length > 1 && imagePrompts.every(item => item.prompt === imagePrompts[0].prompt)
    if (allSamePrompt) {
      this.logger.log({ model, count: imagePrompts.length, aspectRatio, imageSize }, 'ImageText: Batch generating identical prompts with Dreamina CLI')
      try {
        const result = await this.imageService.userDreaminaGeneration({
          userId,
          userType,
          model,
          prompt: imagePrompts[0].prompt,
          imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          aspectRatio,
          imageSize,
          count: imagePrompts.length,
        })
        addCredits((result as { creditsUsed?: number }).creditsUsed)
        for (const image of result.images.slice(0, imagePrompts.length)) {
          urls.push(image.url)
          await onImageGenerated?.(image.url, imageGenerationErrors)
        }
        if (urls.length >= imagePrompts.length) {
          return { urls, imageGenerationErrors, creditsUsed: creditsUsedTotal }
        }
      }
      catch (error) {
        imageGenerationErrors.push({
          promptIndex: 0,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        this.logger.warn(error, 'ImageText: Dreamina batch image generation failed')
        return { urls, imageGenerationErrors, creditsUsed: creditsUsedTotal }
      }
    }

    for (const { prompt, promptIndex } of imagePrompts.slice(urls.length)) {
      this.logger.log({ model, promptIndex, aspectRatio, imageSize }, 'ImageText: Generating image with Dreamina CLI')
      try {
        const result = await this.imageService.userDreaminaGeneration({
          userId,
          userType,
          model,
          prompt,
          imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          aspectRatio,
          imageSize,
          count: 1,
        })
        addCredits((result as { creditsUsed?: number }).creditsUsed)
        const remainingSlots = imagePrompts.length - urls.length
        if (remainingSlots <= 0) break
        for (const image of result.images.slice(0, remainingSlots)) {
          urls.push(image.url)
          await onImageGenerated?.(image.url, imageGenerationErrors)
        }
        if (urls.length >= imagePrompts.length) break
      }
      catch (error) {
        imageGenerationErrors.push({
          promptIndex,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        this.logger.warn(error, `ImageText: Dreamina image generation failed for promptIndex=${promptIndex}`)
      }
    }

    return { urls, imageGenerationErrors, creditsUsed: creditsUsedTotal }
  }

  /**
   * 使用 Gemini 模型（nb2/nb-pro）批量生成图片
   */
  private async generateImagesWithGemini(
    userId: string,
    userType: UserType,
    model: string,
    imagePrompts: ImageGenerationPrompt[],
    referenceImageUrls: string[],
    aspectRatio?: string,
    imageSize?: string,
    onImageGenerated?: ImageGenerationProgressHandler,
  ): Promise<{ urls: string[], imageGenerationErrors: ImageGenerationErrorDetail[] }> {
    const urls: string[] = []
    const imageGenerationErrors: ImageGenerationErrorDetail[] = []

    for (const { prompt, promptIndex } of imagePrompts) {
      this.logger.log(
        { model, promptIndex, promptLength: prompt.length, aspectRatio, imageSize },
        'ImageText: Generating image with Gemini',
      )

      try {
        const result = await retry(
          () => this.imageService.userGeminiGeneration({
            userId,
            userType,
            model: model as 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview',
            prompt,
            imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
            ...(imageSize ? { imageSize: imageSize as '1K' | '2K' | '4K' } : {}),
            ...(aspectRatio ? { aspectRatio: aspectRatio as '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9' } : {}),
          }),
          {
            maxRetries: 3,
            delayMs: 1000,
            onRetry: (error, attempt) => {
              this.logger.warn(
                error,
                `ImageText: Gemini image generation failed, retrying promptIndex=${promptIndex}, attempt=${attempt}`,
              )
            },
          },
        )

        const remainingSlots = imagePrompts.length - urls.length
        if (remainingSlots <= 0) {
          break
        }

        if (result.images.length > 0) {
          const generatedUrls = result.images.slice(0, remainingSlots).map(image => image.url)
          for (const imageUrl of generatedUrls) {
            urls.push(imageUrl)
            await onImageGenerated?.(imageUrl, imageGenerationErrors)
          }
        }

        if (urls.length >= imagePrompts.length) {
          break
        }
      }
      catch (error) {
        imageGenerationErrors.push({
          promptIndex,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        this.logger.warn(
          error,
          `ImageText: Failed to generate image after retries, skipping promptIndex=${promptIndex}`,
        )
      }
    }

    return { urls, imageGenerationErrors }
  }

  private async generateImagesWithOpenAI(
    userId: string,
    userType: UserType,
    model: string,
    imagePrompts: ImageGenerationPrompt[],
    imageExecution: ResolvedImageExecution,
    referenceImageUrls: string[],
    imageSize?: string,
    onImageGenerated?: ImageGenerationProgressHandler,
  ): Promise<{ urls: string[], imageGenerationErrors: ImageGenerationErrorDetail[] }> {
    const urls: string[] = []
    const imageGenerationErrors: ImageGenerationErrorDetail[] = []

    for (const { prompt, promptIndex } of imagePrompts) {
      this.logger.log(
        {
          model,
          promptIndex,
          promptLength: prompt.length,
          resolvedSize: imageExecution.resolvedSize,
          referenceHandling: imageExecution.referenceHandling,
        },
        'ImageText: Generating image with standard image service',
      )

      try {
        const result = await retry(
          async () => {
            if (imageExecution.mode === 'openai-edit') {
              if (referenceImageUrls.length === 0) {
                throw new Error('ImageText: missing reference images for edit mode')
              }

              return this.imageService.userEdit({
                userId,
                userType,
                model,
                image: referenceImageUrls,
                prompt,
                n: 1,
                size: imageExecution.resolvedSize,
              })
            }

            return this.imageService.userGeneration({
              userId,
              userType,
              model,
              prompt,
              n: 1,
              size: imageExecution.resolvedSize,
            })
          },
          {
            maxRetries: 3,
            delayMs: 1000,
            onRetry: (error, attempt) => {
              this.logger.warn(
                error,
                `ImageText: Standard image generation failed, retrying promptIndex=${promptIndex}, attempt=${attempt}`,
              )
            },
          },
        )

        const remainingSlots = imagePrompts.length - urls.length
        if (remainingSlots <= 0) {
          break
        }

        const generatedUrls = result.list
          .map(item => item.url)
          .filter((url): url is string => !!url)

        if (generatedUrls.length > 0) {
          for (const imageUrl of generatedUrls.slice(0, remainingSlots)) {
            urls.push(imageUrl)
            await onImageGenerated?.(imageUrl, imageGenerationErrors)
          }
        }

        if (urls.length >= imagePrompts.length) {
          break
        }
      }
      catch (error) {
        imageGenerationErrors.push({
          promptIndex,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        this.logger.warn(
          error,
          `ImageText: Failed to generate image after retries, skipping promptIndex=${promptIndex}`,
        )
      }
    }

    return { urls, imageGenerationErrors }
  }

  /**
   * 视频 URL 生成草稿：使用 Gemini 多模态模型分析视频内容，生成文案并保存草稿
   *
   * 流程：
   * 1. 解析素材组（默认草稿箱）
   * 2. Gemini Flash 分析视频 URL → 生成 title / description / topics
   * 3. 从视频截帧生成封面
   * 4. 保存 Material 草稿
   */
  async generateDraftFromVideoUrl(
    userId: string,
    userType: UserType,
    dto: CreateDraftFromVideoUrlDto,
  ): Promise<{ materialId: string }> {
    const resolvedGroupId = await this.resolveDraftGroupId(userId, dto.groupId)
    const modelName = 'gemini-3.5-flash'
    const startedAt = new Date()
    const fullVideoUrl = FileUtil.buildUrl(dto.videoUrl)

    const prompt = `You are a TikTok content generation assistant.
## Task
Watch the video and generate TikTok post metadata based on its content.

## Instructions
- **title**: Catchy title under 30 characters, in the language that best matches the video content
- **description**: Engaging description with call-to-action, under 2200 characters, in the language matching the video content
- **topics**: 3-5 relevant hashtags (without # prefix)
- **IMPORTANT**: Do NOT generate any content featuring children, minors, or anyone appearing under 18.
Return the result as JSON.`

    const model = new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey: config.ai.gemini.apiKey,
      baseUrl: config.ai.gemini.baseUrl,
      temperature: 1.0,
    })

    const messageContent: Array<
      { type: 'video', url: string }
      | { type: 'text', text: string }
    > = [
      { type: 'video', url: fullVideoUrl },
      { type: 'text', text: prompt },
    ]

    const structuredModel = model.withStructuredOutput(z.toJSONSchema(VideoDraftMetadataResultSchema), { includeRaw: true })
    const { parsed: structuredResult, raw } = await this.aiAvailability.execute(
      { provider: 'gemini', operation: 'draftGeneration.generateDraftFromVideoUrl', model: modelName },
      async () => structuredModel.invoke([
        new HumanMessage({ content: messageContent }),
      ]),
    )

    if (!structuredResult) {
      throw new Error('VideoUrl: No response from Gemini')
    }

    const parsed = z.safeParse(VideoDraftMetadataResultSchema, structuredResult)
    if (!parsed.success) {
      throw new Error(`VideoUrl: Invalid plan result: ${z.prettifyError(parsed.error)}`)
    }

    const plan = parsed.data
    const duration = Date.now() - startedAt.getTime()
    await this.aiLogRepository.create({
      userId,
      userType,
      type: AiLogType.Chat,
      action: 'draft-metadata',
      model: modelName,
      channel: AiLogChannel.Gemini,
      startedAt,
      duration,
      request: { videoUrl: dto.videoUrl },
      response: { ...plan, usage: 'usage_metadata' in raw ? raw.usage_metadata : undefined },
      status: AiLogStatus.Success,
    })

    this.logger.log({ plan }, 'VideoUrl: Plan generated')

    let coverUrl: string | undefined
    try {
      const thumbnailBuffer = await this.videoMetadataService.extractThumbnailFromUrl(fullVideoUrl, 2)
      const uploadResult = await this.assetsService.uploadFromBuffer(userId, thumbnailBuffer, {
        type: AssetType.VideoThumbnail,
        mimeType: 'image/png',
        filename: 'thumbnail.png',
      })
      coverUrl = uploadResult.asset.path
    }
    catch (error) {
      this.logger.warn(error, `VideoUrl: Failed to extract video thumbnail, proceeding without cover videoUrl=${dto.videoUrl}`)
    }

    const material = await this.materialRepository.create({
      userId,
      userType,
      groupId: resolvedGroupId,
      type: MaterialType.VIDEO,
      source: MaterialSource.PlaceDraft,
      status: MaterialStatus.SUCCESS,
      title: plan.title,
      desc: plan.description,
      topics: plan.topics,
      coverUrl,
      mediaList: [{ url: dto.videoUrl, type: MediaType.VIDEO, thumbUrl: coverUrl }],
      useCount: 0,
      autoDeleteMedia: false,
      model: modelName,
      generationParams: {
        model: modelName,
        videoUrl: dto.videoUrl,
      },
      accountTypes: dto.platforms ?? getCompatibleAccountTypes({
        type: 'video',
        title: plan.title,
        desc: plan.description,
        topics: plan.topics,
      }),
    })

    return { materialId: material.id }
  }

  private async resolveDraftGroupId(userId: string, groupId?: string): Promise<string> {
    if (groupId) {
      const group = await this.materialGroupRepository.getInfo(groupId)
      if (!group || group.userId !== userId) {
        throw new AppException(ResponseCode.MaterialGroupNotFound)
      }
      return group.id
    }

    const defaultGroup = await this.materialGroupRepository.getDefaultGroup(userId)
    if (!defaultGroup) {
      throw new AppException(ResponseCode.MaterialGroupNotFound)
    }

    return defaultGroup.id
  }
}
