import Anthropic from '@anthropic-ai/sdk'

import {
  ProviderError,
  type ProviderAdapter,
  type ProviderWebResult,
  type WebSearchQuery,
} from './types.js'

const ANTHROPIC_MODEL = 'claude-opus-4-8'

export interface AnthropicProviderOptions {
  apiKey: string
  clientFactory?: (apiKey: string) => Anthropic
}

const capabilities = Object.freeze({
  searchIntent: true,
  dinnerCriteria: true,
  hardRules: true,
  reranking: true,
  webSearch: true,
  citations: true,
})

function requireCredential(secret: string) {
  if (!secret.trim()) {
    throw new ProviderError(
      'invalid_credential',
      'Anthropic credential is required',
    )
  }
}

function retryAfterMs(value: string | null | undefined) {
  const retryAfter = value?.trim()
  if (!retryAfter) return undefined
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const timestamp = Date.parse(retryAfter)
  return Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, timestamp - Date.now())
}

function mapAnthropicError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError(
      'invalid_credential',
      'Anthropic rejected the configured credential',
      { cause: error },
    )
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError(
      'rate_limited',
      'Anthropic rate limited the request',
      {
        retryable: true,
        retryAfterMs: retryAfterMs(
          error.headers?.get('retry-after'),
        ),
        cause: error,
      },
    )
  }
  if (
    error instanceof Anthropic.APIConnectionError ||
    (error instanceof Anthropic.APIError &&
      (error.status === undefined || error.status >= 500))
  ) {
    return new ProviderError(
      'unavailable',
      'Anthropic is temporarily unavailable',
      { retryable: true, cause: error },
    )
  }
  if (error instanceof ProviderError) {
    return error
  }
  return new ProviderError(
    'invalid_response',
    'Anthropic returned an invalid response',
    { cause: error },
  )
}

function parseTextJson(message: Anthropic.Message) {
  if (message.stop_reason === 'refusal') {
    throw new ProviderError(
      'unsupported',
      'Anthropic declined the interpretation request',
    )
  }
  const text = message.content
    .filter(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )
    .map((block) => block.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  if (!text) {
    throw new ProviderError(
      'invalid_response',
      'Anthropic returned no text output',
    )
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ProviderError(
      'invalid_response',
      'Anthropic returned invalid JSON',
      { cause: error },
    )
  }
}

function interpretationInstruction(
  kind: 'search' | 'dinner-criteria' | 'hard-rule',
) {
  const formats = {
    search:
      '{"text":"","dimensions":[{"field":"companyVertical","operator":"contains","value":"fintech"}]}',
    'dinner-criteria':
      '{"criteria":[{"field":"role","objective":"diverse","weight":"high","enabled":true}]}',
    'hard-rule':
      '{"type":"same_company_separation"}',
  }
  return [
    'Return one JSON object only, without markdown.',
    `Interpret this founder-matching ${kind} request.`,
    `Expected shape: ${formats[kind]}`,
    'Use only founder schema fields and do not invent source data.',
  ].join(' ')
}

function citationResults(message: Anthropic.Message) {
  const results = new Map<string, ProviderWebResult>()

  for (const block of message.content) {
    if (block.type === 'text') {
      for (const citation of block.citations ?? []) {
        if (citation.type !== 'web_search_result_location') {
          continue
        }
        results.set(citation.url, {
          title: citation.title ?? new URL(citation.url).hostname,
          url: citation.url,
          snippet: citation.cited_text,
          provenance: 'citation',
          rawMetadata: {
            encryptedIndex: citation.encrypted_index,
          },
        })
      }
      continue
    }
    if (
      block.type !== 'web_search_tool_result' ||
      !Array.isArray(block.content)
    ) {
      continue
    }
    for (const source of block.content) {
      if (!results.has(source.url)) {
        results.set(source.url, {
          title: source.title,
          url: source.url,
          snippet: source.page_age
            ? `Source age: ${source.page_age}`
            : 'Anthropic web search source.',
          provenance: 'source_metadata',
          rawMetadata: {
            ...(source.page_age === null
              ? {}
              : { pageAge: source.page_age }),
          },
        })
      }
    }
  }

  return [...results.values()]
}

export function createAnthropicProvider(
  options: AnthropicProviderOptions,
): ProviderAdapter {
  requireCredential(options.apiKey)
  const clientFactory =
    options.clientFactory ??
    ((apiKey: string) =>
      new Anthropic({
        apiKey,
        maxRetries: 0,
      }))
  const client = clientFactory(options.apiKey)

  async function interpret(
    kind: 'search' | 'dinner-criteria' | 'hard-rule',
    input: string,
  ) {
    try {
      const message = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        system: interpretationInstruction(kind),
        messages: [{ role: 'user', content: input }],
      })
      return parseTextJson(message)
    } catch (error) {
      throw mapAnthropicError(error)
    }
  }

  return {
    id: 'anthropic',
    capabilities,
    async validateCredential() {
      try {
        await clientFactory(options.apiKey).models.retrieve(ANTHROPIC_MODEL)
      } catch (error) {
        throw mapAnthropicError(error)
      }
    },
    parseSearch: (input) => interpret('search', input),
    parseDinnerCriteria: (input) =>
      interpret('dinner-criteria', input),
    parseHardRule: (input) => interpret('hard-rule', input),
    async searchWeb(query: WebSearchQuery) {
      try {
        const messages: Anthropic.MessageParam[] = [
          {
            role: 'user',
            content: [
              'Search the public web for this exact founder identity.',
              'Prefer sources that jointly match founder and company.',
              'Do not infer facts without a returned source.',
              query.query,
            ].join('\n'),
          },
        ]
        let message: Anthropic.Message | undefined

        for (let continuation = 0; continuation < 3; continuation += 1) {
          message = await client.messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'low' },
            tools: [
              {
                type: 'web_search_20260209',
                name: 'web_search',
                max_uses: 5,
              },
            ],
            messages,
          })
          if (message.stop_reason !== 'pause_turn') {
            break
          }
          messages.push({
            role: 'assistant',
            content: message.content,
          })
        }

        if (!message || message.stop_reason === 'pause_turn') {
          throw new ProviderError(
            'unavailable',
            'Anthropic web search did not complete',
            { retryable: true },
          )
        }
        if (message.stop_reason === 'refusal') {
          throw new ProviderError(
            'unsupported',
            'Anthropic declined the web search request',
          )
        }
        return citationResults(message)
      } catch (error) {
        throw mapAnthropicError(error)
      }
    },
  }
}
