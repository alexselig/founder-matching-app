import { describe, expect, it, vi } from 'vitest'

import {
  createEnrichmentRun,
  getEnrichmentProgress,
  loadFounderWebResults,
} from './webResults'

function apiResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('web-results API client', () => {
  it('loads validated founder evidence with an encoded opaque ID', async () => {
    const transport = vi.fn(() =>
      apiResponse({
        ok: true,
        data: {
          founderId: 'opaque/id',
          status: 'no_results',
          stale: false,
          items: [],
          history: [],
        },
      }),
    )

    const result = await loadFounderWebResults('opaque/id', transport)

    expect(transport).toHaveBeenCalledWith(
      '/api/v2/founders/opaque%2Fid/web-results',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.status).toBe('no_results')
  })

  it('creates enrichment and reads progress without accepting credentials', async () => {
    const transport = vi
      .fn()
      .mockImplementationOnce(() =>
        apiResponse({
          ok: true,
          data: {
            id: 'batch-1',
            provider: 'anthropic',
            status: 'queued',
            total: 1,
            completed: 0,
            failed: 0,
            cached: 0,
            createdAt: '2026-10-01T12:00:00.000Z',
            updatedAt: '2026-10-01T12:00:00.000Z',
            items: [],
          },
        }),
      )
      .mockImplementationOnce(() =>
        apiResponse({
          ok: true,
          data: {
            id: 'batch-1',
            status: 'running',
            total: 1,
            completed: 0,
            failed: 0,
            cached: 0,
            updatedAt: '2026-10-01T12:00:01.000Z',
          },
        }),
      )

    const created = await createEnrichmentRun(
      {
        provider: 'anthropic',
        founderIds: ['founder-1'],
      },
      transport,
    )
    const progress = await getEnrichmentProgress('batch-1', transport)

    expect(created.status).toBe('queued')
    expect(progress.status).toBe('running')
    const createBody = String(transport.mock.calls[0]?.[1]?.body)
    expect(createBody).not.toMatch(/credential|secret|api.?key/i)
  })

  it('throws the versioned API error for a failed response', async () => {
    const transport = vi.fn(() =>
      apiResponse(
        {
          ok: false,
          error: {
            code: 'not_found',
            message: 'Founder missing was not found',
          },
        },
        404,
      ),
    )

    await expect(
      loadFounderWebResults('missing', transport),
    ).rejects.toThrow('Founder missing was not found')
  })
})
