/**
 * Z-Image API - Platform Agnostic Hono App
 *
 * This module exports a platform-agnostic Hono app that can be used
 * with any runtime (Node.js, Cloudflare Workers, Deno, Bun, etc.)
 */

import {
  ApiError,
  ApiErrorCode,
  type ApiErrorResponse,
  Errors,
  type GenerateRequest,
  type GenerateSuccessResponse,
  type ImageDetails,
  HF_SPACES,
  MODEL_CONFIGS,
  PROVIDER_CONFIGS,
  type ProviderType,
  getModelsByProvider,
  getModelByProviderAndId,
  isAllowedImageUrl,
  validateDimensions,
  validatePrompt,
  validateScale,
  validateSteps,
} from '@z-image/shared'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { getProvider, hasProvider } from './providers'

/** Convert any error to ApiErrorResponse */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) {
    return err
  }
  if (err instanceof Error) {
    return Errors.unknown(err.message)
  }
  return Errors.unknown('An unknown error occurred')
}

/** Send error response */
function sendError(c: Context, err: unknown): Response {
  const apiError = toApiError(err)
  const response: ApiErrorResponse = apiError.toResponse()
  return c.json(response, apiError.statusCode as 400 | 401 | 429 | 500 | 502 | 504)
}

/** Extract complete event data from SSE stream */
function extractCompleteEventData(sseStream: string): unknown {
  const lines = sseStream.split('\n')
  let currentEvent = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.substring(6).trim()
    } else if (line.startsWith('data:')) {
      const jsonData = line.substring(5).trim()
      if (currentEvent === 'complete') {
        return JSON.parse(jsonData)
      }
      if (currentEvent === 'error') {
        // Parse actual error message from data
        try {
          const errorData = JSON.parse(jsonData)
          const errorMsg =
            errorData?.error || errorData?.message || JSON.stringify(errorData) || 'Unknown error'
          throw new Error(errorMsg)
        } catch (e) {
          if (e instanceof SyntaxError) {
            throw new Error(jsonData || 'Unknown SSE error')
          }
          throw e
        }
      }
    }
  }
  // No complete/error event found, show raw response for debugging
  throw new Error(`Unexpected SSE response: ${sseStream.substring(0, 300)}`)
}

