import type { LanguageModel, ModelMessage, UserContent } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { DraftGenerationMemoryContentType } from '@yikart/aitoearn-ai-shared'
import { AppException, FileUtil, ResponseCode, UserType } from '@yikart/common'
import { AiLogChannel, AiLogRepository, AiLogStatus, AiLogType } from '@yikart/mongodb'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { config } from '../../config'
import { AiAvailabilityService } from '../ai-availability'
import { RelayMediaResolverService } from '../ai/relay-media'
import { isLocalBridgeChatModel, LocalBridgeService } from '../local-bridge'

export const VideoDraftPlanResultSchema = z.object({
  title: z.string().max(200).describe('Post title'),
  description: z.string().max(2200).describe('Post description/caption'),
  topics: z.array(z.string()).max(5).describe('Hashtag topics without # prefix'),
  videoPrompt: z.string().min(1).max(4000).describe('Final prompt for video generation model'),
})

export type VideoDraftPlanResult = z.infer<typeof VideoDraftPlanResultSchema>

export const ImageTextDraftPlanResultSchema = z.object({
  title: z.string().max(200).describe('Post title'),
  description: z.string().max(2200).describe('Post description/caption'),
  topics: z.array(z.string()).max(5).describe('Hashtag topics without # prefix'),
  imagePrompts: z.array(z.string().min(1).max(1000)).describe('Final prompt for each image to generate'),
})

export type ImageTextDraftPlanResult = z.infer<typeof ImageTextDraftPlanResultSchema>

type PlannerModelConfig = (typeof config.ai.models.chat)[number]
interface BasePlanInput {
  userId: string
  userType?: UserType
  plannerModel?: string
  userPrompt?: string
  memoryItems: string[]
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  platforms?: string[]
}

interface VideoPlanInput extends BasePlanInput {
  contentType: typeof DraftGenerationMemoryContentType.Video
  model: string
  captionPrompt?: string
  duration?: number
  aspectRatio?: string
}

interface ImageTextPlanInput extends BasePlanInput {
  contentType: typeof DraftGenerationMemoryContentType.ImageText
  imageModel: string
  captionPrompt?: string
  imageCount: number
  imageSize?: string
  aspectRatio?: string
}

const AutoMemoryResultSchema = z.object({
  items: z.array(z.object({
    text: z.string().min(1).max(120).describe('Short memory description'),
  })).max(20),
})

export type AutoMemoryResult = z.infer<typeof AutoMemoryResultSchema>

@Injectable()
export class DraftGenerationPlannerService {
  private readonly logger = new Logger(DraftGenerationPlannerService.name)

  constructor(
    private readonly aiAvailability: AiAvailabilityService,
    @Optional() private readonly relayMediaResolver?: RelayMediaResolverService,
    @Optional() private readonly aiLogs?: AiLogRepository,
    @Optional() private readonly localBridgeService?: LocalBridgeService,
  ) {}

