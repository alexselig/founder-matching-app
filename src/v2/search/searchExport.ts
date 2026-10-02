import type { SearchResult } from './searchEngine'

const COLUMNS: readonly [string, (result: SearchResult) => string | number][] = [
  ['Founder ID', ({ founder }) => founder.id],
  ['Founder name', ({ founder }) => founder.name],
  ['Company', ({ founder }) => founder.company],
  ['Company vertical', ({ founder }) => founder.companyVertical],
  ['Role', ({ founder }) => founder.role],
  ['Age', ({ founder }) => founder.age],
  ['Education', ({ founder }) => founder.education],
  ['Cohort group', ({ founder }) => founder.cohortGroup],
  ['Cohort section', ({ founder }) => founder.cohortSection],
  ['Matched dimensions', (result) => matchedDisplays(result).join('; ')],
]

export function matchedDisplays(result: SearchResult) {
  return [...new Set(result.matchedDimensions.map((dimension) => dimension.display))]
}

function csvCell(value: string | number) {
  const raw = String(value)
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildSearchResultsCsv(results: readonly SearchResult[]) {
  const rows = [
    COLUMNS.map(([label]) => label),
    ...results.map((result) => COLUMNS.map(([, read]) => read(result))),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function searchExportFilename(date = new Date()) {
  return `founder-search-results-${date.toISOString().slice(0, 10)}.csv`
}

export function downloadSearchResultsCsv(results: readonly SearchResult[]) {
  const blob = new Blob([buildSearchResultsCsv(results)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = searchExportFilename()
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
