/**
 * API Request/Response Type Definitions
 */

import type { ProviderType } from './provider'

/** Image generation request */
export interface GenerateRequest {
  /** Provider type */
  provider: ProviderType
  /** Model ID */
  model: string
  /** Prompt text */
  prompt: string
  /** Negative prompt */
  negativePrompt?: string
  /** Image width */
  width: number
  /** Image height */
  height: number
  /** Inference steps */
  steps?: number
  /** Random seed */
  seed?: number
  /** Guidance scale */
  guidanceScale?: number
}

/** Image generation details */
export interface ImageDetails {
  /** Image URL */
  url: string
  /** Original image URL (preserved for upscale when url is blob) */
  originalUrl?: string
  /** Provider name */
  provider: string
  /** Model name */
  model: string
  /** Dimensions string (e.g. "1024 x 1024 (1:1)") */
  dimensions: string
  /** Generation duration (e.g. "8.1s") */
  duration: string
  /** Random seed */
  seed: number
  /** Inference steps */
  steps: number
  /** Prompt text */
  prompt: string
  /** Negative prompt */
  negativePrompt: string
}


/** Image generation response (success) */
export interface GenerateSuccessResponse {
  /** Image details */
  imageDetails: ImageDetails
}

/** Image generation response (error) */
export interface GenerateErrorResponse {
  /** Error message */
  error: string
}

/** Image generation response */
export type GenerateResponse = GenerateSuccessResponse | GenerateErrorResponse

/** Check if response is an error */
export function isErrorResponse(response: GenerateResponse): response is GenerateErrorResponse {
  return 'error' in response
}

/** Image upscale request */
export interface UpscaleRequest {
  /** Original image URL */
  url: string
  /** Scale factor (1-4) */
  scale?: number
}

/** Image upscale response */
export interface UpscaleResponse {
  /** Upscaled image URL */
  url?: string
  /** Error message */
  error?: string
}

/** API validation error */
export interface ValidationError {
  field: string
  message: string
}
