import type { UsageRecord, usagePeriod } from './usage'
import { summarizeUsage } from './usage'
import { Injectable } from '@nestjs/common'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { AiLogRepository, ListAiLogParams } from '@yikart/mongodb'

@Injectable()
export class LogsService {
  constructor(
    private readonly aiLogRepo: AiLogRepository,
  ) {}

  async getUsage(userId: string, period: ReturnType<typeof usagePeriod>) {
    const records = this.aiLogRepo.listByUserAndPeriod<UsageRecord>(userId, period.since, period.until)
    return summarizeUsage(records, period)
  }

  async getLogList(query: ListAiLogParams) {
    return await this.aiLogRepo.listWithPagination(query)
  }

  async getLogDetail(id: string, userId: string, userType: UserType) {
    const log = await this.aiLogRepo.getByIdAndUserId(id, userId, userType)

    if (!log) {
      throw new AppException(ResponseCode.AiLogNotFound)
    }

    return log
  }
}
