import {
  ProviderIdSchema,
  type ProviderId,
} from '../../src/shared/providerContracts.js'
import type { SqliteDatabase } from '../database.js'
import {
  RepositoryError,
  throwRepositoryFailure,
} from './errors.js'

export interface StoredProviderCredential {
  provider: ProviderId
  encryptionVersion: 1
  ciphertext: string
  iv: string
  authTag: string
  keyCheck: string
  lastFour: string
  validatedAt: string
  createdAt: string
  updatedAt: string
}

interface ProviderCredentialRow {
  provider: string
  encryption_version: number
  ciphertext: string
  iv: string
  auth_tag: string
  key_check: string
  last_four: string
  validated_at: string
  created_at: string
  updated_at: string
}

const SELECT_COLUMNS = `provider,
  encryption_version,
  ciphertext,
  iv,
  auth_tag,
  key_check,
  last_four,
  validated_at,
  created_at,
  updated_at`

function assertProvider(value: unknown): asserts value is ProviderId {
  if (!ProviderIdSchema.safeParse(value).success) {
    throw new RepositoryError('Unknown credential provider', 'invalid_data')
  }
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value) {
    throw new RepositoryError(`${label} is required`, 'invalid_data')
  }
}

function assertCredential(
  value: unknown,
): asserts value is StoredProviderCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RepositoryError(
      'Provider credential must be an object',
      'invalid_data',
    )
  }

  const credential = value as Record<string, unknown>
  assertProvider(credential.provider)
  if (credential.encryptionVersion !== 1) {
    throw new RepositoryError(
      'Unsupported credential encryption version',
      'invalid_data',
    )
  }
  assertText(credential.ciphertext, 'Credential ciphertext')
  assertText(credential.iv, 'Credential IV')
  assertText(credential.authTag, 'Credential authentication tag')
  assertText(credential.keyCheck, 'Credential key check')
  if (
    typeof credential.lastFour !== 'string' ||
    credential.lastFour.length !== 4
  ) {
    throw new RepositoryError(
      'Credential last four must be four characters',
      'invalid_data',
    )
  }
  for (const field of ['validatedAt', 'createdAt', 'updatedAt'] as const) {
    const timestamp = credential[field]
    if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
      throw new RepositoryError(
        `Credential ${field} must be a valid timestamp`,
        'invalid_data',
      )
    }
  }
}

function rowToCredential(row: ProviderCredentialRow): StoredProviderCredential {
  if (
    !ProviderIdSchema.safeParse(row.provider).success ||
    row.encryption_version !== 1
  ) {
    throw new RepositoryError(
      'Stored provider credential has an invalid shape',
      'storage_failure',
    )
  }

  return {
    provider: row.provider as ProviderId,
    encryptionVersion: 1,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    keyCheck: row.key_check,
    lastFour: row.last_four,
    validatedAt: row.validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Stores only ciphertext produced by the credential vault; never plaintext.
export class ProviderCredentialRepository {
  constructor(private readonly database: SqliteDatabase) {}

  save(credential: StoredProviderCredential): void {
    assertCredential(credential)

    try {
      this.database
        .prepare(
          `INSERT INTO provider_credentials (${SELECT_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider) DO UPDATE SET
             encryption_version = excluded.encryption_version,
             ciphertext = excluded.ciphertext,
             iv = excluded.iv,
             auth_tag = excluded.auth_tag,
             key_check = excluded.key_check,
             last_four = excluded.last_four,
             validated_at = excluded.validated_at,
             updated_at = excluded.updated_at`,
        )
        .run(
          credential.provider,
          credential.encryptionVersion,
          credential.ciphertext,
          credential.iv,
          credential.authTag,
          credential.keyCheck,
          credential.lastFour,
          credential.validatedAt,
          credential.createdAt,
          credential.updatedAt,
        )
    } catch (error) {
      throwRepositoryFailure(
        error,
        `Failed to save ${credential.provider} credential`,
      )
    }
  }

  find(provider: ProviderId): StoredProviderCredential | undefined {
    assertProvider(provider)

    try {
      const row = this.database
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM provider_credentials WHERE provider = ?`,
        )
        .get(provider) as ProviderCredentialRow | undefined
      return row ? rowToCredential(row) : undefined
    } catch (error) {
      throwRepositoryFailure(error, `Failed to read ${provider} credential`)
    }
  }

  list(): StoredProviderCredential[] {
    try {
      const rows = this.database
        .prepare(
          `SELECT ${SELECT_COLUMNS} FROM provider_credentials ORDER BY provider`,
        )
        .all() as ProviderCredentialRow[]
      return rows.map(rowToCredential)
    } catch (error) {
      throwRepositoryFailure(error, 'Failed to list provider credentials')
    }
  }

  delete(provider: ProviderId): boolean {
    assertProvider(provider)

    try {
      return (
        this.database
          .prepare('DELETE FROM provider_credentials WHERE provider = ?')
          .run(provider).changes > 0
      )
    } catch (error) {
      throwRepositoryFailure(error, `Failed to delete ${provider} credential`)
    }
  }
}
