/**
 * Custom OpenAI-Compatible LLM Provider
 *
 * Allows users to use their own OpenAI-compatible API endpoints
 */

import { Errors } from '@z-image/shared'
import type { LLMCompleteRequest, LLMCompleteResult, LLMProvider } from './types'

/** Custom provider configuration passed at runtime */
export interface CustomProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/** OpenAI-compatible chat completion response */
interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
    code?: string
  }
}

/**
 * Custom LLM Provider for OpenAI-compatible APIs
 *
 * This provider is special - it doesn't have a fixed URL or model.
 * Instead, it receives configuration at runtime via the request.
 */
class CustomLLMProvider implements LLMProvider {
  readonly id = 'custom'
  readonly name = 'Custom (OpenAI Compatible)'

  /**
   * Complete a chat request using custom OpenAI-compatible API
   *
   * Note: For custom provider, the authToken is not used.
   * Instead, the API key is passed via customConfig.
   */
  async complete(
    request: LLMCompleteRequest,
    customConfig?: CustomProviderConfig
  ): Promise<LLMCompleteResult> {
    if (!customConfig) {
      throw Errors.invalidParams('customConfig', 'Custom provider requires configuration')
    }

    const { baseUrl, apiKey, model } = customConfig

    if (!baseUrl || !apiKey || !model) {
      throw Errors.invalidParams(
        'customConfig',
        'Custom provider requires baseUrl, apiKey, and model'
      )
    }

    // Normalize base URL - ensure it ends with /chat/completions
    let url = baseUrl.trim()
    if (url.endsWith('/')) {
      url = url.slice(0, -1)
    }
    if (!url.endsWith('/chat/completions')) {
      if (!url.endsWith('/v1')) {
        url = `${url}/v1`
      }
      url = `${url}/chat/completions`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.prompt },
        ],
        max_tokens: request.maxTokens || 1000,
        temperature: request.temperature ?? 0.7,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      let errorMessage = errorText

      try {
        const errorJson = JSON.parse(errorText) as OpenAIResponse
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message
        }
      } catch {
        // Use raw error text
      }

      if (response.status === 401) {
        throw Errors.authInvalid(this.name)
      }
      if (response.status === 429) {
        throw Errors.rateLimited(this.name)
      }
      if (response.status === 402) {
        throw Errors.quotaExceeded(this.name)
      }

      throw Errors.providerError(this.name, errorMessage)
    }

    const data = (await response.json()) as OpenAIResponse
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw Errors.providerError(this.name, 'Empty response from provider')
    }

    return { content, model }
  }
}

export const customLLMProvider = new CustomLLMProvider()
