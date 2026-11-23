import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { FileUtil, getErrorMessage, UserType } from '@yikart/common'
import { ContentGenerationTaskRepository } from '@yikart/mongodb'
import { z } from 'zod'
import { config } from '../../../config'
import { ImageService } from '../../ai/image'
import { VideoService } from '../../ai/video'
import { isCodexImageModelName, isDreaminaModelName, LocalBridgeService } from '../../local-bridge'
import { ContentGenerationTaskResultSchema, ContentGenerationTaskResultUnionSchema } from '../agent.vo'
import { errorResult, successResult } from './mcp.utils'

type TaskResult = z.infer<typeof ContentGenerationTaskResultUnionSchema>

interface ProxiedToolEntry {
  tool: Tool
  client: Client
  remoteName: string
}

interface TaskMcpSession {
  sessionToken: string
  taskId: string
  userId: string
  userType: UserType
  headers: Record<string, string>
  onTitleUpdate: (title: string) => void
  onTaskResult: (result: TaskResult) => void
  upstreamClients: Client[]
  proxiedTools: Map<string, ProxiedToolEntry>
  upstreamLoaded: boolean
  createdAt: number
}

const LOCAL_MCP_TOOLS: Tool[] = [
  {
    name: 'setTitle',
    description: 'Set a concise title (max 30 chars) for the current Foldframe task. Call this as your first step.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 30, description: 'Concise task title in the user language' },
      },
      required: ['title'],
    },
  },
  {
    name: 'outputTaskResult',
    description: 'Submit the structured final task result JSON (mediaOnly or fullContent array) so Foldframe renders rich media/draft/publish cards.',
    inputSchema: {
      type: 'object',
      properties: {
        result: {
          description: 'Either a mediaOnly object ({ type: "mediaOnly", action: "none", medias: [...] }) or a non-empty array of fullContent items ({ type: "fullContent", action: "none"|"navigateToDraft"|"navigateToPublish"|"createChannel", title, description, tags, medias }).',
        },
      },
      required: ['result'],
    },
  },
  {
    name: 'getCurrentTime',
    description: 'Get the current server time in ISO 8601 format.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'wait',
    description: 'Wait for a specified number of seconds (1-120) when polling async video generation tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        seconds: { type: 'integer', minimum: 1, maximum: 120 },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'generateImage',
    description: 'Generate or edit image(s) using Foldframe configured image provider (default: local Dreamina/即梦 CLI). Supports text-to-image and reference-image image-to-image. Returns public image URL(s).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image generation or editing prompt' },
        imageUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional reference image URLs for image-to-image / editing',
        },
        aspectRatio: {
          type: 'string',
          enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'],
          description: 'Output aspect ratio (default 1:1)',
        },
        imageSize: {
          type: 'string',
          enum: ['1K', '2K', '4K'],
          description: 'Output resolution tier (default 2K)',
        },
        model: {
          type: 'string',
          description: 'Optional image model name (e.g. dreamina-5.0, dreamina-5.0-pro, dreamina-4.5)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generateVideo',
    description: 'Submit an async video generation task using Foldframe configured video provider (default: local Dreamina/即梦 Seedance CLI). Supports text2video, image2video, frames2video (2 images), and multimodal2video (images + videos + audios). Returns taskId for getVideoStatus polling.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed video prompt in the user language' },
        model: {
          type: 'string',
          description: 'Optional video model (e.g. dreamina-seedance-2.0-fast, dreamina-seedance-2.0, dreamina-seedance-2.0-vip, dreamina-seedance-2.5)',
        },
        imageUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional reference image URLs (1 = image2video, 2 = first/last frame, 3+ = multimodal)',
        },
        videoUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional reference video URLs for multimodal2video',
        },
        audioUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional reference audio URLs for multimodal2video',
        },
        aspectRatio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
          description: 'Video aspect ratio (default 16:9)',
        },
        resolution: {
          type: 'string',
          enum: ['480p', '720p', '1080p', '4k'],
          description: 'Video resolution (default 720p)',
        },
        duration: {
          type: 'integer',
          minimum: 4,
          maximum: 30,
          description: 'Video duration in seconds (default 5)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'getVideoStatus',
    description: 'Poll the status of a video generation task by taskId. Returns current status and videoUrl when completed.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID returned by generateVideo' },
      },
      required: ['taskId'],
    },
  },
]

@Injectable()
export class TaskMcpHttpService {
  private readonly logger = new Logger(TaskMcpHttpService.name)
  private readonly sessions = new Map<string, TaskMcpSession>()

