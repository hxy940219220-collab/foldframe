import { Global, Module } from '@nestjs/common'
import { LocalBridgeController } from './local-bridge.controller'
import { LocalBridgeService } from './local-bridge.service'
import { StudioModelsService } from './studio-models.service'

@Global()
@Module({
  controllers: [LocalBridgeController],
  providers: [LocalBridgeService, StudioModelsService],
  exports: [LocalBridgeService, StudioModelsService],
})
export class LocalBridgeModule {}
