import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { inspect } from 'node:util'

import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  ProviderIdSchema,
  isWellFormedProviderSecret,
  type ProviderCredentialList,
  type ProviderCredentialStatus,
  type ProviderId,
} from '../../src/shared/providerContracts.js'
import type { SqliteDatabase } from '../database.js'
import {
  ProviderCredentialRepository,
  type StoredProviderCredential,
} from '../repositories/providerCredentials.js'

export const MASTER_KEY_ENV = 'FOUNDER_APP_MASTER_KEY'
export const MASTER_KEY_BYTES = 32

const CIPHER = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const ENCRYPTION_VERSION = 1
const KEY_CHECK_CONTEXT = 'founder-app/master-key-check/v1'
const REDACTED = '[REDACTED]'
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export type CredentialErrorCode =
  | 'master_key_missing'
  | 'master_key_invalid'
  | 'master_key_mismatch'
  | 'invalid_provider'
  | 'invalid_credential'
  | 'credential_not_found'
  | 'credential_corrupted'
  | 'storage_failure'

// Messages are fixed strings: never interpolate secrets, keys, or ciphertext.
export class CredentialError extends Error {
  constructor(
    message: string,
    readonly code: CredentialErrorCode,
  ) {
    super(message)
    this.name = 'CredentialError'
  }
}

const INVALID_KEY_MESSAGE = `${MASTER_KEY_ENV} must be standard padded base64 that decodes to exactly 32 bytes`

export class ProviderSecret {
  readonly #value: string

  constructor(value: string) {
    this.#value = value
  }

  reveal(): string {
    return this.#value
  }

  toJSON() {
    return REDACTED
  }

  toString() {
    return REDACTED
  }

  [Symbol.toPrimitive]() {
    return REDACTED
  }

  [inspect.custom]() {
    return `ProviderSecret ${REDACTED}`
  }
}

export function parseMasterKey(value: string): Buffer {
  if (
    typeof value !== 'string' ||
    !value ||
    !CANONICAL_BASE64.test(value)
  ) {
    throw new CredentialError(INVALID_KEY_MESSAGE, 'master_key_invalid')
  }

  const decoded = Buffer.from(value, 'base64')
  if (
    decoded.length !== MASTER_KEY_BYTES ||
    decoded.toString('base64') !== value
  ) {
    decoded.fill(0)
    throw new CredentialError(INVALID_KEY_MESSAGE, 'master_key_invalid')
  }

  return decoded
}

export function readMasterKey(
  environment: NodeJS.ProcessEnv,
): Buffer | undefined {
  const value = environment[MASTER_KEY_ENV]
  if (value === undefined || value === '') {
    return undefined
  }
  return parseMasterKey(value)
}

function deriveKeyCheck(key: Buffer) {
  return createHmac('sha256', key)
    .update(KEY_CHECK_CONTEXT)
    .digest('base64')
}

function additionalData(provider: ProviderId) {
  return Buffer.from(
    `founder-app/provider-credential/v${ENCRYPTION_VERSION}:${provider}`,
    'utf8',
  )
}

