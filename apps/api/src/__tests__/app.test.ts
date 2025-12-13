/**
 * API Route Integration Tests
 * Tests full request/response flow using Hono's testing utilities
 * All external API calls are mocked
 */

import { ApiErrorCode } from '@z-image/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'

// Type definitions for API responses
interface HealthResponse {
  status: string
  message: string
  timestamp: string
}

interface Provider {
  id: string
  name: string
  requiresAuth: boolean
  authHeader: string
}

interface ProvidersResponse {
  providers: Provider[]
}

interface Model {
  id: string
  name: string
  provider: string
}

interface ModelsResponse {
  provider?: string
  models: Model[]
}

interface ImageDetails {
  url: string
  provider: string
  model: string
  dimensions: string
  duration: string
  seed: number
  steps: number
  prompt: string
  negativePrompt?: string
}

interface GenerateResponse {
  imageDetails: ImageDetails
}

interface ErrorResponse {
  error: string
  code: string
  details?: Record<string, unknown>
}

describe('API Routes', () => {
  const app = createApp()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('GET /api/', () => {
    it('should return health check response', async () => {
      // Note: basePath is '/api', so health check is at '/api' not '/api/'
      const res = await app.request('/api')
      expect(res.status).toBe(200)

      const json = (await res.json()) as HealthResponse
      expect(json.status).toBe('ok')
      expect(json.message).toContain('Z-Image API')
      expect(json.timestamp).toBeDefined()
    })
  })

  describe('GET /api/providers', () => {
    it('should return list of providers', async () => {
      const res = await app.request('/api/providers')
      expect(res.status).toBe(200)

      const json = (await res.json()) as ProvidersResponse
      expect(json.providers).toBeInstanceOf(Array)
      expect(json.providers.length).toBeGreaterThan(0)

      // Check Gitee provider
      const gitee = json.providers.find((p) => p.id === 'gitee')
      expect(gitee).toBeDefined()
      expect(gitee?.requiresAuth).toBe(true)
      expect(gitee?.authHeader).toBe('X-API-Key')

      // Check HuggingFace provider
      const hf = json.providers.find((p) => p.id === 'huggingface')
      expect(hf).toBeDefined()
      expect(hf?.requiresAuth).toBe(false)
    })
  })

  describe('GET /api/providers/:provider/models', () => {
    it('should return models for valid provider', async () => {
      const res = await app.request('/api/providers/gitee/models')
      expect(res.status).toBe(200)

      const json = (await res.json()) as ModelsResponse
      expect(json.provider).toBe('gitee')
      expect(json.models).toBeInstanceOf(Array)
    })

    it('should return 400 for invalid provider', async () => {
      const res = await app.request('/api/providers/invalid-provider/models')
      expect(res.status).toBe(400)

      const json = (await res.json()) as ErrorResponse
      expect(json.error).toContain('Invalid provider')
    })
  })

  describe('GET /api/models', () => {
    it('should return all models', async () => {
      const res = await app.request('/api/models')
      expect(res.status).toBe(200)

      const json = (await res.json()) as ModelsResponse
      expect(json.models).toBeInstanceOf(Array)
      expect(json.models.length).toBeGreaterThan(0)

      // Each model should have id, name, provider
      const model = json.models[0]
      expect(model.id).toBeDefined()
      expect(model.name).toBeDefined()
      expect(model.provider).toBeDefined()
    })
  })

  describe('POST /api/generate', () => {
    describe('input validation', () => {
      it('should reject invalid JSON body', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json',
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_PARAMS)
      })

      it('should reject empty prompt', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({ prompt: '', provider: 'gitee' }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_PROMPT)
      })

      it('should reject prompt that is too long', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            prompt: 'x'.repeat(5000),
            provider: 'gitee',
          }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_PROMPT)
      })

      it('should reject invalid dimensions (too small)', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
            width: 100,
            height: 100,
          }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_DIMENSIONS)
      })

      it('should reject invalid dimensions (too large)', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
            width: 4096,
            height: 4096,
          }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_DIMENSIONS)
      })

      it('should reject invalid steps', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test-key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
            steps: 100,
          }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_PARAMS)
      })

      it('should reject invalid provider', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'nonexistent',
          }),
        })

        expect(res.status).toBe(400)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.INVALID_PROVIDER)
      })
    })

    describe('authentication', () => {
      it('should require auth for Gitee provider', async () => {
        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
          }),
        })

        expect(res.status).toBe(401)
        const json = (await res.json()) as ErrorResponse
        expect(json.code).toBe(ApiErrorCode.AUTH_REQUIRED)
      })

      it('should not require auth for HuggingFace provider', async () => {
        // Mock successful HuggingFace response
        const mockFetch = vi.mocked(fetch)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ event_id: 'test-123' }),
        } as Response)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: async () => 'event: complete\ndata: [{"url": "https://hf.space/img.png"}, 42]\n\n',
        } as Response)

        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'huggingface',
          }),
        })

        expect(res.status).toBe(200)
      })
    })

    describe('successful generation', () => {
      it('should return imageDetails on success (Gitee)', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://gitee.ai/generated.png' }] }),
        } as Response)

        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'valid-key',
          },
          body: JSON.stringify({
            prompt: 'a beautiful sunset over mountains',
            provider: 'gitee',
            width: 1024,
            height: 768,
            steps: 12,
          }),
        })

        expect(res.status).toBe(200)

        const json = (await res.json()) as GenerateResponse
        expect(json.imageDetails).toBeDefined()
        expect(json.imageDetails.url).toBe('https://gitee.ai/generated.png')
        expect(json.imageDetails.provider).toBe('Gitee AI')
        expect(json.imageDetails.dimensions).toContain('1024')
        expect(json.imageDetails.dimensions).toContain('768')
        expect(json.imageDetails.steps).toBe(12)
        expect(json.imageDetails.prompt).toBe('a beautiful sunset over mountains')
        expect(json.imageDetails.duration).toBeDefined()
        expect(json.imageDetails.seed).toBeDefined()
      })

      it('should use default values when not specified', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://gitee.ai/img.png' }] }),
        } as Response)

        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
          }),
        })

        expect(res.status).toBe(200)
        const json = (await res.json()) as GenerateResponse

        // Default dimensions: 1024x1024
        expect(json.imageDetails.dimensions).toContain('1024')
      })

      it('should default to gitee provider when not specified', async () => {
        const mockFetch = vi.mocked(fetch)
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ url: 'https://gitee.ai/img.png' }] }),
        } as Response)

        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
          }),
        })

        expect(res.status).toBe(200)
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('ai.gitee.com'),
          expect.anything()
        )
      })
    })

    describe('error responses', () => {
      it('should return proper error format on provider error', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Internal error' } }),
        } as Response)

        const res = await app.request('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'key',
          },
          body: JSON.stringify({
            prompt: 'a cat',
            provider: 'gitee',
          }),
        })

        expect(res.status).toBe(502)
        const json = (await res.json()) as ErrorResponse
        expect(json.error).toBeDefined()
        expect(json.code).toBe(ApiErrorCode.PROVIDER_ERROR)
      })
    })
  })

  describe('POST /api/generate-hf (legacy endpoint)', () => {
    it('should work without auth', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ event_id: 'test-123' }),
      } as Response)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'event: complete\ndata: [{"url": "https://hf.space/img.png"}, 42]\n\n',
      } as Response)

      const res = await app.request('/api/generate-hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'a cat' }),
      })

      expect(res.status).toBe(200)
      const json = (await res.json()) as GenerateResponse
      expect(json.imageDetails.url).toBe('https://hf.space/img.png')
      expect(json.imageDetails.provider).toBe('HuggingFace')
    })

    it('should validate prompt', async () => {
      const res = await app.request('/api/generate-hf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: '' }),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as ErrorResponse
      expect(json.code).toBe(ApiErrorCode.INVALID_PROMPT)
    })
  })

  describe('POST /api/upscale', () => {
    it('should reject missing url', async () => {
      const res = await app.request('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })

    it('should reject non-whitelisted url', async () => {
      const res = await app.request('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://evil.com/image.png' }),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as ErrorResponse
      expect(json.error).toContain('not allowed')
    })

    it('should reject invalid scale', async () => {
      const res = await app.request('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://tuan2308-upscaler.hf.space/file/image.png',
          scale: 10,
        }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('404 Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.request('/api/unknown-route')
      expect(res.status).toBe(404)

      const json = (await res.json()) as ErrorResponse
      expect(json.error).toBe('Not found')
      expect(json.code).toBe('NOT_FOUND')
    })
  })
})
