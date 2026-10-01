import { describe, expect, it } from 'vitest'

import { createServer } from './app'

describe('createServer', () => {
  it('reports V2 and database readiness', async () => {
    const server = createServer({
      databaseStatus: () => 'ready',
    })

    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/health',
    })

    expect(response.json()).toEqual({ version: 'v2', database: 'ready' })

    await server.close()
  })
})
