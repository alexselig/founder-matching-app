import { randomBytes } from 'node:crypto'
import { Writable } from 'node:stream'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ProviderCredentialListEnvelopeSchema,
  ProviderCredentialStatusEnvelopeSchema,
} from '../../src/shared/providerContracts.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { ProviderCredentialRepository } from '../repositories/providerCredentials.js'
import {
  CredentialVault,
  type ProviderSecret,
} from '../services/credentials.js'
import {
  providerRoutes,
  type CredentialValidator,
} from './providers.js'

const SECRET = 'sk-live-TopSecretProviderKey-Q9W3'
const SECRET_PREFIX = SECRET.slice(0, 16)
const NOW = new Date('2026-10-02T09:30:00.000Z')

describe('provider credential routes', () => {
  let database: SqliteDatabase
  let repository: ProviderCredentialRepository
  let server: FastifyInstance
  let logLines: string[]

  async function build(
    options: {
      masterKey?: Buffer | null
      validator?: CredentialValidator | null
    } = {},
  ) {
    const vault = new CredentialVault(repository, {
      masterKey:
        options.masterKey === null
          ? undefined
          : (options.masterKey ?? randomBytes(32)),
    })
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logLines.push(String(chunk))
        callback()
      },
    })
    server = Fastify({ logger: { level: 'trace', stream } })
    await server.register(providerRoutes, {
      vault,
      validateCredential:
        options.validator === null
          ? undefined
          : (options.validator ?? (async () => ({ ok: true as const }))),
      now: () => NOW,
    })
    return vault
  }

  function expectNoSecretLeak(body: string) {
    expect(logLines.length).toBeGreaterThan(0)
    expect(body).not.toContain(SECRET_PREFIX)
    expect(logLines.join('\n')).not.toContain(SECRET_PREFIX)
    expect(
      JSON.stringify(database.prepare('SELECT * FROM provider_credentials').all()),
    ).not.toContain(SECRET_PREFIX)
  }

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    repository = new ProviderCredentialRepository(database)
    logLines = []
  })

  afterEach(async () => {
    await server?.close()
    if (database.open) {
      database.close()
    }
  })

  it('lists every provider as not configured with no secrets and no caching', async () => {
    await build()

    const response = await server.inject({
      method: 'GET',
      url: '/api/v2/providers/credentials',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(ProviderCredentialListEnvelopeSchema.parse(response.json())).toEqual({
      ok: true,
      data: {
        masterKeyConfigured: true,
        providers: [
          { provider: 'openai', label: 'OpenAI', status: 'not_configured', lastFour: null, validatedAt: null },
          { provider: 'anthropic', label: 'Anthropic', status: 'not_configured', lastFour: null, validatedAt: null },
          { provider: 'xai', label: 'xAI', status: 'not_configured', lastFour: null, validatedAt: null },
        ],
      },
    })
  })

  it('validates then stores an encrypted credential and returns only redacted status', async () => {
    const validator = vi.fn<CredentialValidator>(async () => ({ ok: true }))
    const vault = await build({ validator })

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/anthropic/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(ProviderCredentialStatusEnvelopeSchema.parse(response.json())).toEqual({
      ok: true,
      data: {
        provider: 'anthropic',
        label: 'Anthropic',
        status: 'valid',
        lastFour: 'Q9W3',
        validatedAt: NOW.toISOString(),
      },
    })
    expect(validator).toHaveBeenCalledTimes(1)
    const [provider, passedSecret] = validator.mock.calls[0]!
    expect(provider).toBe('anthropic')
    expect((passedSecret as ProviderSecret).reveal()).toBe(SECRET)
    expect(vault.reveal('anthropic').reveal()).toBe(SECRET)
    expectNoSecretLeak(response.body)

    const list = await server.inject({ method: 'GET', url: '/api/v2/providers/credentials' })
    expect(list.json().data.providers[1]).toMatchObject({ status: 'valid', lastFour: 'Q9W3' })
    expectNoSecretLeak(list.body)
  })

  it('refuses to store without a master key before contacting the provider', async () => {
    const validator = vi.fn<CredentialValidator>(async () => ({ ok: true }))
    await build({ masterKey: null, validator })

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: 'master_key_missing',
        message: expect.stringContaining('FOUNDER_APP_MASTER_KEY'),
      },
    })
    expect(validator).not.toHaveBeenCalled()
    expect(repository.list()).toEqual([])
    expectNoSecretLeak(response.body)

    const list = await server.inject({ method: 'GET', url: '/api/v2/providers/credentials' })
    expect(list.statusCode).toBe(200)
    expect(list.json().data.masterKeyConfigured).toBe(false)
  })

  it('does not store a credential when no validator is configured', async () => {
    await build({ validator: null })

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('credential_validation_unavailable')
    expect(repository.list()).toEqual([])
    expectNoSecretLeak(response.body)
  })

  it('keeps the prior credential when the provider rejects a replacement', async () => {
    const outcomes: Array<Awaited<ReturnType<CredentialValidator>>> = [
      { ok: true },
      { ok: false, reason: 'invalid' },
    ]
    const vault = await build({ validator: async () => outcomes.shift()! })
    await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/xai/credential',
      payload: { secret: SECRET },
    })
    const replacement = 'xai-replacement-credential-ZZZZ'

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/xai/credential',
      payload: { secret: replacement },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      ok: false,
      error: { code: 'credential_invalid', message: 'xAI rejected this credential' },
    })
    expect(vault.reveal('xai').reveal()).toBe(SECRET)
    expect(response.body).not.toContain(replacement.slice(0, 16))
    expect(logLines.join('\n')).not.toContain(replacement.slice(0, 16))
  })

  it.each([
    ['rate_limited', 'provider_rate_limited'],
    ['unavailable', 'provider_unavailable'],
  ] as const)('maps a %s validation outcome to a retryable error', async (reason, code) => {
    await build({ validator: async () => ({ ok: false, reason }) })

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe(code)
    expect(repository.list()).toEqual([])
    expectNoSecretLeak(response.body)
  })

  it('never surfaces validator exceptions that echo the secret', async () => {
    await build({
      validator: async (_provider, secret) => {
        throw new Error(`401 for key ${secret.reveal()}`)
      },
    })

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('provider_unavailable')
    expect(repository.list()).toEqual([])
    expectNoSecretLeak(response.body)
  })

  it('rejects malformed JSON without echoing the request body', async () => {
    await build()

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      headers: { 'content-type': 'application/json' },
      payload: `{"secret": ${SECRET}}`,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      ok: false,
      error: { code: 'invalid_request', message: 'Request body must be valid JSON' },
    })
    expectNoSecretLeak(response.body)
  })

  it.each([
    ['a non-string secret', { secret: 12345 }],
    ['unknown fields', { secret: SECRET, note: SECRET }],
    ['a missing secret', { key: SECRET }],
  ])('rejects %s without returning validation details', async (_label, payload) => {
    await build()

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('invalid_request')
    expect(response.json().error.details).toBeUndefined()
    expectNoSecretLeak(response.body)
  })

  it('rejects a malformed credential without echoing it', async () => {
    const validator = vi.fn<CredentialValidator>(async () => ({ ok: true }))
    await build({ validator })
    const malformed = `${SECRET} with spaces`

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: malformed },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('invalid_credential')
    expect(validator).not.toHaveBeenCalled()
    expectNoSecretLeak(response.body)
  })

  it('rejects unknown providers', async () => {
    await build()

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/gemini/credential',
      payload: { secret: SECRET },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('provider_not_found')
    expectNoSecretLeak(response.body)
  })

  it('rejects oversized bodies without echoing them', async () => {
    await build()

    const response = await server.inject({
      method: 'PUT',
      url: '/api/v2/providers/openai/credential',
      payload: { secret: `${SECRET}${'x'.repeat(10_000)}` },
    })

    expect(response.statusCode).toBe(413)
    expect(response.json().ok).toBe(false)
    expectNoSecretLeak(response.body)
  })

  it('removes a credential even without a master key', async () => {
    const key = randomBytes(32)
    new CredentialVault(repository, { masterKey: key }).store(
      'openai',
      new (await import('../services/credentials.js')).ProviderSecret(SECRET),
    )
    await build({ masterKey: null })

    const response = await server.inject({
      method: 'DELETE',
      url: '/api/v2/providers/openai/credential',
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json().data).toMatchObject({ provider: 'openai', status: 'not_configured' })
    expect(repository.list()).toEqual([])
  })
})
