export type ProviderId = 'openai' | 'anthropic' | 'xai'

export interface ProviderCapabilities {
  searchIntent: boolean
  dinnerCriteria: boolean
  hardRules: boolean
  reranking: boolean
  webSearch: boolean
  citations: boolean
}

export type ProviderErrorCode =
  | 'invalid_credential'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'unsupported'

export interface ProviderErrorOptions {
  retryable?: boolean
  retryAfterMs?: number
  cause?: unknown
}

export class ProviderError extends Error {
  readonly retryable: boolean
  readonly retryAfterMs?: number

  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    options: ProviderErrorOptions = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ProviderError'
    this.retryable = options.retryable ?? false
    this.retryAfterMs = options.retryAfterMs
  }
}

export interface WebSearchIdentityContext {
  name: string
  company: string
  companyVertical: string
  role: string
  education: string
  cohortGroup: string
  cohortSection: string
}

export interface WebSearchQuery {
  founderId: string
  context: WebSearchIdentityContext
  query: string
}

export type WebResultProvenance =
  | 'citation'
  | 'source_metadata'
  | 'summary_only'

export interface ProviderWebResult {
  id?: string
  title: string
  url: string
  snippet: string
  confidence?: number
  entityMatch?: Readonly<{
    founder?: boolean
    company?: boolean
  }>
  provenance: WebResultProvenance
  retrievedAt?: string
  rawMetadata?: unknown
}

export interface ProviderAdapter {
  id: ProviderId
  capabilities: ProviderCapabilities
  validateCredential(secret: string): Promise<void>
  parseSearch(input: string): Promise<unknown>
  parseDinnerCriteria(input: string): Promise<unknown>
  parseHardRule(input: string): Promise<unknown>
  searchWeb(query: WebSearchQuery): Promise<ProviderWebResult[]>
}

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|credential|cookie|secret|password|prompt|request|input|body|content)/i
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /\b(?:sk|xai)-[A-Za-z0-9_-]{8,}\b/gi,
]

function redactString(value: string) {
  return SECRET_VALUE_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, '[REDACTED]'),
    value,
  )
}

export function redactProviderMetadata(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') {
    return redactString(value)
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[REDACTED_CIRCULAR]'
    }
    seen.add(value)
    return value.map((entry) => redactProviderMetadata(entry, seen))
  }
  if (typeof value !== 'object') {
    return undefined
  }
  if (seen.has(value)) {
    return '[REDACTED_CIRCULAR]'
  }
  seen.add(value)

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, entry]) => [
        key,
        redactProviderMetadata(entry, seen),
      ]),
  )
}
