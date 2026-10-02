import type { Founder } from '../../shared/founder'
import { percent, tableName, tableNumber } from './dinnerState'
import type { DinnerSolution } from './optimizer'

export interface DinnerExportOptions {
  readonly includeDetails: boolean
}

export interface DinnerExportFile {
  readonly filename: string
  readonly content: string
}

const BASE_COLUMNS = ['Table', 'Table name', 'Seat', 'Founder ID', 'Founder name', 'Founder fit', 'Table quality'] as const
const DETAIL_COLUMNS: readonly [string, (founder: Founder) => string | number][] = [
  ['Company', (founder) => founder.company],
  ['Role', (founder) => founder.role],
  ['Age', (founder) => founder.age],
  ['Education', (founder) => founder.education],
  ['Cohort group', (founder) => founder.cohortGroup],
  ['Cohort section', (founder) => founder.cohortSection],
]

function csvCell(value: string | number) {
  const raw = String(value)
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function buildDinnerCsv(
  solution: DinnerSolution,
  foundersById: ReadonlyMap<string, Founder>,
  options: DinnerExportOptions,
) {
  const header: string[] = [...BASE_COLUMNS, ...(options.includeDetails ? DETAIL_COLUMNS.map(([label]) => label) : [])]
  const rows: (string | number)[][] = [header]
  for (const table of solution.tables) {
    const seats = table.seats.length ? table.seats : table.founderIds
    seats.forEach((founderId, seat) => {
      const founder = founderId ? foundersById.get(founderId) : undefined
      if (!founderId || !founder) return
      rows.push([
        tableNumber(table.index),
        tableName(table.index),
        seat + 1,
        founder.id,
        founder.name,
        percent(table.founderFits[founderId] ?? 0),
        percent(table.quality),
        ...(options.includeDetails ? DETAIL_COLUMNS.map(([, read]) => read(founder)) : []),
      ])
    })
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function dinnerExportFilename(planName: string, date = new Date()) {
  const slug = planName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'seating-plan'}-${date.toISOString().slice(0, 10)}.csv`
}

export function downloadDinnerCsv(file: DinnerExportFile) {
  const blob = new Blob([file.content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