function sameText(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function assertProvider(provider: unknown): asserts provider is ProviderId {
  if (!ProviderIdSchema.safeParse(provider).success) {
    throw new CredentialError('Unknown AI provider', 'invalid_provider')
  }
}

function notConfigured(provider: ProviderId): ProviderCredentialStatus {
  return {
    provider,
    label: PROVIDER_LABELS[provider],
    status: 'not_configured',
    lastFour: null,
    validatedAt: null,
  }
}

function toStatus(
  credential: StoredProviderCredential,
): ProviderCredentialStatus {
  return {
    provider: credential.provider,
    label: PROVIDER_LABELS[credential.provider],
    status: 'valid',
    lastFour: credential.lastFour,
    validatedAt: credential.validatedAt,
  }
}

function withStorage<T>(action: () => T): T {
  try {
    return action()
  } catch (error) {
    if (error instanceof CredentialError) {
      throw error
    }
    throw new CredentialError(
      'Provider credential storage failed',
      'storage_failure',
    )
  }
}

export interface CredentialVaultOptions {
  masterKey?: Buffer
  now?: () => Date
}

export class CredentialVault {
  readonly #repository: ProviderCredentialRepository
  readonly #key: Buffer | undefined
  readonly #keyCheck: string | undefined
  readonly #now: () => Date

  constructor(
    repository: ProviderCredentialRepository,
    options: CredentialVaultOptions = {},
  ) {
    if (
      options.masterKey !== undefined &&
      options.masterKey.length !== MASTER_KEY_BYTES
    ) {
      throw new CredentialError(INVALID_KEY_MESSAGE, 'master_key_invalid')
    }
    this.#repository = repository
    this.#key = options.masterKey ? Buffer.from(options.masterKey) : undefined
    this.#keyCheck = this.#key ? deriveKeyCheck(this.#key) : undefined
    this.#now = options.now ?? (() => new Date())
  }

  get masterKeyConfigured(): boolean {
    return this.#key !== undefined
  }

  list(): ProviderCredentialList {
    const stored = withStorage(() => this.#repository.list())
    const byProvider = new Map(
      stored.map((credential) => [credential.provider, credential]),
    )

    return {
      masterKeyConfigured: this.masterKeyConfigured,
      providers: PROVIDER_IDS.map((provider) => {
        const credential = byProvider.get(provider)
        return credential ? toStatus(credential) : notConfigured(provider)
      }),
    }
  }

  status(provider: ProviderId): ProviderCredentialStatus {
    assertProvider(provider)
    const credential = withStorage(() => this.#repository.find(provider))
    return credential ? toStatus(credential) : notConfigured(provider)
  }

  // Checks everything that can fail locally before a provider is contacted.
  assertCanStore(provider: ProviderId, secret: ProviderSecret): void {
    assertProvider(provider)
    this.#requireKey()

    if (!isWellFormedProviderSecret(secret.reveal())) {
      throw new CredentialError(
        'Provider credential must be 16-512 visible ASCII characters with no spaces',
        'invalid_credential',
      )
    }

    const stored = withStorage(() => this.#repository.list())
    if (
      stored.some(
        (credential) => !sameText(credential.keyCheck, this.#keyCheck!),
      )
    ) {
      throw this.#mismatch()
    }
  }

  store(
    provider: ProviderId,
    secret: ProviderSecret,
    validatedAt: Date = this.#now(),
  ): ProviderCredentialStatus {
    this.assertCanStore(provider, secret)
    const key = this.#requireKey()
    const plaintext = secret.reveal()
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(CIPHER, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    })
    cipher.setAAD(additionalData(provider))
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    const now = this.#now().toISOString()
    const existing = withStorage(() => this.#repository.find(provider))
    const credential: StoredProviderCredential = {
      provider,
      encryptionVersion: ENCRYPTION_VERSION,
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyCheck: this.#keyCheck!,
      lastFour: plaintext.slice(-4),
      validatedAt: validatedAt.toISOString(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    withStorage(() => this.#repository.save(credential))
    return toStatus(credential)
  }

  reveal(provider: ProviderId): ProviderSecret {
    assertProvider(provider)
    const key = this.#requireKey()
    const credential = withStorage(() => this.#repository.find(provider))
    if (!credential) {
      throw new CredentialError(
        `No ${PROVIDER_LABELS[provider]} credential is stored`,
        'credential_not_found',
      )
    }
    if (!sameText(credential.keyCheck, this.#keyCheck!)) {
      throw this.#mismatch()
    }

    const corrupted = new CredentialError(
      `Stored ${PROVIDER_LABELS[provider]} credential failed integrity checks`,
      'credential_corrupted',
    )
    const iv = Buffer.from(credential.iv, 'base64')
    const authTag = Buffer.from(credential.authTag, 'base64')
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw corrupted
    }

    let plaintext: string
    try {
      const decipher = createDecipheriv(CIPHER, key, iv, {
        authTagLength: AUTH_TAG_BYTES,
      })
      decipher.setAAD(additionalData(provider))
      decipher.setAuthTag(authTag)
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(credential.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    } catch {
      throw corrupted
    }

    if (!isWellFormedProviderSecret(plaintext)) {
      throw corrupted
    }
    return new ProviderSecret(plaintext)
  }

  remove(provider: ProviderId): ProviderCredentialStatus {
    assertProvider(provider)
    withStorage(() => this.#repository.delete(provider))
    return notConfigured(provider)
  }

  verifyStoredCredentials(): void {
    const stored = withStorage(() => this.#repository.list())
    if (stored.length === 0) {
      return
    }
    if (!this.#key) {
      throw new CredentialError(
        `Encrypted provider credentials are stored but ${MASTER_KEY_ENV} is not set`,
        'master_key_missing',
      )
    }
    if (
      stored.some(
        (credential) => !sameText(credential.keyCheck, this.#keyCheck!),
      )
    ) {
      throw this.#mismatch()
    }
  }

  toJSON() {
    return { masterKeyConfigured: this.masterKeyConfigured }
  }

  [inspect.custom]() {
    return `CredentialVault { masterKeyConfigured: ${this.masterKeyConfigured} }`
  }

  #requireKey(): Buffer {
    if (!this.#key) {
      throw new CredentialError(
        `${MASTER_KEY_ENV} is not set; provider credentials cannot be stored or used`,
        'master_key_missing',
      )
    }
    return this.#key
  }

  #mismatch() {
    return new CredentialError(
      `${MASTER_KEY_ENV} does not match the key used to encrypt stored provider credentials`,
      'master_key_mismatch',
    )
  }
}

export function createCredentialVault(
  database: SqliteDatabase,
  environment: NodeJS.ProcessEnv,
  options: Omit<CredentialVaultOptions, 'masterKey'> = {},
): CredentialVault {
  const masterKey = readMasterKey(environment)
  try {
    const vault = new CredentialVault(
      new ProviderCredentialRepository(database),
      { ...options, masterKey },
    )
    vault.verifyStoredCredentials()
    return vault
  } finally {
    masterKey?.fill(0)
  }
}
