import {
  EnrichmentBatchResponseSchema,
  EnrichmentProgressResponseSchema,
  FounderWebResultsResponseSchema,
  type CreateEnrichmentRunRequest,
  type EnrichmentBatch,
  type FounderWebResultsData,
} from '../../shared/contracts'

export type WebResultsTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

async function readEnvelope<T>(
  response: Response,
  schema: {
    safeParse(value: unknown):
      | {
          success: true
          data:
            | { ok: true; data: T }
            | {
                ok: false
                error: { code: string; message: string }
              }
        }
      | { success: false }
  },
) {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('The server returned an invalid JSON response')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new Error('The server returned an invalid API response')
  }
  if (!parsed.data.ok) {
    throw new Error(parsed.data.error.message)
  }
  return parsed.data.data
}

export async function loadFounderWebResults(
  founderId: string,
  transport: WebResultsTransport = fetch,
): Promise<FounderWebResultsData> {
  const response = await transport(
    `/api/v2/founders/${encodeURIComponent(founderId)}/web-results`,
    {
      method: 'GET',
      headers: { accept: 'application/json' },
    },
  )
  return readEnvelope(response, FounderWebResultsResponseSchema)
}

export async function createEnrichmentRun(
  request: CreateEnrichmentRunRequest,
  transport: WebResultsTransport = fetch,
): Promise<EnrichmentBatch> {
  const response = await transport('/api/v2/enrichment/runs', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  return readEnvelope(response, EnrichmentBatchResponseSchema)
}

export async function getEnrichmentProgress(
  runId: string,
  transport: WebResultsTransport = fetch,
) {
  const response = await transport(
    `/api/v2/enrichment/runs/${encodeURIComponent(runId)}/progress`,
    {
      method: 'GET',
      headers: { accept: 'application/json' },
    },
  )
  return readEnvelope(response, EnrichmentProgressResponseSchema)
}
