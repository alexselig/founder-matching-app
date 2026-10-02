import { createAnthropicProvider } from './anthropic.js'
import { createOpenAIProvider } from './openai.js'
import type { ProviderAdapter } from './types.js'
import { createXaiProvider } from './xai.js'

export function createConfiguredProviders(
  environment: NodeJS.ProcessEnv,
): ProviderAdapter[] {
  const providers: ProviderAdapter[] = []

  if (environment.OPENAI_API_KEY && environment.OPENAI_MODEL) {
    providers.push(
      createOpenAIProvider({
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_MODEL,
      }),
    )
  }
  if (environment.ANTHROPIC_API_KEY) {
    providers.push(
      createAnthropicProvider({
        apiKey: environment.ANTHROPIC_API_KEY,
      }),
    )
  }
  if (environment.XAI_API_KEY && environment.XAI_MODEL) {
    providers.push(
      createXaiProvider({
        apiKey: environment.XAI_API_KEY,
        model: environment.XAI_MODEL,
      }),
    )
  }

  return providers
}
