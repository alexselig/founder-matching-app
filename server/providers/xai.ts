import {
  ProviderError,
  type ProviderAdapter,
  type ProviderWebResult,
  type WebSearchQuery,
} from './types.js'
import { responseAnnotationResults } from './citations.js'
import { validateResponsesSearchEnvelope } from './responses.js'

type FetchTransport = typeof fetch

export interface XaiProviderOptions {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireCredential(secret: string) {
  if (!secret.trim()) {
    throw new ProviderError(
      'invalid_credential',
      'xAI credential is required',
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

function providerHttpError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new ProviderError(
      'invalid_credential',
      'xAI rejected the configured credential',
    )
  }
  if (response.status === 429) {
    return new ProviderError(
      'rate_limited',
      'xAI rate limited the request',
      {
        retryable: true,
        retryAfterMs: retryAfterMs(
          response.headers.get('retry-after'),
        ),
      },
    )
  }
  if (response.status >= 500) {
    return new ProviderError(
      'unavailable',
      'xAI is temporarily unavailable',
      { retryable: true },
    )
  }
  return new ProviderError(
    'invalid_response',
    `xAI request failed with status ${response.status}`,
  )
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
      'xAI returned an invalid response',
    )
  }
  const text = optionalOutputText(body)
  if (!text) {
    throw new ProviderError(
      'invalid_response',
      'xAI returned no text output',
    )
  }
  return text
}

function parseJsonOutput(body: unknown) {
  try {
    return JSON.parse(
      outputText(body)
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, ''),
    ) as unknown
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error
    }
    throw new ProviderError(
      'invalid_response',
      'xAI returned invalid JSON',
      { cause: error },
    )
  }
}

function interpretationInstruction(
  kind: 'search' | 'dinner-criteria' | 'hard-rule',
) {
  const formats = {
    search:
      '{"text":"","dimensions":[{"field":"role","operator":"is","value":"Technical"}]}',
    'dinner-criteria':
      '{"criteria":[{"field":"role","objective":"diverse","weight":"high","enabled":true}]}',
    'hard-rule':
      '{"type":"same_company_separation"}',
  }
  return [
    'Return JSON only.',
    `Interpret this founder-matching ${kind} request.`,
    `Expected shape: ${formats[kind]}`,
    'Use only known founder schema fields and never invent source data.',
  ].join(' ')
}

function citationResults(body: unknown): ProviderWebResult[] {
  const results = responseAnnotationResults(
    body,
    'xAI web source',
    'xAI URL citation.',
  )
  if (!isRecord(body)) return results

  const seen = new Set(results.map((result) => result.url))
  const citations = Array.isArray(body.citations) ? body.citations : []

  for (const citation of citations) {
    if (typeof citation === 'string') {
      if (seen.has(citation)) continue
      seen.add(citation)
      results.push({
        title: 'xAI web source',
        url: citation,
        snippet: 'xAI URL citation.',
        provenance: 'citation',
      })
      continue
    }
    if (
      isRecord(citation) &&
      typeof citation.url === 'string'
    ) {
      if (seen.has(citation.url)) continue
      seen.add(citation.url)
      const title =
        typeof citation.title === 'string' && citation.title.trim()
          ? citation.title.trim()
          : 'xAI web source'
      const localText = [
        citation.snippet,
        citation.cited_text,
        title === 'xAI web source' ? undefined : title,
      ].find((value): value is string =>
        typeof value === 'string' && Boolean(value.trim()),
      )
      results.push({
        ...(typeof citation.id === 'string' ? { id: citation.id } : {}),
        title,
        url: citation.url,
        snippet: localText?.trim() ?? 'xAI URL citation.',
        provenance: 'citation',
        rawMetadata: citation,
      })
    }
  }

  return results
}

export function createXaiProvider(
  options: XaiProviderOptions,
): ProviderAdapter {
  requireCredential(options.apiKey)
  if (!options.model.trim()) {
    throw new ProviderError(
      'unsupported',
      'xAI model configuration is required',
    )
  }

  const transport = options.transport ?? fetch
  const baseUrl = (options.baseUrl ?? 'https://api.x.ai/v1').replace(
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
        'xAI request could not be completed',
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
        'xAI returned invalid JSON',
        { cause: error },
      )
    }
  }

  async function interpret(
    kind: 'search' | 'dinner-criteria' | 'hard-rule',
    input: string,
  ) {
    return parseJsonOutput(
      await request('/responses', {
        method: 'POST',
        body: JSON.stringify({
          model: options.model,
          instructions: interpretationInstruction(kind),
          input,
        }),
      }),
    )
  }

  return {
    id: 'xai',
    capabilities,
    async validateCredential() {
      await request('/models', { method: 'GET' })
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
          tools: [{ type: 'web_search' }],
          input: [
            'Search the public web for this exact founder identity.',
            'Return only evidence backed by provider citations.',
            query.query,
          ].join('\n'),
        }),
      })
      const envelope = validateResponsesSearchEnvelope(body, 'xAI')
      const citations = citationResults(body)
      if (citations.length > 0) return citations
      const summary = envelope.text ?? envelope.refusal
      return summary
        ? [
            {
              title: 'xAI generated web summary',
              url: 'https://x.ai/',
              snippet: summary,
              provenance: 'summary_only',
            },
          ]
        : []
    },
  }
}
