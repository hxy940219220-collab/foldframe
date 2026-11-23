import { InjectModel } from '@nestjs/mongoose'
import { Pagination, RangeFilter, UserType } from '@yikart/common'
import { FilterQuery, Model, UpdateQuery } from 'mongoose'
import { AiLogChannel, AiLogStatus, AiLogType } from '../enums'
import { AiLog } from '../schemas'
import { BaseRepository } from './base.repository'

export interface ListAiLogParams extends Pagination {
  userId?: string
  userType?: UserType
  type?: AiLogType
  status?: AiLogStatus
  model?: string
  channel?: AiLogChannel
  channels?: AiLogChannel[]
  createdAt?: RangeFilter<Date>
}

export interface ListAiLogFilter {
  userId?: string
  userType?: UserType
  type?: AiLogType
  status?: AiLogStatus
  model?: string
  channel?: AiLogChannel
  channels?: AiLogChannel[]
  createdAt?: RangeFilter<Date>
}

export class AiLogRepository extends BaseRepository<AiLog> {
  constructor(
    @InjectModel(AiLog.name) aiLogModel: Model<AiLog>,
  ) {
    super(aiLogModel)
  }

  listByUserAndPeriod<T>(userId: string, since: Date, until: Date) {
    const outputArrays = ['$response.data', '$response.images', '$response.list']
    const imageCount = outputArrays.reduceRight<object>((fallback, field) => ({
      $cond: [{ $isArray: field }, { $size: field }, fallback],
    }), { $literal: 0 })
    return this.model.aggregate<T>([
      { $match: { userId, userType: UserType.User, createdAt: { $gte: since, $lte: until },
        status: AiLogStatus.Success,
        type: { $nin: [AiLogType.DraftGeneration, AiLogType.Crawler] } } },
      { $project: { _id: 0, createdAt: 1, type: 1, model: 1, channel: 1, status: 1,
        'response.usage': 1, 'response.usage_metadata': 1, 'response.modelUsage': 1,
        'response.model': 1, 'response.providerModel': 1, 'response.providerTokens': 1, 'response.total_cost_usd': 1,
        'response.costUSD': 1, 'response.seconds': 1, 'response.duration': 1, imageCount } },
    ]).cursor({ batchSize: 250 })
  }

  async listWithPagination(params: ListAiLogParams) {
    const { page, pageSize, userId, userType, type, status, model, channel, channels, createdAt } = params

    const filter: FilterQuery<AiLog> = {}
    if (userId)
      filter.userId = userId
    if (userType)
      filter.userType = userType
    if (type)
      filter.type = type
    if (status)
      filter.status = status
    if (model)
      filter.model = model
    if (channel)
      filter.channel = channel
    else if (channels)
      filter.channel = { $in: channels }
    if (createdAt) {
      filter.createdAt = {}
      if (createdAt[0])
        filter.createdAt.$gte = createdAt[0]
      if (createdAt[1])
        filter.createdAt.$lte = createdAt[1]
    }

    return await this.findWithPagination({
      page,
      pageSize,
      filter,
      options: { sort: { createdAt: -1 } },
    })
  }

  async list(params: ListAiLogFilter) {
    const { userId, userType, type, status, model, channel, channels, createdAt } = params

    const filter: FilterQuery<AiLog> = {}
    if (userId)
      filter.userId = userId
    if (userType)
      filter.userType = userType
    if (type)
      filter.type = type
    if (status)
      filter.status = status
    if (model)
      filter.model = model
    if (channel)
      filter.channel = channel
    else if (channels)
      filter.channel = { $in: channels }
    if (createdAt) {
      filter.createdAt = {}
      if (createdAt[0])
        filter.createdAt.$gte = createdAt[0]
      if (createdAt[1])
        filter.createdAt.$lte = createdAt[1]
    }

    return await this.find(filter, { sort: { createdAt: -1 } })
  }

  async listGeneratingByType(type: AiLogType, channel?: AiLogChannel) {
    const filter: FilterQuery<AiLog> = {
      type,
      status: AiLogStatus.Generating,
      taskId: { $exists: true, $ne: null },
    }
    if (channel)
      filter.channel = channel
    return await this.find(filter, { sort: { createdAt: -1 } })
  }

  async listByStatusAndStartedAtBefore(status: AiLogStatus, startedBefore: Date, limit: number) {
    return await this.find(
      {
        status,
        startedAt: { $lt: startedBefore },
      },
      { sort: { startedAt: 1 }, limit },
    )
  }

  async updateByIdAndStatus(id: string, status: AiLogStatus, update: UpdateQuery<AiLog>) {
    return await this.updateOne({ _id: id, status }, update)
  }

  async getByTaskId(taskId: string) {
    return await this.findOne({ taskId })
  }

  async getByIdAndUserId(id: string, userId: string, userType: UserType) {
    return await this.findOne({ _id: id, userId, userType })
  }

  async listByIdsAndUserId(ids: string[], userId: string, userType: UserType): Promise<AiLog[]> {
    return this.find(
      { _id: { $in: ids }, userId, userType },
      { sort: { createdAt: -1 } },
    )
  }

  async countByUserIdAndStatus(userId: string, userType: UserType, type: AiLogType, status: AiLogStatus): Promise<number> {
    return this.count({ userId, userType, type, status })
  }

  async listByUserIdAndTypeAndStatusAndRequestVersionAndCreatedAt(
    userId: string,
    type: AiLogType,
    status: AiLogStatus,
    requestVersion: string,
    startAt: Date,
    limit: number,
  ) {
    return await this.find(
      {
        userId,
        type,
        status,
        'request.version': requestVersion,
        'createdAt': { $gte: startAt },
      },
      { sort: { createdAt: -1 }, limit },
    )
  }

  async listUserIdsByTypeAndStatusAndUpdatedAt(type: AiLogType, status: AiLogStatus, startAt: Date): Promise<string[]> {
    return await this.model.distinct('userId', {
      type,
      status,
      updatedAt: { $gte: startAt },
    }).exec()
  }

  async findMediaGenerationLogs(
    userId: string,
    userType: UserType,
    mediaId?: string,
    urlCandidates: string[] = [],
  ): Promise<AiLog[]> {
    const orConditions: FilterQuery<AiLog>[] = []
    if (mediaId) {
      orConditions.push(
        { 'response.mediaIds': mediaId },
        { 'response.mediaId': mediaId },
        { 'response.materialId': mediaId },
      )
    }
    const cleanUrls = [...new Set(urlCandidates.filter(Boolean))]
    if (cleanUrls.length > 0) {
      orConditions.push(
        { 'response.imageUrls': { $in: cleanUrls } },
        { 'response.videoUrl': { $in: cleanUrls } },
        { 'response.coverUrl': { $in: cleanUrls } },
        { 'response.images.url': { $in: cleanUrls } },
        { 'response.list.url': { $in: cleanUrls } },
      )
    }
    if (orConditions.length === 0) {
      return []
    }
    return await this.find(
      {
        userId,
        userType,
        type: { $in: [AiLogType.DraftGeneration, AiLogType.Image, AiLogType.Video] },
        $or: orConditions,
      },
      { sort: { createdAt: -1 }, limit: 10 },
    )
  }
}
