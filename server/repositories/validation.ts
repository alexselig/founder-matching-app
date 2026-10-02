import { RepositoryError } from './errors.js'

export function assertDenseArray(
  value: unknown,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new RepositoryError(
      `${label} must be an array`,
      'invalid_data',
    )
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new RepositoryError(
        `${label} must not contain sparse entries`,
        'invalid_data',
      )
    }
  }
}

export function assertNoSparseArrays(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
): void {
  if (!value || typeof value !== 'object') {
    return
  }

  if (seen.has(value)) {
    return
  }
  seen.add(value)

  if (Array.isArray(value)) {
    assertDenseArray(value, label)
    for (const entry of value) {
      assertNoSparseArrays(entry, label, seen)
    }
    return
  }

  for (const entry of Object.values(value)) {
    assertNoSparseArrays(entry, label, seen)
  }
}
