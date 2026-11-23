/**
 * ToolBarInline - 内联工具栏
 * 组合生成模式、平台、模型参数、比例时长、数量、快捷链接和提交控件。
 */

'use client'

import type { ToolBarInlineProps } from './types'
import { Bot, Check, ChevronDown, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/utils/className'
import { memo } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { useAiBatchGenerateBarLocalState } from '../../store'
import PlatformSelector from '../PlatformSelector'
import { AspectRatioSelect } from './components/AspectRatioSelect'
import { CreditsSubmitControl } from './components/CreditsSubmitControl'
import { DurationSelect } from './components/DurationSelect'
import { GenerationModeSelect } from './components/GenerationModeSelect'
import { ImageCountSelect } from './components/ImageCountSelect'
import { ImageSizeSelect } from './components/ImageSizeSelect'
import { ModelSelect } from './components/ModelSelect'
import { QuantitySelect } from './components/QuantitySelect'
import { VideoEditModeBadge } from './components/VideoEditModeBadge'
import { VideoModelParamsSelect } from './components/VideoModelParamsSelect'
import { VideoResolutionSelect } from './components/VideoResolutionSelect'
import { useClickPopover } from './hooks/useClickPopover'
import { useToolBarActions } from './hooks/useToolBarActions'
import { useToolBarDerivedData } from './hooks/useToolBarDerivedData'
import { useToolBarDraftValues } from './hooks/useToolBarDraftValues'
import { modelOptionClassName, modelPillClass, modelTagClassName, pillClass } from './utils/styles'

const ToolBarInline = memo(
  ({
    captionControl,
    configKey,
    fallbackState,
    textModelOptions = [],
    selectedTextModel = 'agy:default',
    imageAspectRatios,
    imageModelOptions,
    imagePricing,
    videoModels,
    videoAspectRatios,
    videoResolutions,
    videoModelOptions,
    resolvedVideoModelParams,
    videoDurationLimits,
    isVideoEditMode,
    inputVideoDuration,
    isLoading,
    hideNonDraftModes = false,
    effectiveLimitsDetailed,
    disabledPlatforms,
    actions,
  }: ToolBarInlineProps) => {
    const { t } = useTransClient(['brandPromotion', 'route'])
    const {
      contentType,
      selectedVideoModels,
      videoModelSelectionMode,
      aspectRatio,
      duration,
      resolution,
      quantity,
      selectedImageModels,
      imageModelSelectionMode,
      imageCount,
      imageSize,
      isDraftMode,
      selectedPlatforms,
    } = useAiBatchGenerateBarLocalState(configKey, fallbackState)

    const {
      onDraftModeChange,
      onContentTypeChange,
      onTextModelChange,
      onVideoModelsChange,
      onVideoModelSelectionModeChange,
      onVideoModelParamChange,
      onResolutionChange,
      onAspectRatioChange,
      onDurationChange,
      onQuantityChange,
      onImageModelsChange,
      onImageModelSelectionModeChange,
      onImageCountChange,
      onImageSizeChange,
      onPlatformsChange,
      onSubmit,
    } = actions

    const imageCountLabel = isDraftMode
      ? t('detail.imageTextDraftImageCount')
      : t('detail.imageCount')

    const {
      currentModelDisplay,
      isTimeLimitedModel,
      isVideoMode,
      isVideoMultiSelect,
      modelOptionsCount,
      selectedModelValues,
      selectedVideoModelParamInfos,
      supportedRatios,
    } = useToolBarDerivedData({
      contentType,
      duration,
      imageAspectRatios,
      imageModelOptions,
      inputVideoDuration,
      isVideoEditMode,
      selectedImageModels,
      selectedVideoModels,
      selectModelsLabel: t('detail.selectModels'),
      videoAspectRatios,
      videoModelOptions,
      videoModelParams: resolvedVideoModelParams,
      videoModels,
      videoModelSelectionMode,
      videoResolutions,
    })

    const {
      handleImageCountChange,
      handleImageModelToggle,
      handleQuantityChange,
      handleVideoModelToggle,
    } = useToolBarActions({
      imageModelSelectionMode,
      onImageCountChange,
      onImageModelsChange,
      onQuantityChange,
      onVideoModelsChange,
      selectedImageModels,
      selectedVideoModels,
      videoModelSelectionMode,
    })

    const {
      draftDuration,
      draftVideoModelDurations,
      handleDurationCommit,
      handleDurationDraftChange,
      handleVideoModelDurationCommit,
      handleVideoModelDurationDraftChange,
    } = useToolBarDraftValues({
      duration,
      onDurationChange,
      onVideoModelParamChange,
    })

    const genModePopover = useClickPopover()
    const modelPopover = useClickPopover()
    const ratioPopover = useClickPopover()
    const durationPopover = useClickPopover()
    const quantityPopover = useClickPopover()
    const imageSizePopover = useClickPopover()
    const videoResolutionPopover = useClickPopover()
    const videoParamsPopover = useClickPopover()
    const imageCountPopover = useClickPopover()

    return (
      <div className="composer-actions">
        <div className="composer-settings">
        {isVideoEditMode && <VideoEditModeBadge label={t('detail.videoEditMode')} />}

        <GenerationModeSelect
          contentType={contentType}
          hideNonDraftModes={hideNonDraftModes}
          isDraftMode={isDraftMode}
          isVideoMode={isVideoMode}
          labels={{
            contentTypeImageText: t('detail.contentTypeImageText'),
            contentTypeVideo: t('detail.contentTypeVideo'),
            draftModeOffImage: t('detail.draftModeOffImage'),
            draftModeOffVideo: t('detail.draftModeOffVideo'),
            draftModeOn: t('detail.draftModeOn'),
          }}
          popover={genModePopover}
          onContentTypeChange={onContentTypeChange}
          onDraftModeChange={onDraftModeChange}
        />

        {isDraftMode && (
          <PlatformSelector
            selectedPlatforms={selectedPlatforms}
            onPlatformsChange={onPlatformsChange}
            pillClass={pillClass}
            disabledPlatforms={disabledPlatforms}
            effectiveLimitsDetailed={effectiveLimitsDetailed}
          />
        )}

        {isDraftMode ? (
          <Popover open={modelPopover.open} onOpenChange={modelPopover.onOpenChange}>
            <PopoverTrigger asChild>
              <button
                data-testid="draftbox-ai-text-model"
                type="button"
                className={cn(modelPillClass, 'max-w-[240px]')}
              >
                <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  {textModelOptions.find(m => m.value === selectedTextModel)?.label || selectedTextModel || 'Antigravity CLI (默认)'}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(92vw,340px)] p-0" side="top" align="start" allowInnerScroll>
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium text-foreground">文本大语言模型 (LLM)</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">纯文案/脚本草稿</span>
              </div>
              <div className="max-h-[min(50vh,320px)] overflow-y-auto p-2">
                <div className="flex flex-col gap-1">
                  {(textModelOptions.length > 0
                    ? textModelOptions
                    : [{ value: 'agy:default', label: 'Antigravity CLI (默认)', provider: 'agy', tag: '本机 LLM' }]
                  ).map((opt) => {
                    const isActive = opt.value === selectedTextModel
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={cn(
                          modelOptionClassName,
                          'items-center text-xs',
                          isActive
                            ? 'border-primary/30 bg-primary/5 text-foreground shadow-sm'
                            : 'border-transparent text-foreground hover:border-border/70 hover:bg-muted/60',
                        )}
                        onClick={() => {
                          onTextModelChange?.(opt.value)
                          modelPopover.onOpenChange(false)
                        }}
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                          <span className="truncate">{opt.label}</span>
                          {opt.tag && <Badge className={modelTagClassName}>{opt.tag}</Badge>}
                        </div>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <ModelSelect
            currentModelDisplay={currentModelDisplay}
            imageModelOptions={imageModelOptions}
            imageModelSelectionMode={imageModelSelectionMode}
            isTimeLimitedModel={isTimeLimitedModel}
            isVideoMode={isVideoMode}
            labels={{
              imageModel: t('detail.imageModel'),
              modelType: t('detail.modelType'),
              multiSelect: t('detail.multiSelect'),
              selectedModelsCount: values => t('detail.selectedModelsCount', values),
              singleSelect: t('detail.singleSelect'),
              timeLimitedModelTip: t('detail.timeLimitedModelTip'),
            }}
            modelOptionsCount={modelOptionsCount}
            popover={modelPopover}
            selectedImageModels={selectedImageModels}
            selectedModelValues={selectedModelValues}
            selectedVideoModels={selectedVideoModels}
            videoModelOptions={videoModelOptions}
            videoModelSelectionMode={videoModelSelectionMode}
            videoModels={videoModels}
            onImageModelSelectionModeChange={onImageModelSelectionModeChange}
            onImageModelToggle={handleImageModelToggle}
            onVideoModelSelectionModeChange={onVideoModelSelectionModeChange}
            onVideoModelToggle={handleVideoModelToggle}
          />
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={pillClass} data-testid="studio-parameters" title={t('studio.parameters')}>
              <Settings2 size={14} />
              {isDraftMode
                ? `${t('studio.outputs', { count: quantity })} · ${isVideoMode ? '视频脚本' : '图文文案'}`
                : [
                    isVideoMultiSelect ? t('detail.videoModelParams') : isVideoMode ? resolution : imageSize,
                    !isVideoMultiSelect && aspectRatio,
                    isVideoMode && !isVideoMultiSelect && `${duration}s`,
                    !isVideoMode && t('studio.images', { count: imageCount }),
                    isVideoMode && t('studio.outputs', { count: quantity }),
                  ].filter(Boolean).join(' · ')}
              <ChevronDown size={12} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3 p-4">
            <p className="text-sm font-semibold">{t('studio.parameters')}</p>
            {!isDraftMode && isVideoMultiSelect && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t('detail.videoModelParams')}</span>
                <VideoModelParamsSelect
                  draftVideoModelDurations={draftVideoModelDurations}
                  isVideoEditMode={isVideoEditMode}
                  labels={{
                    aspectRatio: t('detail.aspectRatio'),
                    duration: t('detail.duration'),
                    videoModelParams: t('detail.videoModelParams'),
                    videoResolution: t('detail.videoResolution'),
                  }}
                  popover={videoParamsPopover}
                  selectedVideoModelParamInfos={selectedVideoModelParamInfos}
                  videoModelOptions={videoModelOptions}
                  onVideoModelDurationCommit={handleVideoModelDurationCommit}
                  onVideoModelDurationDraftChange={handleVideoModelDurationDraftChange}
                  onVideoModelParamChange={onVideoModelParamChange}
                />
              </div>
            )}

            {!isDraftMode && !isVideoMode && imagePricing.length > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t('detail.imageResolution')}</span>
                <ImageSizeSelect
                  imagePricing={imagePricing}
                  imageSize={imageSize}
                  label={t('detail.imageResolution')}
                  popover={imageSizePopover}
                  onImageSizeChange={onImageSizeChange}
                />
              </div>
            )}

            {!isDraftMode && isVideoMode && !isVideoMultiSelect && videoResolutions.length > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t('detail.videoResolution')}</span>
                <VideoResolutionSelect
                  label={t('detail.videoResolution')}
                  popover={videoResolutionPopover}
                  resolution={resolution}
                  videoResolutions={videoResolutions}
                  onResolutionChange={onResolutionChange}
                />
              </div>
            )}

            {!isDraftMode && !isVideoMultiSelect && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t('detail.aspectRatio')}</span>
                <AspectRatioSelect
                  aspectRatio={aspectRatio}
                  isLocked={isVideoEditMode}
                  label={t('detail.aspectRatio')}
                  lockedLabel={t('detail.ratioLockedByVideo')}
                  popover={ratioPopover}
                  supportedRatios={supportedRatios}
                  onAspectRatioChange={onAspectRatioChange}
                />
              </div>
            )}

            {!isDraftMode && isVideoMode && !isVideoMultiSelect && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{t('detail.duration')}</span>
                <DurationSelect
                  draftDuration={draftDuration}
                  duration={duration}
                  inputVideoDuration={inputVideoDuration}
                  isVideoEditMode={isVideoEditMode}
                  label={t('detail.duration')}
                  lockedByVideoLabel={t('detail.durationLockedByVideo')}
                  popover={durationPopover}
                  videoDurationLimits={videoDurationLimits}
                  onDurationCommit={handleDurationCommit}
                  onDurationDraftChange={handleDurationDraftChange}
                />
              </div>
            )}

            {!isDraftMode && !isVideoMode && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{imageCountLabel}</span>
                <ImageCountSelect
                  imageCount={imageCount}
                  label={imageCountLabel}
                  popover={imageCountPopover}
                  onImageCountChange={handleImageCountChange}
                />
              </div>
            )}

            {(isVideoMode || isDraftMode) && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs text-muted-foreground">{isDraftMode ? t('detail.draftQuantity') : t('detail.quantity')}</span>
                <QuantitySelect
                  label={isDraftMode ? t('detail.draftQuantity') : t('detail.quantity')}
                  popover={quantityPopover}
                  quantity={quantity}
                  onQuantityChange={handleQuantityChange}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>

        {captionControl}
        </div>
        <div className="composer-submit">
          <CreditsSubmitControl
            label={t('studio.generate')}
            isLoading={isLoading}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    )
  },
)

ToolBarInline.displayName = 'ToolBarInline'

export default ToolBarInline
