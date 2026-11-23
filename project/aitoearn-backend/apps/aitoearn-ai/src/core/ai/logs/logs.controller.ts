import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { GetToken, TokenInfo } from '@yikart/aitoearn-auth'
import { ApiDoc, UserType } from '@yikart/common'
import { LogListQueryDto, logListQuerySchema, UsageQueryDto, usageQuerySchema } from './logs.dto'
import { LogsService } from './logs.service'
import { usagePeriod } from './usage'
import { LogsListResponseVo, usageResponseSchema } from './logs.vo'

@ApiTags('Me/Ai/Logs')
@Controller('/ai/logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @ApiDoc({ summary: '按本地日期统计当前用户的模型用量', query: usageQuerySchema, response: usageResponseSchema })
  @Get('usage')
  getUsage(@GetToken() token: TokenInfo, @Query() query: UsageQueryDto) {
    let period: ReturnType<typeof usagePeriod>
    try {
      period = usagePeriod(Number(query.days), query.timezone)
    }
    catch {
      throw new BadRequestException('无效的统计时区')
    }
    return this.logsService.getUsage(token.id, period)
  }

  @ApiDoc({
    summary: '获取用户 AI 活动日志',
    query: logListQuerySchema,
    response: LogsListResponseVo,
  })
  @Get('/')
  async getLogs(
    @GetToken() token: TokenInfo,
    @Query() query: LogListQueryDto,
  ): Promise<LogsListResponseVo> {
    const [list, total] = await this.logsService.getLogList({
      userId: token.id,
      userType: UserType.User,
      ...query,
    })
    return new LogsListResponseVo(list, total, query)
  }
}
