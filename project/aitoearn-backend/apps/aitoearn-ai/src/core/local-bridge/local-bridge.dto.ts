import { createZodDto } from '@yikart/common'
import { z } from 'zod'

const providerCredSchema = z.object({
  baseUrl: z.string().default(''),
  apiKey: z.string().default(''),
})

export const saveStudioModelsHubSchema = z.object({
  agent: z.object({
    engine: z.enum(['agy', 'codex', 'thirdParty']),
    model: z.string().min(1),
    protocol: z.enum(['anthropic', 'openai', 'openrouter', 'deepseek', 'gemini']).default('anthropic'),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    backgroundModel: z.string().optional(),
    thinkModel: z.string().optional(),
  }),
  chat: z.object({
    engine: z.enum(['agy', 'codex', 'thirdParty', 'ollama']),
    model: z.string().min(1),
    thirdPartyChannel: z.enum(['openai', 'anthropic', 'gemini', 'deepseek']).optional(),
  }),
  planner: z.object({
    engine: z.enum(['agy', 'codex', 'thirdParty', 'ollama']),
    model: z.string().min(1),
    thirdPartyChannel: z.enum(['openai', 'gemini', 'deepseek', 'anthropic']).optional(),
  }),
  image: z.object({
    engine: z.enum(['dreamina', 'codex', 'openai', 'gemini']),
    model: z.string().min(1),
    resolution: z.enum(['1k', '2k', '4k']).default('2k'),
  }),
  video: z.object({
    engine: z.enum(['dreamina', 'volcengine', 'dashscope', 'grok', 'openai', 'relay']),
    model: z.string().min(1),
  }),
  providers: z.object({
    openai: providerCredSchema,
    anthropic: providerCredSchema,
    gemini: providerCredSchema,
    grok: providerCredSchema,
    dashscope: providerCredSchema,
    volcengine: providerCredSchema,
    relay: z.object({
      url: z.string().default(''),
      apiKey: z.string().default(''),
    }),
  }),
})

export class SaveStudioModelsHubDto extends createZodDto(saveStudioModelsHubSchema, 'SaveStudioModelsHubDto') {}

export const testStudioModelConnectionSchema = z.object({
  kind: z.enum(['agy', 'codex', 'dreamina', 'ollama', 'thirdParty']),
  model: z.string().optional(),
  protocol: z.enum(['openai', 'anthropic', 'openrouter', 'deepseek', 'gemini']).optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
})

export class TestStudioModelConnectionDto extends createZodDto(testStudioModelConnectionSchema, 'TestStudioModelConnectionDto') {}

export const dreaminaAuthStartSchema = z.object({
  force: z.boolean().optional(),
})

export class DreaminaAuthStartDto extends createZodDto(dreaminaAuthStartSchema, 'DreaminaAuthStartDto') {}

export const dreaminaAuthPollSchema = z.object({
  deviceCode: z.string().min(1),
})

export class DreaminaAuthPollDto extends createZodDto(dreaminaAuthPollSchema, 'DreaminaAuthPollDto') {}
