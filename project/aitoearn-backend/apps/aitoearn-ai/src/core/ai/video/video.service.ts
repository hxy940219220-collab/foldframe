import { Injectable, Logger, Optional } from '@nestjs/common'
import { AssetsService, VideoMetadataService } from '@yikart/assets'
import { AppException, FileUtil, ResponseCode } from '@yikart/common'
import {
  AiLogChannel,
  AiLogRepository,
  AiLogStatus,
  AiLogType,
  AssetType,
  MaterialGroupRepository,
  MediaRepository,
  MediaType,
  UserRepository,
} from '@yikart/mongodb'
import { TaskStatus } from '../../../common'
import { isDreaminaModelName, LocalBridgeService } from '../../local-bridge'
import { ModelsConfigService } from '../models-config'
import { DashscopeVideoService } from './dashscope'
import { GrokVideoService } from './grok'
import { OpenAIVideoService } from './openai'
import { RelayVideoService } from './relay/relay-video.service'
import { VideoAiLog } from './video-ai-log.interface'
import {
  UserListVideoTasksQueryDto,
  UserVideoGenerationRequestDto,
  UserVideoTaskQueryDto,
  VideoGenerationModelsQueryDto,
} from './video.dto'
import { VideoTaskInput } from './video.vo'
import { VolcengineVideoService } from './volcengine/volcengine.service'

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name)
  private readonly dreaminaLastPollAt = new Map<string, number>()

  constructor(
    private readonly userRepo: UserRepository,
    private readonly aiLogRepo: AiLogRepository,
    private readonly modelsConfigService: ModelsConfigService,
    private readonly assetsService: AssetsService,
    private readonly videoMetadataService: VideoMetadataService,
    private readonly materialGroupRepository: MaterialGroupRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly volcengineVideoService: VolcengineVideoService,
    private readonly openaiVideoService: OpenAIVideoService,
    private readonly grokVideoService: GrokVideoService,
    private readonly dashscopeVideoService: DashscopeVideoService,
    @Optional() private readonly relayVideoService?: RelayVideoService,
    @Optional() private readonly localBridgeService?: LocalBridgeService,
  ) {}

  isDreaminaLog(aiLog: { model?: string, request?: Record<string, unknown> }): boolean {
    return Boolean(aiLog.request?.['localProvider'] === 'dreamina' || isDreaminaModelName(aiLog.model))
  }

  private collectUrlList(single?: string | string[], extra?: string, list?: string[]): string[] {
    const out: string[] = []
    if (Array.isArray(single)) out.push(...single)
    else if (single) out.push(single)
    if (extra) out.push(extra)
    if (Array.isArray(list)) out.push(...list)
    return [...new Set(out.filter(Boolean).map(u => FileUtil.buildUrl(u)))]
  }

  private async submitDreaminaVideo(request: UserVideoGenerationRequestDto): Promise<{ id: string }> {
    if (!this.localBridgeService) {
      throw new AppException(ResponseCode.AiCallFailed, 'Local bridge service unavailable for Dreamina CLI')
    }
    const startedAt = new Date()
    const imageUrls = this.collectUrlList(request.image, request.image_tail, request.images)
    const videoUrls = this.collectUrlList(request.video_url, undefined, request.videos)
    const audioUrls = this.collectUrlList(undefined, undefined, request.audios)
    const aspectRatio = request.ratio || (request.metadata?.['aspectRatio'] as string | undefined) || '16:9'
    const resolution = request.resolution || (request.metadata?.['resolution'] as string | undefined) || '720p'

    const submitted = await this.localBridgeService.dreaminaSubmitVideo({
      prompt: request.prompt,
      modelVersion: request.model,
      mode: request.mode,
      duration: request.duration,
      resolution,
      aspectRatio,
      imageUrls,
      videoUrls,
      audioUrls,
    })

    const aiLog = await this.aiLogRepo.create({
      userId: request.userId,
      userType: request.userType,
      taskId: submitted.submitId,
      model: request.model,
      channel: AiLogChannel.Relay,
      startedAt,
      type: AiLogType.Video,
      request: {
        ...request,
        localProvider: 'dreamina',
        remoteTaskId: submitted.submitId,
      },
      response: {
        id: submitted.submitId,
        status: 'in_progress',
        duration: submitted.duration,
      },
      status: AiLogStatus.Generating,
    })

    return { id: aiLog.id }
  }

  async pollDreaminaVideoTask(aiLogId: string, force = false): Promise<void> {
    if (!this.localBridgeService) return
    const lastAt = this.dreaminaLastPollAt.get(aiLogId) || 0
    if (!force && Date.now() - lastAt < 4000) return
    this.dreaminaLastPollAt.set(aiLogId, Date.now())

    const aiLog = await this.aiLogRepo.getById(aiLogId)
    if (!aiLog || aiLog.status !== AiLogStatus.Generating || !aiLog.taskId || !this.isDreaminaLog(aiLog as unknown as { model?: string, request?: Record<string, unknown> })) {
      return
    }

    try {
      const status = await this.localBridgeService.dreaminaGetVideoStatus(aiLog.taskId)
      if (status.status === 'in_progress') {
        return
      }

      const elapsedMs = Date.now() - aiLog.startedAt.getTime()
      if (status.status === 'completed' && (status.fileUrl || status.remoteUrl)) {
        const downloaded = await this.localBridgeService.dreaminaDownloadFile(status.fileUrl || status.remoteUrl!)
        const uploaded = await this.assetsService.uploadFromBuffer(aiLog.userId, downloaded.buffer, {
          type: AssetType.AiVideo,
          mimeType: downloaded.mimeType || 'video/mp4',
        }, aiLog.model)

        const videoSeconds = status.duration ?? ((aiLog.request as Record<string, unknown>)?.['duration'] as number | undefined)
        const updated = await this.aiLogRepo.updateByIdAndStatus(aiLog.id, AiLogStatus.Generating, {
          $set: {
            status: AiLogStatus.Success,
            duration: elapsedMs,
            response: {
              id: aiLog.taskId,
              status: 'success',
              videoUrl: uploaded.asset.path,
              duration: videoSeconds,
              ...(status.creditsUsed !== undefined ? { creditsUsed: status.creditsUsed } : {}),
              ...(status.creditsRemaining !== undefined ? { creditsRemaining: status.creditsRemaining } : {}),
            },
          },
        })
        if (updated) {
          this.dreaminaLastPollAt.delete(aiLogId)
          await this.ensureSavedMediaByAiLogId(aiLog.id)
        }
        return
      }

      const errorMessage = status.error || '即梦视频生成失败'
      await this.aiLogRepo.updateByIdAndStatus(aiLog.id, AiLogStatus.Generating, {
        $set: {
          status: AiLogStatus.Failed,
          duration: elapsedMs,
          errorMessage,
          response: {
            id: aiLog.taskId,
            status: 'failed',
            error: { message: errorMessage },
          },
        },
      })
      this.dreaminaLastPollAt.delete(aiLogId)
    }
    catch (error) {
      this.logger.warn({ aiLogId, error }, 'Dreamina video task poll failed, will retry')
    }
  }

  private requireChannel<T>(service: T | undefined): T {
    if (!service) {
      throw new AppException(ResponseCode.InvalidModel)
    }
    return service
  }

  /**
   * 用户视频生成（通用接口）
   */
  async userVideoGeneration(request: UserVideoGenerationRequestDto) {
    const { model, groupId, userId } = request

    if (groupId) {
      const group = await this.materialGroupRepository.getInfo(groupId)
      if (!group || group.userId !== userId) {
        throw new AppException(ResponseCode.MaterialGroupNotFound)
      }
    }

    const modelConfig = this.modelsConfigService.config.video.generation.find(m => m.name === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }
    if (request.mode && !(modelConfig.modes as readonly string[]).includes(request.mode)) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    let response: { id: string }

    if (isDreaminaModelName(model)) {
      response = await this.submitDreaminaVideo(request)
    }
    else {
      switch (modelConfig.channel) {
        case AiLogChannel.Volcengine:
          response = await this.volcengineVideoService.createFromRequest(request)
          break
        case AiLogChannel.OpenAI:
          response = await this.openaiVideoService.createFromRequest(request)
          break
        case AiLogChannel.Grok:
          response = await this.grokVideoService.createFromRequest(request)
          break
        case AiLogChannel.Dashscope:
          response = await this.dashscopeVideoService.createFromRequest(request)
          break
        case AiLogChannel.Relay:
          response = await this.requireChannel(this.relayVideoService).createFromRequest(request)
          break
        default:
          throw new AppException(ResponseCode.InvalidModel)
      }
    }

    if (groupId) {
      await this.aiLogRepo.updateById(response.id, {
        $set: {
          'request.groupId': groupId,
        },
      })
    }

    return {
      id: response.id,
      status: TaskStatus.Submitted,
    }
  }

  private extractInput(aiLog: VideoAiLog): VideoTaskInput {
    if (this.isDreaminaLog(aiLog as unknown as { model?: string, request?: Record<string, unknown> })) {
      const req = aiLog.request as Record<string, any>
      return {
        prompt: req.prompt || '',
        groupId: req.groupId,
        image: req.image,
        images: req.images,
        videoUrl: req.video_url,
        videos: req.videos,
        audios: req.audios,
        duration: req.duration,
        resolution: req.resolution,
        aspectRatio: req.ratio || req.metadata?.aspectRatio,
      }
    }

    let input: VideoTaskInput
    switch (aiLog.channel) {
      case AiLogChannel.Volcengine:
        input = this.volcengineVideoService.extractInput(aiLog.request)
        break
      case AiLogChannel.OpenAI:
        input = this.openaiVideoService.extractInput(aiLog.request)
        break
      case AiLogChannel.Grok:
        input = this.grokVideoService.extractInput(aiLog.request)
        break
      case AiLogChannel.Dashscope:
        input = this.dashscopeVideoService.extractInput(aiLog.request)
        break
      case AiLogChannel.Relay:
        input = this.requireChannel(this.relayVideoService).extractInput(aiLog.request)
        break
      default:
        input = { prompt: '' }
        break
    }

    return {
      ...input,
      groupId: aiLog.request.groupId,
    }
  }

  async transformToCommonResponse(aiLog: VideoAiLog) {
    const input = this.extractInput(aiLog)
    const savedMedia = await this.ensureSavedVideoMedia(aiLog)

    const base = {
      id: aiLog.id,
      model: aiLog.model,
      input,
      submittedAt: aiLog.startedAt,
      startedAt: aiLog.startedAt,
    }

    if (aiLog.status === AiLogStatus.Generating) {
      return {
        ...base,
        status: TaskStatus.InProgress,
        videoUrl: undefined,
        coverUrl: savedMedia.coverUrl ? FileUtil.buildUrl(savedMedia.coverUrl) : undefined,
        mediaId: savedMedia.mediaId,
        groupId: savedMedia.groupId,
        error: undefined,
        finishedAt: undefined,
      }
    }

    const finishedAt = aiLog.duration
      ? new Date(aiLog.startedAt.getTime() + aiLog.duration)
      : undefined

    if (aiLog.status === AiLogStatus.Failed) {
      return {
        ...base,
        status: TaskStatus.Failure,
        videoUrl: undefined,
        coverUrl: savedMedia.coverUrl ? FileUtil.buildUrl(savedMedia.coverUrl) : undefined,
        mediaId: savedMedia.mediaId,
        groupId: savedMedia.groupId,
        error: { message: aiLog.errorMessage ?? 'Video task failed' },
        finishedAt,
      }
    }

    if (!aiLog.response) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    const channelResult = this.getChannelTaskResult(aiLog)

    return {
      ...base,
      ...channelResult,
      coverUrl: savedMedia.coverUrl ? FileUtil.buildUrl(savedMedia.coverUrl) : undefined,
      mediaId: savedMedia.mediaId,
      groupId: savedMedia.groupId,
      finishedAt,
    }
  }

  async ensureSavedMediaByAiLogId(aiLogId: string): Promise<void> {
    const aiLog = await this.aiLogRepo.getById(aiLogId)
    if (!aiLog || aiLog.type !== AiLogType.Video) {
      return
    }

    switch (aiLog.channel) {
      case AiLogChannel.Volcengine:
      case AiLogChannel.OpenAI:
      case AiLogChannel.Grok:
      case AiLogChannel.Dashscope:
      case AiLogChannel.Relay:
        await this.ensureSavedVideoMedia(aiLog as VideoAiLog)
    }
  }

  private getChannelTaskResult(aiLog: VideoAiLog) {
    if (!aiLog.response) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (this.isDreaminaLog(aiLog as unknown as { model?: string, request?: Record<string, unknown> })) {
      const res = aiLog.response as Record<string, any>
      const statusRaw = String(res.status || '').toLowerCase()
      const status = statusRaw === 'success' || statusRaw === 'completed'
        ? TaskStatus.Success
        : statusRaw === 'failed'
          ? TaskStatus.Failure
          : TaskStatus.InProgress
      const err = typeof res.error === 'string' ? res.error : res.error?.message
      return {
        status,
        videoUrl: res.videoUrl ? FileUtil.buildUrl(res.videoUrl) : undefined,
        coverUrl: res.coverUrl ? FileUtil.buildUrl(res.coverUrl) : undefined,
        error: err ? { message: err } : undefined,
      }
    }

    switch (aiLog.channel) {
      case AiLogChannel.Volcengine:
        return this.volcengineVideoService.getTaskResult(aiLog.response)
      case AiLogChannel.OpenAI:
        return this.openaiVideoService.getTaskResult(aiLog.response)
      case AiLogChannel.Grok:
        return this.grokVideoService.getTaskResult(aiLog.response)
      case AiLogChannel.Dashscope:
        return this.dashscopeVideoService.getTaskResult(aiLog.response)
      case AiLogChannel.Relay:
        return this.requireChannel(this.relayVideoService).getTaskResult(aiLog.response)
      default:
        throw new AppException(ResponseCode.InvalidAiTaskId)
    }
  }

  /**
   * 查询视频任务状态
   */
  async getVideoTaskStatus(request: UserVideoTaskQueryDto) {
    const { taskId } = request

    let aiLog = await this.aiLogRepo.getById(taskId)

    if (aiLog == null || aiLog.type !== AiLogType.Video) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (aiLog.status === AiLogStatus.Generating && this.isDreaminaLog(aiLog as unknown as { model?: string, request?: Record<string, unknown> })) {
      await this.pollDreaminaVideoTask(aiLog.id)
      aiLog = await this.aiLogRepo.getById(taskId)
      if (!aiLog) {
        throw new AppException(ResponseCode.InvalidAiTaskId)
      }
    }

    switch (aiLog.channel) {
      case AiLogChannel.Volcengine:
      case AiLogChannel.OpenAI:
      case AiLogChannel.Grok:
      case AiLogChannel.Dashscope:
      case AiLogChannel.Relay:
        return this.transformToCommonResponse(aiLog as VideoAiLog)
      default:
        throw new AppException(ResponseCode.InvalidAiTaskId)
    }
  }

  async listVideoTasks(request: UserListVideoTasksQueryDto) {
    const [aiLogs, count] = await this.aiLogRepo.listWithPagination({
      ...request,
      type: AiLogType.Video,
      channels: [
        AiLogChannel.Volcengine,
        AiLogChannel.OpenAI,
        AiLogChannel.Grok,
        AiLogChannel.Dashscope,
        AiLogChannel.Relay,
      ],
    })

    return [
      await Promise.all(aiLogs.map((log) => {
        switch (log.channel) {
          case AiLogChannel.Volcengine:
          case AiLogChannel.OpenAI:
          case AiLogChannel.Grok:
          case AiLogChannel.Dashscope:
          case AiLogChannel.Relay:
            return this.transformToCommonResponse(log as VideoAiLog)
          default:
            throw new AppException(ResponseCode.InvalidAiTaskId)
        }
      })),
      count,
    ] as const
  }

  /**
   * 获取视频生成模型参数
   */
  async getVideoGenerationModelParams(_data: VideoGenerationModelsQueryDto) {
    return this.modelsConfigService.config.video.generation
  }

  private async ensureSavedVideoMedia(aiLog: VideoAiLog): Promise<{ mediaId?: string, coverUrl?: string, groupId?: string }> {
    const response = aiLog.response
    const request = aiLog.request
    const existingMediaId = response?.mediaId
    const existingCoverUrl = response?.coverUrl

    if (existingMediaId) {
      return {
        mediaId: existingMediaId,
        coverUrl: existingCoverUrl,
        groupId: response?.groupId ?? request.groupId,
      }
    }

    if (aiLog.status !== AiLogStatus.Success || !response) {
      return {}
    }

    const targetGroupId = response.groupId ?? request.groupId
    if (!targetGroupId) {
      return {
        coverUrl: existingCoverUrl,
      }
    }

    try {
      const commonResult = this.getChannelTaskResult(aiLog)
      if (!commonResult.videoUrl) {
        this.logger.warn({ aiLogId: aiLog.id, channel: aiLog.channel }, 'Video task succeeded but video path is missing')
        return {}
      }
      const videoPath = FileUtil.trimHost(commonResult.videoUrl)

      let coverPath = existingCoverUrl
      if (!coverPath) {
        try {
          const thumbnailBuffer = await this.videoMetadataService.extractThumbnailFromUrl(commonResult.videoUrl, 2)
          const uploadResult = await this.assetsService.uploadFromBuffer(aiLog.userId, thumbnailBuffer, {
            type: AssetType.VideoThumbnail,
            mimeType: 'image/png',
            filename: 'thumbnail.png',
          })
          coverPath = uploadResult.asset.path
        }
        catch (error) {
          this.logger.warn({ error, aiLogId: aiLog.id }, 'Failed to generate thumbnail for saved video media')
        }
      }

      const media = await this.mediaRepository.create({
        userId: aiLog.userId,
        userType: aiLog.userType,
        materialGroupId: targetGroupId,
        type: MediaType.VIDEO,
        url: videoPath,
        thumbUrl: coverPath,
      })

      await this.aiLogRepo.updateById(aiLog.id, {
        $set: {
          response: {
            ...response,
            mediaId: media.id,
            groupId: targetGroupId,
            ...(coverPath ? { coverUrl: coverPath } : {}),
          },
        },
      })

      return {
        mediaId: media.id,
        coverUrl: coverPath,
        groupId: targetGroupId,
      }
    }
    catch (error) {
      this.logger.warn({ error, aiLogId: aiLog.id, groupId: targetGroupId }, 'Failed to save generated video to material')
      return {}
    }
  }
}
