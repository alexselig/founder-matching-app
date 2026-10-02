import { randomBytes } from 'node:crypto'
import { inspect } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type SqliteDatabase } from '../database.js'
import { ProviderCredentialRepository } from '../repositories/providerCredentials.js'
import {
  CredentialError,
  CredentialVault,
  MASTER_KEY_ENV,
  ProviderSecret,
  createCredentialVault,
  parseMasterKey,
  readMasterKey,
} from './credentials.js'

const SECRET = 'sk-test-Very-Secret-Credential-7K2M'
const OTHER_SECRET = 'sk-ant-another-secret-value-9QZX'

function newKey() {
  return randomBytes(32)
}

function expectCredentialError(
  action: () => unknown,
  code: CredentialError['code'],
) {
  let caught: unknown
  try {
    action()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(CredentialError)
  expect((caught as CredentialError).code).toBe(code)
  return caught as CredentialError
}

function rawRows(database: SqliteDatabase) {
  return JSON.stringify(
    database.prepare('SELECT * FROM provider_credentials').all(),
  )
}

describe('master key parsing', () => {
  it('accepts canonical base64 that decodes to exactly 32 bytes', () => {
    const key = newKey()
    const parsed = parseMasterKey(key.toString('base64'))

    expect(parsed).toHaveLength(32)
    expect(parsed.equals(key)).toBe(true)
  })

  it.each([
    ['31 decoded bytes', randomBytes(31).toString('base64')],
    ['33 decoded bytes', randomBytes(33).toString('base64')],
    ['16 decoded bytes', randomBytes(16).toString('base64')],
    ['non-base64 characters', `${'A'.repeat(42)}!=`],
    ['url-safe alphabet', `${'_-'.repeat(21)}A=`],
    ['surrounding whitespace', ` ${randomBytes(32).toString('base64')} `],
    ['missing padding', randomBytes(32).toString('base64').replace(/=+$/, '')],
    ['non-canonical trailing bits', `${'A'.repeat(42)}B=`],
    ['a raw 32-character passphrase', 'correct-horse-battery-staple-123'],
  ])(
    'rejects %s as an invalid master key without echoing it',
    (_label, value) => {
      const error = expectCredentialError(
        () => parseMasterKey(value),
        'master_key_invalid',
      )

      expect(error.message).toContain(MASTER_KEY_ENV)
      expect(error.message).toContain('32 bytes')
      expect(error.message).not.toContain(value.trim())
    },
  )

  it('treats an unset or empty environment value as unconfigured', () => {
    expect(readMasterKey({})).toBeUndefined()
    expect(readMasterKey({ [MASTER_KEY_ENV]: '' })).toBeUndefined()
  })

  it('throws for a configured but invalid environment value', () => {
    expectCredentialError(
      () => readMasterKey({ [MASTER_KEY_ENV]: 'not-a-key' }),
      'master_key_invalid',
    )
    expectCredentialError(
      () => readMasterKey({ [MASTER_KEY_ENV]: '   ' }),
      'master_key_invalid',
    )
  })
})

describe('ProviderSecret', () => {
  it('reveals the raw secret only through reveal()', () => {
    const secret = new ProviderSecret(SECRET)

    expect(secret.reveal()).toBe(SECRET)
    expect(JSON.stringify({ secret })).not.toContain(SECRET)
    expect(String(secret)).not.toContain(SECRET)
    expect(`${secret}`).not.toContain(SECRET)
    expect(inspect(secret, { depth: 5, showHidden: true })).not.toContain(
      SECRET,
    )
    expect(inspect({ nested: { secret } }, { depth: 5 })).not.toContain(
      SECRET,
    )
    expect(Object.keys(secret)).toEqual([])
  })
})

describe('CredentialVault', () => {
  let database: SqliteDatabase
  let repository: ProviderCredentialRepository
  const validatedAt = new Date('2026-10-01T12:00:00.000Z')

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    repository = new ProviderCredentialRepository(database)
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('round-trips a credential through AES-256-GCM ciphertext', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })

    vault.store('anthropic', new ProviderSecret(SECRET), validatedAt)

    expect(vault.reveal('anthropic').reveal()).toBe(SECRET)
    const stored = repository.find('anthropic')!
    expect(stored.encryptionVersion).toBe(1)
    expect(Buffer.from(stored.iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(stored.authTag, 'base64')).toHaveLength(16)
    expect(Buffer.from(stored.ciphertext, 'base64')).toHaveLength(
      Buffer.byteLength(SECRET),
    )
  })

  it('never stores the raw credential or its base64 encoding', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })

    vault.store('openai', new ProviderSecret(SECRET), validatedAt)

    const rows = rawRows(database)
    expect(rows).not.toContain(SECRET)
    expect(rows).not.toContain(Buffer.from(SECRET).toString('base64'))
    expect(rows).not.toContain(SECRET.slice(0, 12))
  })

  it('uses a fresh IV for every encryption', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })

    vault.store('openai', new ProviderSecret(SECRET), validatedAt)
    const first = repository.find('openai')!
    vault.store('openai', new ProviderSecret(SECRET), validatedAt)
    const second = repository.find('openai')!

    expect(second.iv).not.toBe(first.iv)
    expect(second.ciphertext).not.toBe(first.ciphertext)
    expect(second.createdAt).toBe(first.createdAt)
    expect(vault.reveal('openai').reveal()).toBe(SECRET)
  })

  it('fails explicitly when a different master key reads the credential', () => {
    new CredentialVault(repository, { masterKey: newKey() }).store(
      'xai',
      new ProviderSecret(SECRET),
      validatedAt,
    )
    const wrongKeyVault = new CredentialVault(repository, {
      masterKey: newKey(),
    })

    const error = expectCredentialError(
      () => wrongKeyVault.reveal('xai'),
      'master_key_mismatch',
    )
    expect(error.message).toContain(MASTER_KEY_ENV)
    expect(error.message).not.toContain(SECRET)
  })

  it('refuses to overwrite credentials encrypted with another master key', () => {
    new CredentialVault(repository, { masterKey: newKey() }).store(
      'xai',
      new ProviderSecret(SECRET),
      validatedAt,
    )
    const wrongKeyVault = new CredentialVault(repository, {
      masterKey: newKey(),
    })

    expectCredentialError(
      () => wrongKeyVault.store('openai', new ProviderSecret(OTHER_SECRET)),
      'master_key_mismatch',
    )
    expect(repository.find('openai')).toBeUndefined()
  })

  it('detects tampered ciphertext as an integrity failure', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })
    vault.store('openai', new ProviderSecret(SECRET), validatedAt)
    const stored = repository.find('openai')!
    const tampered = Buffer.from(stored.ciphertext, 'base64')
    tampered[0] = tampered[0]! ^ 0xff
    database
      .prepare(
        'UPDATE provider_credentials SET ciphertext = ? WHERE provider = ?',
      )
      .run(tampered.toString('base64'), 'openai')

    const error = expectCredentialError(
      () => vault.reveal('openai'),
      'credential_corrupted',
    )
    expect(error.message).not.toContain(SECRET)
  })

  it('binds ciphertext to its provider', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })
    vault.store('openai', new ProviderSecret(SECRET), validatedAt)
    const stored = repository.find('openai')!
    repository.save({ ...stored, provider: 'anthropic' })

    expectCredentialError(
      () => vault.reveal('anthropic'),
      'credential_corrupted',
    )
  })

  it('returns redacted status with only label, status, last four, and validation time', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })

    const status = vault.store(
      'anthropic',
      new ProviderSecret(SECRET),
      validatedAt,
    )

    expect(status).toEqual({
      provider: 'anthropic',
      label: 'Anthropic',
      status: 'valid',
      lastFour: '7K2M',
      validatedAt: '2026-10-01T12:00:00.000Z',
    })
    expect(vault.list()).toEqual({
      masterKeyConfigured: true,
      providers: [
        {
          provider: 'openai',
          label: 'OpenAI',
          status: 'not_configured',
          lastFour: null,
          validatedAt: null,
        },
        status,
        {
          provider: 'xai',
          label: 'xAI',
          status: 'not_configured',
          lastFour: null,
          validatedAt: null,
        },
      ],
    })
    expect(JSON.stringify(vault.list())).not.toContain(SECRET.slice(0, -4))
  })

  it('reports status but refuses to store or reveal without a master key', () => {
    const vault = new CredentialVault(repository, {})

    expect(vault.masterKeyConfigured).toBe(false)
    expect(vault.list().masterKeyConfigured).toBe(false)
    expect(
      vault
        .list()
        .providers.every((entry) => entry.status === 'not_configured'),
    ).toBe(true)
    expectCredentialError(
      () => vault.store('openai', new ProviderSecret(SECRET), validatedAt),
      'master_key_missing',
    )
    expectCredentialError(() => vault.reveal('openai'), 'master_key_missing')
    expect(repository.list()).toEqual([])
  })

  it('removes a stored credential and then reports it as not found', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })
    vault.store('openai', new ProviderSecret(SECRET), validatedAt)

    expect(vault.remove('openai')).toMatchObject({
      status: 'not_configured',
    })
    expectCredentialError(
      () => vault.reveal('openai'),
      'credential_not_found',
    )
    expect(rawRows(database)).toBe('[]')
  })

  it.each([
    ['too short', 'sk-short'],
    ['internal whitespace', 'sk-test secret value 1234'],
    ['a trailing newline', `${SECRET}\n`],
    ['non-ASCII characters', 'sk-test-ünïcödé-secret-1234'],
    ['excessive length', `sk-${'a'.repeat(600)}`],
  ])(
    'rejects a malformed credential with %s without echoing it',
    (_label, value) => {
      const vault = new CredentialVault(repository, { masterKey: newKey() })

      const error = expectCredentialError(
        () => vault.store('openai', new ProviderSecret(value), validatedAt),
        'invalid_credential',
      )
      expect(error.message).not.toContain(value.trim())
      expect(repository.list()).toEqual([])
    },
  )

  it('rejects unknown providers before touching storage', () => {
    const vault = new CredentialVault(repository, { masterKey: newKey() })

    expectCredentialError(
      () =>
        vault.store('gemini' as never, new ProviderSecret(SECRET), validatedAt),
      'invalid_provider',
    )
  })

  it('keeps the master key out of serialized and inspected vault output', () => {
    const key = newKey()
    const vault = new CredentialVault(repository, { masterKey: key })
    vault.store('openai', new ProviderSecret(SECRET), validatedAt)

    const serialized = `${JSON.stringify(vault)}${inspect(vault, {
      depth: 10,
      showHidden: true,
    })}`
    expect(serialized).not.toContain(key.toString('base64'))
    expect(serialized).not.toContain(key.toString('hex'))
    expect(serialized).not.toContain(SECRET)
  })
})

