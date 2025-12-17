/**
 * Provider Registry
 */

import type { ProviderType } from '@z-image/shared'
import { giteeProvider } from './gitee'
import { huggingfaceProvider } from './huggingface'
import { modelscopeProvider } from './modelscope'
import type { ImageProvider } from './types'

/**
 * Provider registry map with type-safe keys.
 * Using `satisfies` to ensure all ProviderType keys are covered
 * while preserving the specific provider types.
 */
const providers = {
  gitee: giteeProvider,
  huggingface: huggingfaceProvider,
  modelscope: modelscopeProvider,
} as const satisfies Record<ProviderType, ImageProvider>

/** Type-safe provider ID type */
type RegisteredProviderId = keyof typeof providers

/** Get provider by ID */
export function getProvider(providerId: ProviderType): ImageProvider {
  const provider = providers[providerId as RegisteredProviderId]
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`)
  }
  return provider
}

/** Check if provider exists */
export function hasProvider(providerId: string): providerId is ProviderType {
  return providerId in providers
}

/** Get all provider IDs */
export function getProviderIds(): ProviderType[] {
  return Object.keys(providers) as ProviderType[]
}