/** Call Gradio API for upscaling */
async function callGradioApi(baseUrl: string, endpoint: string, data: unknown[], hfToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (hfToken) headers.Authorization = `Bearer ${hfToken}`

  const queue = await fetch(`${baseUrl}/gradio_api/call/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  })

  if (!queue.ok) throw new Error(`Queue request failed: ${queue.status}`)

  const queueData = (await queue.json()) as { event_id?: string }
  if (!queueData.event_id) throw new Error('No event_id returned')

  const result = await fetch(`${baseUrl}/gradio_api/call/${endpoint}/${queueData.event_id}`, {
    headers,
  })
  const text = await result.text()

  return extractCompleteEventData(text) as unknown[]
}

export interface AppConfig {
  corsOrigins?: string[]
}

export function createApp(config: AppConfig = {}) {
  const app = new Hono().basePath('/api')

  // Default CORS origins for development
  const defaultOrigins = ['http://localhost:5173', 'http://localhost:3000']
  const origins = config.corsOrigins || defaultOrigins

  // CORS middleware
  app.use('/*', async (c, next) => {
    return cors({
      origin: origins,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-API-Key', 'X-HF-Token', 'X-MS-Token'],
    })(c, next)
  })

  // Health check
  app.get('/', (c) => {
    return c.json({ message: 'Z-Image API is running' })
  })

  // Get all providers
  app.get('/providers', (c) => {
    const providers = Object.values(PROVIDER_CONFIGS).map((p) => ({
      id: p.id,
      name: p.name,
      requiresAuth: p.requiresAuth,
      authHeader: p.authHeader,
    }))
    return c.json({ providers })
  })

  // Get models by provider
  app.get('/providers/:provider/models', (c) => {
    const provider = c.req.param('provider') as ProviderType
    if (!PROVIDER_CONFIGS[provider]) {
      return c.json({ error: `Invalid provider: ${provider}` }, 400)
    }
    const models = getModelsByProvider(provider).map((m) => ({
      id: m.id,
      name: m.name,
      features: m.features,
    }))
    return c.json({ provider, models })
  })

  // Get all models
  app.get('/models', (c) => {
    const models = MODEL_CONFIGS.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      features: m.features,
    }))
    return c.json({ models })
  })

  // Unified generate endpoint
  app.post('/generate', async (c) => {
    let body: GenerateRequest & { negative_prompt?: string; num_inference_steps?: number }
    try {
      body = await c.req.json()
    } catch {
      return sendError(c, Errors.invalidParams('body', 'Invalid JSON body'))
    }

    // Determine provider (default to gitee for backward compatibility)
    const providerId = body.provider || 'gitee'
    if (!hasProvider(providerId)) {
      return sendError(c, Errors.invalidProvider(providerId))
    }

    // Get auth token based on provider
    const providerConfig = PROVIDER_CONFIGS[providerId]
    const authToken = c.req.header(providerConfig?.authHeader || 'X-API-Key')

    // Check auth requirement
    if (providerConfig?.requiresAuth && !authToken) {
      return sendError(c, Errors.authRequired(providerConfig.name))
    }

    // Validate prompt
    const promptValidation = validatePrompt(body.prompt)
    if (!promptValidation.valid) {
      return sendError(c, Errors.invalidPrompt(promptValidation.error || 'Invalid prompt'))
    }

    // Validate dimensions
    const width = body.width ?? 1024
    const height = body.height ?? 1024
    const dimensionsValidation = validateDimensions(width, height)
    if (!dimensionsValidation.valid) {
      return sendError(c, Errors.invalidDimensions(dimensionsValidation.error || 'Invalid dimensions'))
    }

    // Validate steps
    const steps = body.steps ?? body.num_inference_steps ?? 9
    const stepsValidation = validateSteps(steps)
    if (!stepsValidation.valid) {
      return sendError(c, Errors.invalidParams('steps', stepsValidation.error || 'Invalid steps'))
    }

    try {
      const startTime = Date.now()
      const provider = getProvider(providerId as ProviderType)
      const result = await provider.generate({
        model: body.model,
        prompt: body.prompt,
        negativePrompt: body.negativePrompt || body.negative_prompt,
        width,
        height,
        steps,
        seed: body.seed,
        guidanceScale: body.guidanceScale,
        authToken,
      })
      const duration = Date.now() - startTime

      // Get model and provider display names
      const modelConfig = getModelByProviderAndId(providerId as ProviderType, body.model)
      const modelName = modelConfig?.name || body.model
      const providerName = providerConfig?.name || providerId

      // Build dimensions string with aspect ratio
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
      const divisor = gcd(width, height)
      const ratioW = width / divisor
      const ratioH = height / divisor
      const dimensions = `${width} x ${height} (${ratioW}:${ratioH})`

      // Format duration
      const durationStr = duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`

      const imageDetails: ImageDetails = {
        url: result.url,
        provider: providerName,
        model: modelName,
        dimensions,
        duration: durationStr,
        seed: result.seed,
        steps,
        prompt: body.prompt,
        negativePrompt: body.negativePrompt || body.negative_prompt || '',
      }

      const response: GenerateSuccessResponse = { imageDetails }
      return c.json(response)
    } catch (err) {
      console.error(`${providerId} Error:`, err)
      return sendError(c, err)
    }
  })

  // Legacy HuggingFace endpoint (for backward compatibility)
  app.post('/generate-hf', async (c) => {
    let body: { prompt: string; width?: number; height?: number; model?: string; seed?: number; steps?: number }
    try {
      body = await c.req.json()
    } catch {
      return sendError(c, Errors.invalidParams('body', 'Invalid JSON body'))
    }

    // Validate prompt
    const promptValidation = validatePrompt(body.prompt)
    if (!promptValidation.valid) {
      return sendError(c, Errors.invalidPrompt(promptValidation.error || 'Invalid prompt'))
    }

    const hfToken = c.req.header('X-HF-Token')
    const width = body.width ?? 1024
    const height = body.height ?? 1024
    const modelId = body.model || 'z-image-turbo'
    const steps = body.steps ?? 9

    const dimensionsValidation = validateDimensions(width, height)
    if (!dimensionsValidation.valid) {
      return sendError(c, Errors.invalidDimensions(dimensionsValidation.error || 'Invalid dimensions'))
    }

    try {
      const startTime = Date.now()
      const provider = getProvider('huggingface')
      const result = await provider.generate({
        model: modelId,
        prompt: body.prompt,
        width,
        height,
        steps,
        seed: body.seed,
        authToken: hfToken,
      })
      const duration = Date.now() - startTime

      // Get model display name
      const modelConfig = getModelByProviderAndId('huggingface', modelId)
      const modelName = modelConfig?.name || modelId

      // Build dimensions string with aspect ratio
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
      const divisor = gcd(width, height)
      const ratioW = width / divisor
      const ratioH = height / divisor
      const dimensions = `${width} x ${height} (${ratioW}:${ratioH})`

      // Format duration
      const durationStr = duration >= 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`

      const imageDetails: ImageDetails = {
        url: result.url,
        provider: 'HuggingFace',
        model: modelName,
        dimensions,
        duration: durationStr,
        seed: result.seed,
        steps,
        prompt: body.prompt,
        negativePrompt: '',
      }

      const response: GenerateSuccessResponse = { imageDetails }
      return c.json(response)
    } catch (err) {
      return sendError(c, err)
    }
  })

  // Upscale endpoint
  app.post('/upscale', async (c) => {
    let body: { url: string; scale?: number }
    try {
      body = await c.req.json()
    } catch {
      return sendError(c, Errors.invalidParams('body', 'Invalid JSON body'))
    }

    if (!body.url || typeof body.url !== 'string') {
      return sendError(c, Errors.invalidParams('url', 'url is required'))
    }

    if (!isAllowedImageUrl(body.url)) {
      return sendError(c, Errors.invalidParams('url', 'URL not allowed'))
    }

    const hfToken = c.req.header('X-HF-Token')
    const scale = body.scale ?? 4

    const scaleValidation = validateScale(scale)
    if (!scaleValidation.valid) {
      return sendError(c, Errors.invalidParams('scale', scaleValidation.error || 'Invalid scale'))
    }

    try {
      const data = await callGradioApi(
        HF_SPACES.upscaler,
        'realesrgan',
        [
          { path: body.url, meta: { _type: 'gradio.FileData' } },
          'RealESRGAN_x4plus',
          0.5,
          false,
          scale,
        ],
        hfToken
      )
      const result = data as Array<{ url?: string }>
      const imageUrl = result[0]?.url
      if (!imageUrl) {
        return sendError(c, Errors.generationFailed('HuggingFace Upscaler', 'No image returned'))
      }
      return c.json({ url: imageUrl })
    } catch (err) {
      return sendError(c, err)
    }
  })

  return app
}

// Default app instance for simple usage
const app = createApp()

export default app
