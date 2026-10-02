import {
  FounderListResponseSchema,
  FounderWebResultsResponseSchema,
  InterpretationResponseSchema,
  type FounderWebResultsData,
  type InterpretationResult,
  type ApiEnvelope,
} from '../shared/contracts'
import {
  DinnerListEnvelopeSchema,
  DinnerVersionListEnvelopeSchema,
  SavedDinnerEnvelopeSchema,
  type AppendDinnerVersionRequest,
  type CreateDinnerRequest,
  type DinnerSummary,
  type DinnerVersionSummary,
  type SavedDinner,
} from '../shared/dinnerContracts'
import type { Founder } from '../shared/founder'
import {
  ProviderCredentialListEnvelopeSchema,
  ProviderCredentialStatusEnvelopeSchema,
  type ProviderCredentialList,
  type ProviderCredentialStatus,
  type ProviderId,
} from '../shared/providerContracts'

async function responseJson(response: Response) {
  const body = await response.json() as unknown
  if (!response.ok) {
    const envelope = body as { error?: { message?: string } }
    throw new Error(envelope.error?.message ?? `Request failed with status ${response.status}`)
  }
  return body
}

function dataOf<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.ok) throw new Error(envelope.error.message)
  return envelope.data
}

export async function fetchFounders(): Promise<Founder[]> {
  const response = await fetch('/api/v2/founders?limit=1000')
  return dataOf(FounderListResponseSchema.parse(await responseJson(response))).items
}

export async function fetchFounderEvidence(
  founderId: string,
): Promise<FounderWebResultsData> {
  const response = await fetch(
    `/api/v2/founders/${encodeURIComponent(founderId)}/web-results`,
  )
  return dataOf(
    FounderWebResultsResponseSchema.parse(await responseJson(response)),
  )
}

export async function interpretDinnerCriteria(
  provider: 'openai' | 'anthropic' | 'xai',
  input: string,
): Promise<InterpretationResult> {
  const response = await fetch('/api/v2/ai/interpret/dinner-criteria', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, input }),
  })
  return dataOf(
    InterpretationResponseSchema.parse(await responseJson(response)),
  )
}

export async function fetchDinnerSummaries(): Promise<DinnerSummary[]> {
  const response = await fetch('/api/v2/dinners')
  return dataOf(DinnerListEnvelopeSchema.parse(await responseJson(response))).items
}

export async function fetchDinnerVersions(id: string): Promise<DinnerVersionSummary[]> {
  const response = await fetch(`/api/v2/dinners/${encodeURIComponent(id)}/versions`)
  return dataOf(DinnerVersionListEnvelopeSchema.parse(await responseJson(response))).items
}

export async function fetchDinner(id: string, version?: number | null): Promise<SavedDinner> {
  const suffix = version ? `/versions/${version}` : ''
  const response = await fetch(`/api/v2/dinners/${encodeURIComponent(id)}${suffix}`)
  return dataOf(SavedDinnerEnvelopeSchema.parse(await responseJson(response)))
}

export async function saveDinner(
  id: string | undefined,
  request: CreateDinnerRequest | AppendDinnerVersionRequest,
): Promise<SavedDinner> {
  const response = await fetch(
    id ? `/api/v2/dinners/${encodeURIComponent(id)}/versions` : '/api/v2/dinners',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  )
  return dataOf(SavedDinnerEnvelopeSchema.parse(await responseJson(response)))
}

export async function fetchDinnerExport(id: string): Promise<Blob> {
  const response = await fetch(`/api/v2/dinners/${encodeURIComponent(id)}/export?format=csv`)
  if (!response.ok) throw new Error(`Export failed with status ${response.status}`)
  return response.blob()
}

export async function fetchProviderCredentials(): Promise<ProviderCredentialList> {
  const response = await fetch('/api/v2/providers/credentials')
  return dataOf(
    ProviderCredentialListEnvelopeSchema.parse(await responseJson(response)),
  )
}

export async function saveProviderCredential(
  provider: ProviderId,
  secret: string,
): Promise<ProviderCredentialStatus> {
  const response = await fetch(
    `/api/v2/providers/${encodeURIComponent(provider)}/credential`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret }),
    },
  )
  return dataOf(
    ProviderCredentialStatusEnvelopeSchema.parse(await responseJson(response)),
  )
}

export async function deleteProviderCredential(
  provider: ProviderId,
): Promise<ProviderCredentialStatus> {
  const response = await fetch(
    `/api/v2/providers/${encodeURIComponent(provider)}/credential`,
    { method: 'DELETE' },
  )
  return dataOf(
    ProviderCredentialStatusEnvelopeSchema.parse(await responseJson(response)),
  )
}