  constructor(
    private readonly contentGenerateRepository: ContentGenerationTaskRepository,
    private readonly imageService: ImageService,
    private readonly videoService: VideoService,
    private readonly localBridgeService: LocalBridgeService,
  ) {}

  registerSession(params: {
    taskId: string
    userId: string
    userType: UserType
    headers: Record<string, string>
    onTitleUpdate: (title: string) => void
    onTaskResult: (result: TaskResult) => void
  }): { sessionToken: string, mcpUrl: string } {
    const sessionToken = randomBytes(24).toString('hex')
    this.sessions.set(sessionToken, {
      sessionToken,
      taskId: params.taskId,
      userId: params.userId,
      userType: params.userType,
      headers: params.headers,
      onTitleUpdate: params.onTitleUpdate,
      onTaskResult: params.onTaskResult,
      upstreamClients: [],
      proxiedTools: new Map(),
      upstreamLoaded: false,
      createdAt: Date.now(),
    })

    const publicOrigin = this.localBridgeService.getPublicOrigin()
    return {
      sessionToken,
      mcpUrl: `${publicOrigin}/api/agent/mcp/${sessionToken}`,
    }
  }

  async unregisterSession(sessionToken: string): Promise<void> {
    const session = this.sessions.get(sessionToken)
    if (!session) return
    this.sessions.delete(sessionToken)
    for (const client of session.upstreamClients) {
      try {
        await client.close()
      }
      catch {}
    }
  }