describe('createCredentialVault startup checks', () => {
  let database: SqliteDatabase

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  it('starts without a master key when no credentials are stored', () => {
    const vault = createCredentialVault(database, {})

    expect(vault.masterKeyConfigured).toBe(false)
  })

  it('rejects a configured but invalid master key at startup', () => {
    expectCredentialError(
      () => createCredentialVault(database, { [MASTER_KEY_ENV]: 'invalid' }),
      'master_key_invalid',
    )
  })

  it('requires the master key once encrypted credentials are stored', () => {
    const key = newKey().toString('base64')
    createCredentialVault(database, { [MASTER_KEY_ENV]: key }).store(
      'openai',
      new ProviderSecret(OTHER_SECRET),
    )

    const error = expectCredentialError(
      () => createCredentialVault(database, {}),
      'master_key_missing',
    )
    expect(error.message).toContain('stored')
  })

  it('rejects the wrong master key for stored credentials at startup', () => {
    createCredentialVault(database, {
      [MASTER_KEY_ENV]: newKey().toString('base64'),
    }).store('openai', new ProviderSecret(OTHER_SECRET))

    expectCredentialError(
      () =>
        createCredentialVault(database, {
          [MASTER_KEY_ENV]: newKey().toString('base64'),
        }),
      'master_key_mismatch',
    )
  })

  it('reopens stored credentials with the same master key', () => {
    const key = newKey().toString('base64')
    createCredentialVault(database, { [MASTER_KEY_ENV]: key }).store(
      'xai',
      new ProviderSecret(OTHER_SECRET),
    )

    const reopened = createCredentialVault(database, {
      [MASTER_KEY_ENV]: key,
    })

    expect(reopened.reveal('xai').reveal()).toBe(OTHER_SECRET)
  })
})
