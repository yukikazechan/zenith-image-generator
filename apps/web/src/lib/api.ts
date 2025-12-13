/**
 * Unified API Client
 *
 * Provides a unified interface for image generation across providers
 */

import type {
  ApiErrorCode,
  ApiErrorResponse,
  GenerateRequest,
  GenerateSuccessResponse,
  UpscaleRequest,
  UpscaleResponse,
} from '@z-image/shared'
import { PROVIDER_CONFIGS, type ProviderType } from './constants'

const API_URL = import.meta.env.VITE_API_URL || ''

/** API error with code */
export interface ApiErrorInfo {
  message: string
  code?: ApiErrorCode
  details?: ApiErrorResponse['details']
}

/** API response type */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorInfo?: ApiErrorInfo }

/** Parse error response from API */
function parseErrorResponse(data: unknown): ApiErrorInfo {
  if (typeof data === 'object' && data !== null) {
    const errorData = data as ApiErrorResponse
    return {
      message: errorData.error || 'Unknown error',
      code: errorData.code,
      details: errorData.details,
    }
  }
  return { message: 'Unknown error' }
}

/** Get user-friendly error message based on error code */
export function getErrorMessage(errorInfo: ApiErrorInfo): string {
  const { code, message, details } = errorInfo

  switch (code) {
    case 'AUTH_REQUIRED':
      return `Please configure your ${details?.provider || 'API'} token first`
    case 'AUTH_INVALID':
      return `Invalid ${details?.provider || 'API'} token. Please check your token and try again.`
    case 'AUTH_EXPIRED':
      return `Your ${details?.provider || 'API'} token has expired. Please update it.`
    case 'RATE_LIMITED':
      return `Too many requests. Please wait ${details?.retryAfter ? `${details.retryAfter} seconds` : 'a moment'} and try again.`
    case 'QUOTA_EXCEEDED':
      return `API quota exceeded for ${details?.provider || 'this provider'}. Please check your account.`
    case 'INVALID_PROMPT':
      return message || 'Invalid prompt. Please check your input.'
    case 'PROVIDER_ERROR':
    case 'UPSTREAM_ERROR':
      return details?.upstream || message || 'Provider service error. Please try again.'
    case 'TIMEOUT':
      return `Request timed out. ${details?.provider || 'The service'} may be busy. Please try again.`
    default:
      return message || 'An error occurred. Please try again.'
  }
}

/** Generate image request options */
export interface GenerateOptions {
  provider: ProviderType
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  steps?: number
  seed?: number
  model?: string
}

/** Auth token for API calls */
export interface AuthToken {
  token?: string
}

/**
 * Generate image using the unified API
 */
export async function generateImage(
  options: GenerateOptions,
  auth: AuthToken
): Promise<ApiResponse<GenerateSuccessResponse>> {
  const { provider, prompt, negativePrompt, width, height, steps, seed, model } = options
  const { token } = auth

  const providerConfig = PROVIDER_CONFIGS[provider]
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token && providerConfig) {
    headers[providerConfig.authHeader] = token
  }

  const body: GenerateRequest = {
    provider,
    model: model || 'z-image-turbo',
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    seed,
  }

  try {
    const response = await fetch(`${API_URL}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorInfo = parseErrorResponse(data)
      return {
        success: false,
        error: getErrorMessage(errorInfo),
        errorInfo,
      }
    }

    return { success: true, data: data as GenerateSuccessResponse }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

/**
 * Upscale image using RealESRGAN
 */
export async function upscaleImage(
  url: string,
  scale = 4,
  hfToken?: string
): Promise<ApiResponse<UpscaleResponse>> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (hfToken) {
    headers['X-HF-Token'] = hfToken
  }

  const body: UpscaleRequest = { url, scale }

  try {
    const response = await fetch(`${API_URL}/api/upscale`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorInfo = parseErrorResponse(data)
      return {
        success: false,
        error: getErrorMessage(errorInfo),
        errorInfo,
      }
    }

    return { success: true, data: data as UpscaleResponse }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}