  private async ensureUpstreamToolsLoaded(session: TaskMcpSession): Promise<void> {
    if (session.upstreamLoaded) return
    session.upstreamLoaded = true

    const upstreamDefs = [
      { prefix: 'account', url: `${config.serverClient.baseUrl}/account/mcp` },
      { prefix: 'content', url: `${config.serverClient.baseUrl}/content/mcp` },
      { prefix: 'statistics', url: `${config.serverClient.baseUrl}/statistics/mcp` },
      { prefix: 'channels', url: `${config.serverClient.baseUrl}/channels/mcp` },
    ]

    await Promise.all(upstreamDefs.map(async ({ prefix, url }) => {
      try {
        const transport = new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: session.headers, signal: AbortSignal.timeout(2000) },
        })
        const client = new Client({ name: `foldframe-${prefix}`, version: '1.0.0' }, { capabilities: {} })
        await Promise.race([
          (async () => {
            await client.connect(transport)
            const { tools } = await client.listTools()
            session.upstreamClients.push(client)
            for (const tool of tools) {
              const exposedName = LOCAL_MCP_TOOLS.some(t => t.name === tool.name) || session.proxiedTools.has(tool.name)
                ? `${prefix}_${tool.name}`
                : tool.name
              session.proxiedTools.set(exposedName, {
                tool: { ...tool, name: exposedName },
                client,
                remoteName: tool.name,
              })
            }
          })(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Upstream MCP timeout')), 2500)),
        ])
      }
      catch (error) {
        this.logger.debug(`Skipped upstream MCP server ${prefix} (${url}): ${getErrorMessage(error)}`)
      }
    }))
  }

  private async executeLocalTool(
    session: TaskMcpSession,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'setTitle': {
          const title = String(args['title'] || '').trim().slice(0, 30)
          if (!title) return errorResult('Title cannot be empty')
          await this.contentGenerateRepository.updateById(session.taskId, { title })
          session.onTitleUpdate(title)
          return successResult('Title updated successfully')
        }

        case 'outputTaskResult': {
          const parsed = ContentGenerationTaskResultSchema.safeParse({ result: args['result'] })
          if (!parsed.success) {
            return errorResult(`Invalid task result schema: ${parsed.error.message}`)
          }
          session.onTaskResult(parsed.data.result)
          return successResult('Task result submitted successfully')
        }

        case 'getCurrentTime': {
          return successResult(`Current time:\n- ISO 8601: ${new Date().toISOString()}`)
        }

        case 'wait': {
          const seconds = Math.min(120, Math.max(1, Number(args['seconds']) || 5))
          await new Promise(resolve => setTimeout(resolve, seconds * 1000))
          return successResult(`Waited for ${seconds} seconds`)
        }

        case 'generateImage': {
          const prompt = String(args['prompt'] || '').trim()
          if (!prompt) return errorResult('prompt is required')
          const imageUrls = Array.isArray(args['imageUrls']) ? args['imageUrls'].map(String).filter(Boolean) : []
          const aspectRatio = args['aspectRatio'] ? String(args['aspectRatio']) : '1:1'
          const imageSize = args['imageSize'] ? String(args['imageSize']) : (config.studio?.image?.resolution?.toUpperCase() || '2K')
          const requestedModel = args['model'] ? String(args['model']) : (config.studio?.image?.model || 'dreamina-5.0')

          const useCodexImage = isCodexImageModelName(requestedModel)
            || (!isDreaminaModelName(requestedModel) && config.studio?.image?.engine === 'codex')
          if (useCodexImage) {
            const result = await this.imageService.userCodexGeneration({
              userId: session.userId,
              userType: session.userType,
              prompt,
              model: isCodexImageModelName(requestedModel) ? requestedModel : 'codex-gpt-image-2',
              aspectRatio,
              imageSize,
              imageUrls,
            })
            const urls = result.images.map(img => FileUtil.buildUrl(img.url))
            return {
              content: [
                ...urls.map((uri, idx) => ({ type: 'resource_link' as const, uri, name: `Image ${idx + 1}` })),
                { type: 'text' as const, text: urls.map((u, i) => `Image URL ${i + 1}: ${u}`).join('\n') },
              ],
            }
          }

          const useDreamina = config.studio?.image?.engine === 'dreamina' || isDreaminaModelName(requestedModel)
          if (useDreamina) {
            const result = await this.imageService.userDreaminaGeneration({
              userId: session.userId,
              userType: session.userType,
              prompt,
              model: isDreaminaModelName(requestedModel) ? requestedModel : (config.studio?.image?.model || 'dreamina-5.0'),
              aspectRatio,
              imageSize,
              imageUrls,
            })
            const urls = result.images.map(img => FileUtil.buildUrl(img.url))
            return {
              content: [
                ...urls.map((uri, idx) => ({ type: 'resource_link' as const, uri, name: `Image ${idx + 1}` })),
                { type: 'text' as const, text: urls.map((u, i) => `Image URL ${i + 1}: ${u}`).join('\n') },
              ],
            }
          }

          if (requestedModel.startsWith('gemini-') || config.studio?.image?.engine === 'gemini') {
            const result = await this.imageService.userGeminiGeneration({
              userId: session.userId,
              userType: session.userType,
              prompt,
              imageUrls,
              imageSize: imageSize as '1K' | '2K' | '4K',
              aspectRatio: aspectRatio as '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9',
              model: (requestedModel.startsWith('gemini-') ? requestedModel : 'gemini-3.1-flash-image-preview') as 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview',
            })
            const urls = result.images.map(img => FileUtil.buildUrl(img.url))
            return {
              content: [
                ...urls.map((uri, idx) => ({ type: 'resource_link' as const, uri, name: `Image ${idx + 1}` })),
                { type: 'text' as const, text: urls.map((u, i) => `Image URL ${i + 1}: ${u}`).join('\n') },
              ],
            }
          }

          const result = imageUrls.length > 0
            ? await this.imageService.userEdit({
                userId: session.userId,
                userType: session.userType,
                model: requestedModel,
                image: imageUrls,
                prompt,
                n: 1,
              })
            : await this.imageService.userGeneration({
                userId: session.userId,
                userType: session.userType,
                model: requestedModel,
                prompt,
                n: 1,
              })
          const urls = (result.list || []).map(item => item.url).filter((u): u is string => Boolean(u)).map(u => FileUtil.buildUrl(u))
          return {
            content: [
              ...urls.map((uri, idx) => ({ type: 'resource_link' as const, uri, name: `Image ${idx + 1}` })),
              { type: 'text' as const, text: urls.map((u, i) => `Image URL ${i + 1}: ${u}`).join('\n') },
            ],
          }
        }

        case 'generateVideo': {
          const prompt = String(args['prompt'] || '').trim()
          if (!prompt) return errorResult('prompt is required')
          const configuredVideoModel = config.studio?.video?.model || 'dreamina-seedance-2.0-fast'
          const model = args['model'] ? String(args['model']) : configuredVideoModel
          const imageUrls = Array.isArray(args['imageUrls']) ? args['imageUrls'].map(String).filter(Boolean) : undefined
          const videoUrls = Array.isArray(args['videoUrls']) ? args['videoUrls'].map(String).filter(Boolean) : undefined
          const audioUrls = Array.isArray(args['audioUrls']) ? args['audioUrls'].map(String).filter(Boolean) : undefined
          const aspectRatio = args['aspectRatio'] ? String(args['aspectRatio']) : '16:9'
          const resolution = args['resolution'] ? String(args['resolution']) : '720p'
          const duration = args['duration'] ? Number(args['duration']) : 5

          const res = await this.videoService.userVideoGeneration({
            userId: session.userId,
            userType: session.userType,
            model,
            prompt,
            image: imageUrls,
            videos: videoUrls,
            audios: audioUrls,
            ratio: aspectRatio,
            resolution,
            duration,
            metadata: { aspectRatio, resolution },
          })
          return successResult(`Video task submitted (${model}), taskId: ${res.id}. Call wait and getVideoStatus to poll completion.`)
        }

        case 'getVideoStatus': {
          const taskId = String(args['taskId'] || '').trim()
          if (!taskId) return errorResult('taskId is required')
          const status = await this.videoService.getVideoTaskStatus({
            userId: session.userId,
            userType: session.userType,
            taskId,
          })
          if (status.videoUrl) {
            return successResult(`Video completed! taskId: ${taskId}, videoUrl: ${status.videoUrl}${status.coverUrl ? `, coverUrl: ${status.coverUrl}` : ''}`)
          }
          if (status.error?.message) {
            return errorResult(`Video failed! taskId: ${taskId}, error: ${status.error.message}`)
          }
          return successResult(`Video status: ${status.status}, taskId: ${taskId}`)
        }

        default: {
          const proxied = session.proxiedTools.get(name)
          if (!proxied) {
            return errorResult(`Unknown tool: ${name}`)
          }
          const remoteResult = await proxied.client.callTool({
            name: proxied.remoteName,
            arguments: args,
          })
          return remoteResult as CallToolResult
        }
      }
    }
    catch (error) {
      this.logger.warn({ tool: name, error: getErrorMessage(error) }, 'Task MCP tool execution error')
      return errorResult(getErrorMessage(error))
    }
  }

  private async dispatchJsonRpcMessage(
    session: TaskMcpSession,
    msg: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const id = msg['id']
    const method = typeof msg['method'] === 'string' ? msg['method'] : ''
    const params = (msg['params'] && typeof msg['params'] === 'object' ? msg['params'] : {}) as Record<string, unknown>

    // JSON-RPC notifications (no id) require no response body
    if (id === undefined || method.startsWith('notifications/')) {
      return null
    }

    switch (method) {
      case 'initialize': {
        const clientProto = typeof params['protocolVersion'] === 'string' && params['protocolVersion']
          ? params['protocolVersion']
          : '2025-03-26'
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: clientProto,
            capabilities: { tools: {} },
            serverInfo: { name: 'foldframe-agent-mcp', version: '1.0.0' },
          },
        }
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: {} }
      }

      case 'tools/list': {
        await this.ensureUpstreamToolsLoaded(session)
        const tools: Tool[] = [
          ...LOCAL_MCP_TOOLS,
          ...Array.from(session.proxiedTools.values()).map(entry => entry.tool),
        ]
        return { jsonrpc: '2.0', id, result: { tools } }
      }

      case 'tools/call': {
        const toolName = String(params['name'] || '')
        const toolArgs = (params['arguments'] && typeof params['arguments'] === 'object'
          ? params['arguments']
          : {}) as Record<string, unknown>
        if (!toolName) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Missing tool name' },
          }
        }
        const result = await this.executeLocalTool(session, toolName, toolArgs)
        return { jsonrpc: '2.0', id, result }
      }

      case 'resources/list': {
        return { jsonrpc: '2.0', id, result: { resources: [] } }
      }

      case 'prompts/list': {
        return { jsonrpc: '2.0', id, result: { prompts: [] } }
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        }
      }
    }
  }

  async handleHttpRequest(sessionToken: string, req: Request, res: Response): Promise<void> {
    const session = this.sessions.get(sessionToken)
    if (!session) {
      throw new NotFoundException('Invalid or expired agent MCP session')
    }

    const httpMethod = (req.method || 'POST').toUpperCase()
    if (httpMethod === 'DELETE') {
      res.status(204).end()
      return
    }
    if (httpMethod === 'GET') {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed (stateless MCP server).' },
        id: null,
      })
      return
    }

    const body = req.body
    if (!body || typeof body !== 'object') {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Invalid JSON-RPC payload' },
        id: null,
      })
      return
    }

    if (Array.isArray(body)) {
      const responses = (await Promise.all(
        body
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map(item => this.dispatchJsonRpcMessage(session, item)),
      )).filter((item): item is Record<string, unknown> => item !== null)

      if (responses.length === 0) {
        res.status(202).end()
        return
      }
      res.status(200).json(responses)
      return
    }

    const response = await this.dispatchJsonRpcMessage(session, body as Record<string, unknown>)
    if (!response) {
      res.status(202).end()
      return
    }
    res.status(200).json(response)
  }
}
