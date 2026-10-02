import { ProviderError } from './types.js'

export interface ValidatedResponsesEnvelope {
  text?: string
  refusal?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidEnvelope(provider: string) {
  return new ProviderError(
    'invalid_response',
    `${provider} returned an invalid or incomplete response`,
  )
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function isHttpUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hasValidOptionalString(
  record: Record<string, unknown>,
  key: string,
) {
  return !Object.hasOwn(record, key) || typeof record[key] === 'string'
}

function validateTopLevelCitation(value: unknown, provider: string) {
  if (typeof value === 'string') {
    if (!isHttpUrl(value)) throw invalidEnvelope(provider)
    return
  }
  if (
    !isRecord(value) ||
    !isHttpUrl(value.url) ||
    !['id', 'title', 'snippet', 'cited_text'].every((key) =>
      hasValidOptionalString(value, key),
    )
  ) {
    throw invalidEnvelope(provider)
  }
}

function validateAnnotation(
  value: unknown,
  textLength: number,
  provider: string,
) {
  if (
    !isRecord(value) ||
    value.type !== 'url_citation' ||
    !isHttpUrl(value.url) ||
    !['title', 'snippet', 'cited_text'].every((key) =>
      hasValidOptionalString(value, key),
    )
  ) {
    throw invalidEnvelope(provider)
  }

  const hasStart = Object.hasOwn(value, 'start_index')
  const hasEnd = Object.hasOwn(value, 'end_index')
  if (hasStart !== hasEnd) throw invalidEnvelope(provider)
  if (
    hasStart &&
    (
      !Number.isInteger(value.start_index) ||
      !Number.isInteger(value.end_index) ||
      (value.start_index as number) < 0 ||
      (value.end_index as number) <= (value.start_index as number) ||
      (value.end_index as number) > textLength
    )
  ) {
    throw invalidEnvelope(provider)
  }
}

export function validateResponsesSearchEnvelope(
  body: unknown,
  provider: string,
): ValidatedResponsesEnvelope {
  if (!isRecord(body)) throw invalidEnvelope(provider)
  if (body.status !== 'completed') {
    throw invalidEnvelope(provider)
  }
  if (
    body.error !== undefined &&
    body.error !== null
  ) {
    throw invalidEnvelope(provider)
  }
  if (
    body.incomplete_details !== undefined &&
    body.incomplete_details !== null
  ) {
    throw invalidEnvelope(provider)
  }

  const hasOutputText = Object.hasOwn(body, 'output_text')
  const hasOutput = Object.hasOwn(body, 'output')
  if (
    (hasOutputText && typeof body.output_text !== 'string') ||
    (hasOutput && !Array.isArray(body.output)) ||
    (!hasOutputText && !hasOutput)
  ) {
    throw invalidEnvelope(provider)
  }
  if (
    Object.hasOwn(body, 'citations') &&
    !Array.isArray(body.citations)
  ) {
    throw invalidEnvelope(provider)
  }
  if (Array.isArray(body.citations)) {
    for (const citation of body.citations) {
      validateTopLevelCitation(citation, provider)
    }
  }

  const textParts: string[] = []
  const refusals: string[] = []
  const topLevelText = optionalText(body.output_text)
  if (topLevelText) textParts.push(topLevelText)

  const output = Array.isArray(body.output) ? body.output : []
  let terminalOutput = hasOutputText

  for (const item of output) {
    if (!isRecord(item)) throw invalidEnvelope(provider)
    const itemType =
      typeof item.type === 'string' ? item.type : undefined
    if (itemType === undefined) {
      throw invalidEnvelope(provider)
    }
    if (
      itemType !== undefined &&
      itemType !== 'message' &&
      itemType !== 'reasoning' &&
      !itemType.endsWith('_call')
    ) {
      throw invalidEnvelope(provider)
    }
    if (itemType === 'reasoning' || itemType?.endsWith('_call')) {
      continue
    }
    if (!Array.isArray(item.content) || item.content.length === 0) {
      throw invalidEnvelope(provider)
    }
    terminalOutput = true

    for (const content of item.content) {
      if (!isRecord(content)) throw invalidEnvelope(provider)
      const contentType =
        typeof content.type === 'string'
          ? content.type
          : undefined
      if (contentType === undefined) {
        throw invalidEnvelope(provider)
      }
      if (contentType === 'refusal') {
        const refusal = optionalText(content.refusal)
        if (!refusal) throw invalidEnvelope(provider)
        refusals.push(refusal)
        continue
      }
      if (
        contentType !== undefined &&
        contentType !== 'output_text' &&
        contentType !== 'text'
      ) {
        throw invalidEnvelope(provider)
      }
      if (typeof content.text !== 'string') {
        throw invalidEnvelope(provider)
      }
      if (
        Object.hasOwn(content, 'annotations') &&
        !Array.isArray(content.annotations)
      ) {
        throw invalidEnvelope(provider)
      }
      if (Array.isArray(content.annotations)) {
        for (const annotation of content.annotations) {
          validateAnnotation(annotation, content.text.length, provider)
        }
      }
      const text = optionalText(content.text)
      if (text) textParts.push(text)
    }
  }

  if (output.length > 0 && !terminalOutput) {
    throw invalidEnvelope(provider)
  }

  return {
    ...(textParts.length === 0
      ? {}
      : { text: textParts.join('') }),
    ...(refusals.length === 0
      ? {}
      : { refusal: refusals.join(' ') }),
  }
}
