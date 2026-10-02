import {
  ProviderError,
  type ProviderAdapter,
  type ProviderWebResult,
  type WebSearchQuery,
} from './types.js'
import { responseAnnotationResults } from './citations.js'
import { validateResponsesSearchEnvelope } from './responses.js'

type FetchTransport = typeof fetch

export interface OpenAIProviderOptions {
  apiKey: string
  model: string
  transport?: FetchTransport
  baseUrl?: string
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
      'OpenAI credential is required',
    )
  }
}

function retryAfterMs(response: Response) {
  const retryAfter = response.headers.get('retry-after')
  if (!retryAfter) {
    return undefined
  }
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const timestamp = Date.parse(retryAfter)
  return Number.isNaN(timestamp)
    ? undefined
    : Math.max(0, timestamp - Date.now())
}

function providerHttpError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new ProviderError(
      'invalid_credential',
      'OpenAI rejected the configured credential',
    )
  }
  if (response.status === 429) {
    return new ProviderError(
      'rate_limited',
      'OpenAI rate limited the request',
      {
        retryable: true,
        retryAfterMs: retryAfterMs(response),
      },
    )
  }
  if (response.status >= 500) {
    return new ProviderError(
      'unavailable',
      'OpenAI is temporarily unavailable',
      { retryable: true },
    )
  }
  return new ProviderError(
    'invalid_response',
    `OpenAI request failed with status ${response.status}`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalOutputText(body: unknown) {
  if (!isRecord(body)) return undefined
  if (typeof body.output_text === 'string') {
    return body.output_text.trim() || undefined
  }
  if (!Array.isArray(body.output)) return undefined

  return (
    body.output
      .filter(isRecord)
      .flatMap((item) =>
        Array.isArray(item.content) ? item.content : [],
      )
      .filter(isRecord)
      .map((content) =>
        typeof content.text === 'string' ? content.text : '',
      )
      .join('')
      .trim() || undefined
  )
}

function outputText(body: unknown) {
  if (!isRecord(body)) {
    throw new ProviderError(
      'invalid_response',
      'OpenAI returned an invalid response',
    )
  }
  const text = optionalOutputText(body)
  if (!text) {
    throw new ProviderError(
      'invalid_response',
      'OpenAI returned no text output',
    )
  }
  return text
}

function parseJsonOutput(body: unknown) {
  const text = outputText(body)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ProviderError(
      'invalid_response',
      'OpenAI returned invalid JSON',
      { cause: error },
    )
  }
}

function interpretationInstruction(
  kind: 'search' | 'dinner-criteria' | 'hard-rule',
) {
  const formats = {
    search:
      '{"text":"remaining free text","dimensions":[{"field":"companyVertical","operator":"contains","value":"fintech"}]}',
    'dinner-criteria':
      '{"criteria":[{"field":"role","objective":"diverse","weight":"high","enabled":true}]}',
    'hard-rule':
      '{"type":"same_company_separation"}',
  }
  return [
    'Return one JSON object only. Do not add markdown.',
    `Task: interpret a founder-matching ${kind} request.`,
    `Use this shape as a guide: ${formats[kind]}`,
    'Use only fields from: id, cohortGroup, cohortSection, companyVertical, company, age, education, role.',
    'Do not invent founder data.',
  ].join(' ')
}

function annotationResults(body: unknown): ProviderWebResult[] {
  return responseAnnotationResults(
    body,
    'OpenAI web source',
    'OpenAI URL citation.',
  )
}

export function createOpenAIProvider(
  options: OpenAIProviderOptions,
): ProviderAdapter {
  requireCredential(options.apiKey)
  if (!options.model.trim()) {
    throw new ProviderError(
      'unsupported',
      'OpenAI model configuration is required',
    )
  }

  const transport = options.transport ?? fetch
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  )

  async function request(
    path: string,
    init: RequestInit,
    secret = options.apiKey,
  ) {
    requireCredential(secret)
    let response: Response
    try {
      response = await transport(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      throw new ProviderError(
        'unavailable',
        'OpenAI request could not be completed',
        { retryable: true, cause: error },
      )
    }

    if (!response.ok) {
      throw providerHttpError(response)
    }
    try {
      return (await response.json()) as unknown
    } catch (error) {
      throw new ProviderError(
        'invalid_response',
        'OpenAI returned invalid JSON',
        { cause: error },
      )
    }
  }

  async function interpret(
    kind: 'search' | 'dinner-criteria' | 'hard-rule',
    input: string,
  ) {
    const body = await request('/responses', {
      method: 'POST',
      body: JSON.stringify({
        model: options.model,
        instructions: interpretationInstruction(kind),
        input,
      }),
    })
    return parseJsonOutput(body)
  }

  return {
    id: 'openai',
    capabilities,
    async validateCredential() {
      await request('/models?limit=1', { method: 'GET' })
    },
    parseSearch: (input) => interpret('search', input),
    parseDinnerCriteria: (input) =>
      interpret('dinner-criteria', input),
    parseHardRule: (input) => interpret('hard-rule', input),
    async searchWeb(query: WebSearchQuery) {
      const body = await request('/responses', {
        method: 'POST',
        body: JSON.stringify({
          model: options.model,
          tools: [{ type: 'web_search_preview' }],
          input: [
            'Search the public web for this exact founder identity.',
            'Prefer sources that jointly match founder and company.',
            'Do not infer facts without a returned source.',
            query.query,
          ].join('\n'),
        }),
      })
      const envelope = validateResponsesSearchEnvelope(body, 'OpenAI')
      const citations = annotationResults(body)
      if (citations.length > 0) return citations
      const summary = envelope.text ?? envelope.refusal
      return summary
        ? [
            {
              title: 'OpenAI generated web summary',
              url: 'https://openai.com/',
              snippet: summary,
              provenance: 'summary_only',
            },
          ]
        : []
    },
  }
}
