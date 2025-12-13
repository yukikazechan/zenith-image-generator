/**
 * Gitee Provider Tests
 * Tests with mocked fetch - no real API calls
 */

import { ApiErrorCode } from '@z-image/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GiteeProvider } from '../gitee'
import type { ProviderGenerateRequest } from '../types'

// Default request with all required fields
const defaultRequest: ProviderGenerateRequest = {
  prompt: 'a cat',
  model: 'z-image-turbo',
  width: 1024,
  height: 1024,
  authToken: 'test-key',
}

describe('GiteeProvider', () => {
  const provider = new GiteeProvider()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('properties', () => {
    it('should have correct id', () => {
      expect(provider.id).toBe('gitee')
    })

    it('should have correct name', () => {
      expect(provider.name).toBe('Gitee AI')
    })
  })

  describe('generate - auth validation', () => {
    it('should throw AUTH_REQUIRED when no token provided', async () => {
      await expect(
        provider.generate({ ...defaultRequest, authToken: undefined })
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_REQUIRED,
      })
    })

    it('should throw AUTH_REQUIRED with empty token', async () => {
      await expect(provider.generate({ ...defaultRequest, authToken: '' })).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_REQUIRED,
      })
    })
  })

  describe('generate - successful request', () => {
    it('should call Gitee API with correct parameters', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/img.png' }] }),
      } as Response)

      await provider.generate({
        prompt: 'a beautiful sunset',
        model: 'z-image-turbo',
        width: 1024,
        height: 768,
        steps: 12,
        seed: 42,
        authToken: 'test-api-key',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://ai.gitee.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          },
        })
      )

      // Verify request body
      const call = mockFetch.mock.calls[0]
      const body = JSON.parse(call[1]?.body as string)
      expect(body).toMatchObject({
        prompt: 'a beautiful sunset',
        model: 'z-image-turbo',
        width: 1024,
        height: 768,
        seed: 42,
        num_inference_steps: 12,
        response_format: 'url',
      })
    })

    it('should return image URL and seed', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/generated.png' }] }),
      } as Response)

      const result = await provider.generate({
        ...defaultRequest,
        seed: 12345,
      })

      expect(result.url).toBe('https://example.com/generated.png')
      expect(result.seed).toBe(12345)
    })

    it('should generate random seed if not provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/img.png' }] }),
      } as Response)

      const result = await provider.generate(defaultRequest)

      expect(result.seed).toBeGreaterThan(0)
      expect(result.seed).toBeLessThanOrEqual(2147483647)
    })

    it('should include negative prompt when provided', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/img.png' }] }),
      } as Response)

      await provider.generate({
        ...defaultRequest,
        negativePrompt: 'blurry, low quality',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(body.negative_prompt).toBe('blurry, low quality')
    })

    it('should include guidance scale when provided', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/img.png' }] }),
      } as Response)

      await provider.generate({
        ...defaultRequest,
        guidanceScale: 7.5,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(body.guidance_scale).toBe(7.5)
    })

    it('should trim auth token whitespace', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: 'https://example.com/img.png' }] }),
      } as Response)

      await provider.generate({
        ...defaultRequest,
        authToken: '  my-key-with-spaces  ',
      })

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer my-key-with-spaces')
    })
  })

  describe('generate - error handling', () => {
    it('should handle 401 unauthorized error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      } as Response)

      await expect(
        provider.generate({ ...defaultRequest, authToken: 'bad-key' })
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID,
      })
    })

    it('should handle 429 rate limit error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      } as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.RATE_LIMITED,
      })
    })

    it('should handle quota exceeded error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } }),
      } as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.QUOTA_EXCEEDED,
      })
    })

    it('should handle expired token error', async () => {
      // Note: Current implementation treats "expired" as AUTH_INVALID since
      // it checks for 401 first. This test reflects actual behavior.
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Token has expired' } }),
      } as Response)

      await expect(
        provider.generate({ ...defaultRequest, authToken: 'expired-key' })
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID, // Expired tokens return AUTH_INVALID
      })
    })

    it('should handle generic provider error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Internal server error' } }),
      } as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.PROVIDER_ERROR,
      })
    })

    it('should handle JSON parse error in error response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      } as unknown as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.PROVIDER_ERROR,
      })
    })

    it('should handle no image in response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.GENERATION_FAILED,
      })
    })

    it('should handle missing data field in response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)

      await expect(provider.generate(defaultRequest)).rejects.toMatchObject({
        code: ApiErrorCode.GENERATION_FAILED,
      })
    })
  })
})
