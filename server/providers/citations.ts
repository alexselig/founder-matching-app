import type { ProviderWebResult } from './types.js'

interface CitationAnnotation {
  type?: unknown
  url?: unknown
  title?: unknown
  start_index?: unknown
  end_index?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function withoutCitationMarkers(value: string) {
  return value
    .replace(
      /\[\[?[^\]\n]+\]?\]\(\s*(?:https?:\/\/|www\.)[^)\n]+\)/giu,
      ' ',
    )
    .replace(/【\s*\d+[^】]*】/gu, ' ')
    .replace(
      /\[\[?\s*(?:\^?\d+|source|citation)[^\]\n]*\]?\]/giu,
      ' ',
    )
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulText(value: string) {
  const withoutMarkers = withoutCitationMarkers(value)
  return /[\p{L}\p{N}]/u.test(withoutMarkers) && withoutMarkers.length >= 12
}

function sentenceSegments(text: string) {
  return [...text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g)]
    .map((match) => ({
      text: match[0].trim(),
      start: match.index,
      end: match.index + match[0].length,
    }))
    .filter((segment) => meaningfulText(segment.text))
}

function sentenceNear(text: string, start: number, end: number) {
  const segments = sentenceSegments(text)
  const overlapping = segments.find(
    (segment) => start < segment.end && end > segment.start,
  )
  if (overlapping) return overlapping.text

  const preceding = [...segments]
    .reverse()
    .find((segment) => segment.end <= start)
  return preceding?.text
}

function precedingClaim(text: string, start: number) {
  const prefix = text.slice(0, start).trim()
  if (!prefix) return undefined
  const paragraph =
    prefix
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1) ?? prefix
  const cleaned = withoutCitationMarkers(paragraph)
  if (!meaningfulText(cleaned)) return undefined
  return sentenceSegments(cleaned).at(-1)?.text ?? cleaned
}

function citationText(
  text: string,
  annotation: CitationAnnotation,
  annotationCount: number,
) {
  const start =
    typeof annotation.start_index === 'number'
      ? annotation.start_index
      : undefined
  const end =
    typeof annotation.end_index === 'number'
      ? annotation.end_index
      : undefined

  if (
    start !== undefined &&
    end !== undefined &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length
  ) {
    const span = text.slice(start, end).trim()
    const cleaned = withoutCitationMarkers(span)
    if (meaningfulText(cleaned)) return cleaned
    return precedingClaim(text, start) ?? sentenceNear(text, start, end)
  }

  if (annotationCount === 1 && meaningfulText(text)) {
    return withoutCitationMarkers(text)
  }
  return undefined
}

export function responseAnnotationResults(
  body: unknown,
  fallbackTitle: string,
  fallbackSnippet: string,
): ProviderWebResult[] {
  if (!isRecord(body)) return []

  const results: ProviderWebResult[] = []
  for (const output of asRecordArray(body.output)) {
    for (const content of asRecordArray(output.content)) {
      if (typeof content.text !== 'string') continue
      const annotations = asRecordArray(content.annotations).filter(
        (annotation) =>
          annotation.type === 'url_citation' &&
          typeof annotation.url === 'string',
      ) as CitationAnnotation[]

      for (const annotation of annotations) {
        const title =
          typeof annotation.title === 'string' && annotation.title.trim()
            ? annotation.title.trim()
            : fallbackTitle
        results.push({
          title,
          url: annotation.url as string,
          snippet:
            citationText(content.text, annotation, annotations.length) ??
            (title === fallbackTitle ? fallbackSnippet : title),
          provenance: 'citation',
          rawMetadata: {
            startIndex: annotation.start_index,
            endIndex: annotation.end_index,
          },
        })
      }
    }
  }
  return results
}
