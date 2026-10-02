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

function meaningfulText(value: string) {
  const withoutMarkers = value
    .replace(/\[(?:\d+|source|citation)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
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
    if (meaningfulText(span)) return span
    return sentenceNear(text, start, end)
  }

  if (annotationCount === 1 && meaningfulText(text)) return text.trim()
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
