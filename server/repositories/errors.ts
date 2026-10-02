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

function isConstraintError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  const { code } = error as { code?: unknown }
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')
}

export function throwRepositoryFailure(
  error: unknown,
  storageMessage: string,
): never {
  if (error instanceof RepositoryError) {
    throw error
  }

  if (isConstraintError(error)) {
    throw new RepositoryError(storageMessage, 'conflict')
  }

  throw new RepositoryError(storageMessage, 'storage_failure')
}