  private resolvePlannerModelConfig(requestedModel?: string): PlannerModelConfig {
    const modelName = (requestedModel || config.ai.draftGeneration.planner.defaultModel || 'agy:default').trim()
    const configured = config.ai.models.chat.find(model => model.name === modelName)
    if (configured) {
      return configured
    }
    if (isLocalBridgeChatModel(modelName)) {
      return {
        name: modelName,
        description: modelName,
        tags: [],
        channel: AiLogChannel.OpenAI,
        scenes: ['web', 'draft-generation'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
      } as PlannerModelConfig
    }
    throw new AppException(ResponseCode.InvalidModel)
  }

  async planVideo(input: VideoPlanInput): Promise<{ plan: VideoDraftPlanResult, model: string }> {
    const modelConfig = this.resolvePlannerModelConfig(input.plannerModel)
    const resolvedInput = await this.resolveReferenceUrls(input)
    const prompt = this.buildVideoPrompt(resolvedInput)
    const plan = await this.invokeStructuredPlanner(modelConfig, prompt, VideoDraftPlanResultSchema, resolvedInput.referenceImageUrls, input)
    return { plan, model: modelConfig.name }
  }

  async planImageText(input: ImageTextPlanInput): Promise<{ plan: ImageTextDraftPlanResult, model: string }> {
    const modelConfig = this.resolvePlannerModelConfig(input.plannerModel)
    const resolvedInput = await this.resolveReferenceUrls(input)
    const prompt = this.buildImageTextPrompt(resolvedInput)
    const plan = await this.invokeStructuredPlanner(modelConfig, prompt, ImageTextDraftPlanResultSchema, resolvedInput.referenceImageUrls, input)
    if (plan.imagePrompts.length !== input.imageCount) {
      plan.imagePrompts = Array.from({ length: input.imageCount }, (_, index) => plan.imagePrompts[index] ?? plan.imagePrompts[0] ?? input.userPrompt ?? '')
    }
    return { plan, model: modelConfig.name }
  }

  async generateMemoryItems(plannerModel: string | undefined, prompt: string, userId?: string): Promise<AutoMemoryResult> {
    const modelConfig = this.resolvePlannerModelConfig(plannerModel)
    return await this.invokeStructuredPlanner(modelConfig, prompt, AutoMemoryResultSchema, [], userId ? { userId } : undefined)
  }

  async quickTextAssist(input: {
    userId: string
    userType?: UserType
    model?: string
    systemPrompt: string
    userPrompt: string
    referenceImageUrls?: string[]
  }): Promise<{ text: string, model: string }> {
    const modelConfig = this.resolvePlannerModelConfig(input.model)
    const model = this.createPlannerModel(modelConfig)
    const resolvedUrls = await this.resolveUrls(input.referenceImageUrls)
    const content: UserContent = [{ type: 'text', text: input.userPrompt }]
    for (const refUrl of resolvedUrls ?? []) {
      content.push({ type: 'image', image: new URL(FileUtil.buildUrl(refUrl)) })
    }
    const startedAt = new Date()
    const result = await this.aiAvailability.execute(
      { provider: modelConfig.channel, operation: 'draftGeneration.textAssist', model: modelConfig.name },
      async () => await generateText({
        model,
        system: input.systemPrompt,
        messages: [{ role: 'user', content }],
        maxRetries: 1,
        temperature: 0.8,
      }),
    )
    if (this.aiLogs) {
      await this.aiLogs.create({
        userId: input.userId,
        userType: input.userType ?? UserType.User,
        type: AiLogType.Chat,
        action: 'studio-text-assist',
        status: AiLogStatus.Success,
        channel: modelConfig.channel,
        model: result.response.modelId || modelConfig.name,
        startedAt,
        duration: Date.now() - startedAt.getTime(),
        request: {},
        response: { model: result.response.modelId || modelConfig.name, usage: result.usage },
      }).catch(() => this.logger.warn('未能保存文本辅助模型的用量记录'))
    }
    return { text: (result.text || '').trim(), model: modelConfig.name }
  }

  private buildVideoPrompt(input: VideoPlanInput): string {
    const captionPrompt = input.captionPrompt?.trim()
    if (captionPrompt) {
      return `You are an AI draft generation planner.

## System Rules
- Never depict children, minors, or anyone appearing under 18. If mentioned, replace them with adults.
- Video Prompt and Caption Prompt are separate inputs with different roles.
- Use Video Prompt as the content source for title, description, topics, and videoPrompt.
- Use Caption Prompt as social-copy requirements for title, description, and topics, such as tone, CTA, character limits, hashtag count, and emoji rules.
- Do NOT use Caption Prompt to create, rewrite, translate, expand, or constrain videoPrompt.
- Title, description, and topics must stay grounded in the concrete subject, place, product, brand, or scenario from the Video Prompt and reference media.
- Avoid generic titles/descriptions when the Video Prompt contains a specific subject.
- For title, description, and topics, extract only public-facing facts from the Video Prompt, such as event name, place, product, brand, scenario, benefit, and audience.
- Do NOT copy media-generation instructions, style directions, negative constraints, or uncertainty guards into title, description, or topics. Examples: no QR codes, no logos, no contact info, no unknown information, no people from reference media, poster/video format, cartoon style, or "only for promotion".
- Title and description should promote the subject itself, not describe the generated creative asset, unless the user explicitly asks the social copy to announce that asset or style.
- Merge memory naturally into title, description, and topics only when it does not conflict with the current prompt or Caption Prompt; do not say "based on your memory".
- Generate title, description, and topics in the SAME language as the Caption Prompt. Do NOT translate them.
- For videoPrompt, use the Video Prompt as the source and keep the SAME language as the Video Prompt. Preserve media-generation style, format, and negative constraints from the Video Prompt. Replace children/minors/under-18 people with adults, and strip caption/title/description/topic/CTA/hashtag/character-limit requirements. Do NOT translate, expand, or use Caption Prompt content in videoPrompt.

## Video Prompt
${input.userPrompt || ''}

## Caption Prompt
${captionPrompt}

## User Memory
${this.formatList(input.memoryItems)}

## Generation Context
- Content Type: ${input.contentType}
- Video Model: ${input.model}
- Duration: ${input.duration ?? 'default'}
- Aspect Ratio: ${input.aspectRatio ?? 'default'}
- Platforms: ${input.platforms?.join(', ') || 'default'}
- Reference Images: ${input.referenceImageUrls?.join(', ') || 'none'}
- Reference Videos: ${input.referenceVideoUrls?.join(', ') || 'none'}
- Reference Audios: ${input.referenceAudioUrls?.join(', ') || 'none'}

## Output Requirements
- title: short post title grounded in the Video Prompt and refined by the Caption Prompt.
- description: social post caption grounded in the Video Prompt, with clear value and CTA when requested by the Caption Prompt.
- topics: 3-5 hashtag topics without #, grounded in the Video Prompt and filtered by the Caption Prompt.
- videoPrompt: the Video Prompt in the SAME language as the Video Prompt, with children/minors/under-18 people replaced by adults and caption/title/description/topic/CTA/hashtag/character-limit requirements stripped when provided; otherwise a minimal prompt based only on visual reference media and generation context, never on Caption Prompt. Do NOT translate or add content the user did not write.`
    }

    return `You are an AI draft generation planner.

## System Rules
- Never depict children, minors, or anyone appearing under 18. If mentioned, replace them with adults.
- The current user prompt has higher priority than memory.
- Merge memory naturally; do not say "based on your memory".
- The user prompt may contain caption/title/description/topic/CTA/hashtag/character-limit requirements. These apply ONLY to title/description/topics — do NOT let them influence the videoPrompt content.
- For title, description, and topics, extract only public-facing facts from the user prompt, such as event name, place, product, brand, scenario, benefit, and audience.
- Do NOT copy media-generation instructions, style directions, negative constraints, or uncertainty guards into title, description, or topics. Examples: no QR codes, no logos, no contact info, no unknown information, no people from reference media, poster/video format, cartoon style, or "only for promotion".
- Title and description should promote the subject itself, not describe the generated creative asset, unless the user explicitly asks the social copy to announce that asset or style.
- CRITICAL: For videoPrompt, use the user's original prompt VERBATIM as the base. Do NOT translate, rewrite, or expand it. Only strip appended caption/title/description/topic/CTA/hashtag/character-limit requirements if present. Do NOT add camera directions, lighting, or other details the user did not write.
- Generate title, description, and topics in the SAME language as the user prompt. Do NOT translate them.

## Current User Prompt
${input.userPrompt || ''}

## User Memory
${this.formatList(input.memoryItems)}

## Generation Context
- Content Type: ${input.contentType}
- Video Model: ${input.model}
- Duration: ${input.duration ?? 'default'}
- Aspect Ratio: ${input.aspectRatio ?? 'default'}
- Platforms: ${input.platforms?.join(', ') || 'default'}
- Reference Images: ${input.referenceImageUrls?.join(', ') || 'none'}
- Reference Videos: ${input.referenceVideoUrls?.join(', ') || 'none'}
- Reference Audios: ${input.referenceAudioUrls?.join(', ') || 'none'}

## Output Requirements
- title: short post title in the SAME language as the user prompt, respecting any character limits from the prompt.
- description: social post caption with clear value and CTA, in the SAME language as the user prompt, respecting any character limits from the prompt.
- topics: 3-5 hashtag topics without #.
- videoPrompt: the user's original prompt with appended caption/title/description/topic/CTA/hashtag/character-limit requirements stripped. Do NOT rewrite, translate, or add any content the user did not write.`
  }

  private buildImageTextPrompt(input: ImageTextPlanInput): string {
    const captionPrompt = input.captionPrompt?.trim()
    if (captionPrompt) {
      return `You are an AI draft generation planner.

## System Rules
- Never depict children, minors, or anyone appearing under 18. If mentioned, replace them with adults.
- Image Prompt and Caption Prompt are separate inputs with different roles.
- Use Image Prompt as the content source for title, description, topics, and imagePrompts.
- Use Caption Prompt as social-copy requirements for title, description, and topics, such as tone, CTA, character limits, hashtag count, and emoji rules.
- Do NOT use Caption Prompt to create, rewrite, translate, expand, or constrain imagePrompts.
- Title, description, and topics must stay grounded in the concrete subject, place, product, brand, or scenario from the Image Prompt and reference images.
- Avoid generic titles/descriptions when the Image Prompt contains a specific subject.
- For title, description, and topics, extract only public-facing facts from the Image Prompt, such as event name, place, product, brand, scenario, benefit, and audience.
- Do NOT copy media-generation instructions, style directions, negative constraints, or uncertainty guards into title, description, or topics. Examples: no QR codes, no logos, no contact info, no unknown information, no people from reference images, poster format, cartoon style, or "only for promotion".
- Title and description should promote the subject itself, not describe the generated image, poster, or style, unless the user explicitly asks the social copy to announce that asset or style.
- Merge memory naturally into title, description, and topics only when it does not conflict with the current prompt or Caption Prompt; do not say "based on your memory".
- Generate title, description, and topics in the SAME language as the Caption Prompt. Do NOT translate them.
- For imagePrompts, use the Image Prompt as the source and keep the SAME language as the Image Prompt. Replace children/minors/under-18 people with adults.
- Preserve media-generation style, format, and negative constraints from the Image Prompt in imagePrompts, such as no QR codes, no logos, no contact info, no unknown information, and no people from reference images.
- Image Prompt may include on-image text, cover titles, carousel page roles, and comment-interaction prompts. Preserve those as image content; do not strip them as caption requirements.
- Only strip publication metadata constraints such as caption/title/description/topic/CTA/hashtag/character-limit requirements when they are not meant to appear in the image.
- You may rewrite and split imagePrompts in the original language to create distinct image-generation instructions for each requested image, including concise layout, composition, typography hierarchy, and restrained professional style details implied by the user's requested format.
- Do NOT translate imagePrompts, change the user's core intent, invent unsupported claims, or make the style flashy/exaggerated.

## Image Prompt
${input.userPrompt || ''}

## Caption Prompt
${captionPrompt}

## User Memory
${this.formatList(input.memoryItems)}

## Generation Context
- Content Type: ${input.contentType}
- Image Model: ${input.imageModel}
- Image Count: ${input.imageCount}
- Image Size: ${input.imageSize ?? 'default'}
- Aspect Ratio: ${input.aspectRatio ?? 'default'}
- Platforms: ${input.platforms?.join(', ') || 'default'}
- Reference Images: ${input.referenceImageUrls?.join(', ') || 'none'}

## Output Requirements
- title: short post title grounded in the Image Prompt and refined by the Caption Prompt.
- description: social post caption grounded in the Image Prompt, with clear value and CTA when requested by the Caption Prompt.
- topics: 3-5 hashtag topics without #, grounded in the Image Prompt and filtered by the Caption Prompt.
- imagePrompts: exactly ${input.imageCount} prompts for image generation in the SAME language as the Image Prompt. Base each prompt on the Image Prompt only. Split carousel/page-style requests into different page goals when applicable. Keep explicit on-image text unchanged. Do NOT translate, use Caption Prompt content, or include non-image output format constraints or character limits in the imagePrompts.`
    }

    return `You are an AI draft generation planner.

## System Rules
- Never depict children, minors, or anyone appearing under 18. If mentioned, replace them with adults.
- The current user prompt has higher priority than memory.
- Merge memory naturally; do not say "based on your memory".
- The user prompt may contain appended publication metadata constraints (e.g., "重要：标题字数限制：80"). These apply ONLY to title/description/topics. Do NOT let them influence the imagePrompts content unless the user clearly wants that text visible inside the image.
- For title, description, and topics, extract only public-facing facts from the user prompt, such as event name, place, product, brand, scenario, benefit, and audience.
- Do NOT copy media-generation instructions, style directions, negative constraints, or uncertainty guards into title, description, or topics. Examples: no QR codes, no logos, no contact info, no unknown information, no people from reference images, poster format, cartoon style, or "only for promotion".
- Title and description should promote the subject itself, not describe the generated image, poster, or style, unless the user explicitly asks the social copy to announce that asset or style.
- Generate title, description, and topics in the SAME language as the user prompt. Do NOT translate them.
- For imagePrompts, use the user's original prompt as the base and keep the SAME language as the user prompt.
- Preserve media-generation style, format, and negative constraints from the user prompt in imagePrompts, such as no QR codes, no logos, no contact info, no unknown information, and no people from reference images.
- The user prompt may include on-image text, cover titles, carousel page roles, and comment-interaction prompts. Preserve those as image content.
- You may rewrite and split imagePrompts in the original language to create distinct image-generation instructions for each requested image, including concise layout, composition, typography hierarchy, and restrained professional style details implied by the user's requested format.
- Do NOT translate imagePrompts, change the user's core intent, invent unsupported claims, or make the style flashy/exaggerated.

## Current User Prompt
${input.userPrompt || ''}

## User Memory
${this.formatList(input.memoryItems)}

## Generation Context
- Content Type: ${input.contentType}
- Image Model: ${input.imageModel}
- Image Count: ${input.imageCount}
- Image Size: ${input.imageSize ?? 'default'}
- Aspect Ratio: ${input.aspectRatio ?? 'default'}
- Platforms: ${input.platforms?.join(', ') || 'default'}
- Reference Images: ${input.referenceImageUrls?.join(', ') || 'none'}

## Output Requirements
- title: short post title in the SAME language as the user prompt, respecting any character limits from the prompt.
- description: social post caption with clear value and CTA, in the SAME language as the user prompt, respecting any character limits from the prompt.
- topics: 3-5 hashtag topics without #.
- imagePrompts: exactly ${input.imageCount} prompts for image generation in the SAME language as the user prompt. Split carousel/page-style requests into different page goals when applicable. Keep explicit on-image text unchanged. Do NOT translate or include non-image output format constraints or character limits in the imagePrompts.`
  }

  private formatList(items: string[]): string {
    if (items.length === 0) {
      return 'None'
    }
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n')
  }

  private async resolveReferenceUrls<T extends BasePlanInput>(input: T): Promise<T> {
    return {
      ...input,
      referenceImageUrls: await this.resolveUrls(input.referenceImageUrls),
      referenceVideoUrls: await this.resolveUrls(input.referenceVideoUrls),
      referenceAudioUrls: await this.resolveUrls(input.referenceAudioUrls),
    }
  }

  private async resolveUrls(urls: string[] | undefined): Promise<string[] | undefined> {
    if (!urls) {
      return undefined
    }
    return await Promise.all(urls.map(url => this.resolveRelayText(url)))
  }

  private async resolveRelayText(text: string): Promise<string> {
    if (!this.relayMediaResolver) {
      return text
    }
    return await this.relayMediaResolver.resolveText(text)
  }

  private async invokeStructuredPlanner<T extends Record<string, unknown>>(
    modelConfig: PlannerModelConfig,
    prompt: string,
    schema: z.ZodType<T>,
    referenceImageUrls: string[] = [],
    owner?: { userId: string, userType?: UserType },
  ): Promise<T> {
    const model = this.createPlannerModel(modelConfig)
    const messages = this.buildMessages(prompt, referenceImageUrls)
    const startedAt = new Date()
    const result = await this.aiAvailability.execute(
      { provider: modelConfig.channel, operation: 'draftGeneration.planner', model: modelConfig.name },
      async () => await generateText({
        model,
        output: Output.object({ schema }),
        messages,
        maxRetries: 1,
        temperature: 0.8,
      }),
    )

    if (owner && this.aiLogs) {
      await this.aiLogs.create({
        userId: owner.userId, userType: owner.userType ?? UserType.User,
        type: AiLogType.Chat, action: 'draft-planner', status: AiLogStatus.Success,
        channel: modelConfig.channel, model: result.response.modelId || modelConfig.name,
        startedAt, duration: Date.now() - startedAt.getTime(),
        request: {}, response: { model: result.response.modelId || modelConfig.name, usage: result.usage },
      }).catch(() => this.logger.warn('未能保存草稿规划模型的用量记录'))
    }
    return result.output
  }

  private buildMessages(prompt: string, referenceImageUrls: string[]): ModelMessage[] {
    const content: UserContent = [{ type: 'text', text: prompt }]
    for (const referenceImageUrl of referenceImageUrls) {
      content.push({ type: 'image', image: new URL(FileUtil.buildUrl(referenceImageUrl)) })
    }
    return [{ role: 'user', content }]
  }

  private createPlannerModel(modelConfig: PlannerModelConfig): LanguageModel {
    if (isLocalBridgeChatModel(modelConfig.name) && this.localBridgeService) {
      return createOpenAI({
        apiKey: this.localBridgeService.getBridgeToken() || 'local-bridge',
        baseURL: this.localBridgeService.getOpenAIBaseUrl(),
      }).chat(modelConfig.name)
    }

    switch (modelConfig.channel) {
      case AiLogChannel.Gemini: {
        const baseUrl = config.ai.gemini.proxyUrl
          ? `${config.ai.gemini.proxyUrl}/${config.ai.gemini.baseUrl}`
          : config.ai.gemini.baseUrl
        return createGoogleGenerativeAI({
          apiKey: config.ai.gemini.apiKey,
          baseURL: `${baseUrl}/v1beta`,
        }).chat(modelConfig.name)
      }
      case AiLogChannel.OpenAI:
      case AiLogChannel.DeepSeek:
      case AiLogChannel.Anthropic:
        return createOpenAI({
          apiKey: config.ai.openai.apiKey,
          baseURL: config.ai.openai.baseUrl,
        }).chat(modelConfig.name)
      default:
        throw new AppException(ResponseCode.InvalidModel)
    }
  }
}
