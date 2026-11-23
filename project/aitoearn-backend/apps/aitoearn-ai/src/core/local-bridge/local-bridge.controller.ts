import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import {
  DreaminaAuthPollDto,
  DreaminaAuthStartDto,
  SaveStudioModelsHubDto,
  TestStudioModelConnectionDto,
  WorkBuddyAuthStartDto,
} from './local-bridge.dto'
import { LocalBridgeService } from './local-bridge.service'
import { StudioModelsService } from './studio-models.service'

@ApiTags('Studio/Models')
@Controller('ai/studio')
export class LocalBridgeController {
  constructor(
    private readonly localBridgeService: LocalBridgeService,
    private readonly studioModelsService: StudioModelsService,
  ) {}

  @Get('models-hub')
  async getModelsHub() {
    return await this.studioModelsService.getHubState()
  }

  @Put('models-hub')
  async saveModelsHub(@Body() body: SaveStudioModelsHubDto) {
    return await this.studioModelsService.saveHubState(body)
  }

  @Post('test')
  async testConnection(@Body() body: TestStudioModelConnectionDto) {
    return await this.localBridgeService.testConnection(body)
  }

  @Post('auth/dreamina/start')
  async startDreaminaAuth(@Body() body: DreaminaAuthStartDto) {
    return await this.localBridgeService.startDreaminaAuth(Boolean(body?.force))
  }

  @Post('auth/dreamina/poll')
  async pollDreaminaAuth(@Body() body: DreaminaAuthPollDto) {
    return await this.localBridgeService.pollDreaminaAuth(body.deviceCode)
  }

  @Post('auth/dreamina/logout')
  async logoutDreaminaAuth() {
    return await this.localBridgeService.logoutDreaminaAuth()
  }

  @Post('auth/codex/start')
  async startCodexAuth() {
    return await this.localBridgeService.startCodexAuth()
  }

  @Get('auth/codex/status')
  async getCodexAuthStatus() {
    return await this.localBridgeService.getCodexAuthStatus()
  }

  @Post('auth/grok/start')
  async startGrokAuth() {
    return await this.localBridgeService.startGrokAuth()
  }

  @Get('auth/grok/status')
  async getGrokAuthStatus() {
    return await this.localBridgeService.getGrokAuthStatus()
  }

  @Post('auth/grok/logout')
  async logoutGrokAuth() {
    return await this.localBridgeService.logoutGrokAuth()
  }

  @Post('auth/workbuddy/start')
  async startWorkBuddyAuth(@Body() body: WorkBuddyAuthStartDto) {
    return await this.localBridgeService.startWorkBuddyAuth(body?.methodId || 'internal')
  }

  @Get('auth/workbuddy/status')
  async getWorkBuddyAuthStatus() {
    return await this.localBridgeService.getWorkBuddyAuthStatus()
  }

  @Post('auth/workbuddy/logout')
  async logoutWorkBuddyAuth() {
    return await this.localBridgeService.logoutWorkBuddyAuth()
  }
}
