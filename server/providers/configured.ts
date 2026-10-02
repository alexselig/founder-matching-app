import {
  PROVIDER_IDS,
  type ProviderId,
} from '../../src/shared/providerIds.js'
import type { CredentialVault } from '../services/credentials.js'
import { createAnthropicProvider } from './anthropic.js'
import { createOpenAIProvider } from './openai.js'
import {
  ProviderError,
  type ProviderAdapter,
} from './types.js'
import { createXaiProvider } from './xai.js'

const DEFAULT_OPENAI_MODEL = 'gpt-5'
const DEFAULT_XAI_MODEL = 'grok-4'

const capabilities = Object.freeze({
  searchIntent: true,
  dinnerCriteria: true,
  hardRules: true,
  reranking: true,
  webSearch: true,
  citations: true,
})

function environmentSecret(
  provider: ProviderId,
  environment: NodeJS.ProcessEnv,
) {
  if (provider === 'openai') return environment.OPENAI_API_KEY
  if (provider === 'anthropic') return environment.ANTHROPIC_API_KEY
  return environment.XAI_API_KEY
}

export function createProviderAdapter(
  provider: ProviderId,
  apiKey: string,
  environment: NodeJS.ProcessEnv,
): ProviderAdapter {
  if (provider === 'openai') {
    return createOpenAIProvider({
      apiKey,
      model: environment.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    })
  }
  if (provider === 'anthropic') {
    return createAnthropicProvider({ apiKey })
  }
  return createXaiProvider({
    apiKey,
    model: environment.XAI_MODEL ?? DEFAULT_XAI_MODEL,
  })
}

export function createConfiguredProviders(
  environment: NodeJS.ProcessEnv,
): ProviderAdapter[] {
  return PROVIDER_IDS.flatMap((provider) => {
    const secret = environmentSecret(provider, environment)
    return secret
      ? [createProviderAdapter(provider, secret, environment)]
      : []
  })
}

function createRuntimeProvider(
  provider: ProviderId,
  environment: NodeJS.ProcessEnv,
  vault: CredentialVault,
): ProviderAdapter {
  const resolve = () => {
    const secret =
      vault.status(provider).status === 'valid'
        ? vault.reveal(provider).reveal()
        : environmentSecret(provider, environment)
    if (!secret) {
      throw new ProviderError(
        'invalid_credential',
        `${provider} credential is not configured`,
      )
    }
    return createProviderAdapter(provider, secret, environment)
  }

  return {
    id: provider,
    capabilities,
    validateCredential: () => resolve().validateCredential(),
    parseSearch: (input) => resolve().parseSearch(input),
    parseDinnerCriteria: (input) =>
      resolve().parseDinnerCriteria(input),
    parseHardRule: (input) => resolve().parseHardRule(input),
    searchWeb: (query) => resolve().searchWeb(query),
  }
}

export function createRuntimeProviders(
  environment: NodeJS.ProcessEnv,
  vault: CredentialVault,
): ProviderAdapter[] {
  return PROVIDER_IDS.map((provider) =>
    createRuntimeProvider(provider, environment, vault),
  )
}
