export type RepositoryErrorCode =
  | 'not_found'
  | 'conflict'
  | 'invalid_data'
  | 'storage_failure'

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: RepositoryErrorCode,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}

function constraintCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined
  }

  const { code } = error as { code?: unknown }
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')
    ? code
    : undefined
}

export function throwRepositoryFailure(
  error: unknown,
  storageMessage: string,
): never {
  if (error instanceof RepositoryError) {
    throw error
  }

  const code = constraintCode(error)

  if (
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    code === 'SQLITE_CONSTRAINT_ROWID' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE'
  ) {
    throw new RepositoryError(storageMessage, 'conflict')
  }

  if (code) {
    throw new RepositoryError(storageMessage, 'invalid_data')
  }

  throw new RepositoryError(storageMessage, 'storage_failure')
}
