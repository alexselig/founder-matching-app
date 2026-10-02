import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { normalizeFounders } from '../../src/shared/founder.js'
import {
  buildDinnerState,
  buildDraftDinnerState,
} from '../../src/test/dinnerStateFixture.js'
import { csvRecords, parseCsv } from '../../src/test/csv.js'
import { createDatabase, type SqliteDatabase } from '../database.js'
import { DinnerRepository } from '../repositories/dinners.js'
import { FounderRepository } from '../repositories/founders.js'
import {
  WebResultsRepository,
  type WebEnrichmentRun,
} from '../repositories/webResults.js'
import { DinnerService } from './dinners.js'
import { ExportError, ExportService } from './export.js'

const founders = normalizeFounders(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/founders.json'), 'utf8'),
  ) as unknown,
)
const cohort = founders.slice(0, 6)
const cohortIds = cohort.map((founder) => founder.id)
const EXPORTED_AT = new Date('2026-10-05T18:30:00.000Z')

function webRun(
  founderId: string,
  id: string,
  retrievedAt: string,
  count: number,
): WebEnrichmentRun {
  return {
    id,
    founderId,
    queryFingerprint: `fingerprint-${id}`,
    provider: 'anthropic',
    retrievedAt,
    rawProviderMetadata: { request: 'run-secret-metadata' },
    results: Array.from({ length: count }, (_, index) => ({
      rank: index + 1,
      classification: 'both' as const,
      title: `${id} result ${index + 1}`,
      url: `https://example.test/${id}/${index + 1}`,
      domain: 'example.test',
      snippet: `Evidence ${index + 1}`,
      provider: 'anthropic',
      retrievedAt,
      confidence: 0.9,
      entityMatch: { founder: true, company: true },
      rawProviderMetadata: { tokens: 'result-secret-metadata' },
    })),
  }
}

describe('ExportService', () => {
  let database: SqliteDatabase
  let dinners: DinnerService
  let webResults: WebResultsRepository
  let exportsService: ExportService

  beforeEach(() => {
    database = createDatabase({ filename: ':memory:' })
    const founderRepository = new FounderRepository(database)
    founderRepository.saveAll(founders)
    webResults = new WebResultsRepository(database)
    dinners = new DinnerService({
      dinners: new DinnerRepository(database),
      founders: founderRepository,
      now: () => new Date('2026-10-01T12:00:00.000Z'),
    })
    exportsService = new ExportService({
      dinners,
      founders: founderRepository,
      webResults,
      now: () => EXPORTED_AT,
    })
  })

  afterEach(() => {
    if (database.open) {
      database.close()
    }
  })

  describe('dinner CSV', () => {
    it('lists every seat with table, founder, company, role, fit, criteria, rules, and notes', () => {
      const dinner = dinners.create({
        name: 'AI Infrastructure Dinner',
        state: buildDinnerState(cohortIds),
      })

      const file = exportsService.exportDinner(dinner.id, { format: 'csv' })

      expect(file.contentType).toBe('text/csv; charset=utf-8')
      expect(file.filename).toBe('ai-infrastructure-dinner-v1-2026-10-05.csv')
      expect(file.body.split('\r\n')).toHaveLength(7)
      expect(parseCsv(file.body)[0]).toEqual([
        'Table',
        'Seat',
        'Founder ID',
        'Founder',
        'Company',
        'Role',
        'Fit',
        'Below threshold',
        'Criteria',
        'Rules',
        'Notes',
      ])
      const records = csvRecords(file.body)
      expect(records.map((record) => [record.Table, record.Seat, record['Founder ID']])).toEqual([
        ['1', '1', cohort[0]!.id],
        ['1', '2', cohort[1]!.id],
        ['1', '3', cohort[2]!.id],
        ['2', '1', cohort[3]!.id],
        ['2', '2', cohort[4]!.id],
        ['2', '3', cohort[5]!.id],
      ])
      expect(records[0]).toMatchObject({
        Founder: cohort[0]!.name,
        Company: cohort[0]!.company,
        Role: cohort[0]!.role,
        Fit: '82%',
        'Below threshold': 'No',
        Criteria: 'Role · Diversity · H; Company vertical · Similarity · M',
      })
      expect(records[0]!.Rules).toBe(
        [
          'Separate founders from the same company',
          `Must sit with ${cohort[1]!.name}`,
          `Cannot sit with ${cohort[3]!.name}`,
          'Role = Engineering: at least 0 and at most 2 per table',
        ].join('; '),
      )
      expect(records[0]!.Notes).toBe('Seat near the stage; Dinner: Dinner starts at 7pm')
      expect(records[2]).toMatchObject({ Fit: '66%', 'Below threshold': 'Yes' })
      expect(records[2]!.Rules).toContain('Locked to table 1, seat 3')
      expect(records[4]!.Rules).toContain('Pinned to table 2, seat 2')
      expect(records[4]!.Notes).toBe('Table 2: Quiet corner table; Dinner: Dinner starts at 7pm')
      expect(records[5]!.Rules).toContain('Locked to table 2')
    })

    it('neutralizes spreadsheet formulas and escapes delimiters', () => {
      const state = buildDinnerState(cohortIds)
      const notes = [
        { id: 'note-formula', text: '=HYPERLINK("http://evil.test"), "quoted"', founderId: cohortIds[0]! },
      ]
      const dinner = dinners.create({ name: 'Formula', state: { ...state, notes } })

      const file = exportsService.exportDinner(dinner.id, { format: 'csv' })

      expect(file.body).toContain(`"'=HYPERLINK(""http://evil.test""), ""quoted"""`)
      expect(csvRecords(file.body)[0]!.Notes).toBe(
        `'=HYPERLINK("http://evil.test"), "quoted"`,
      )
    })

    it('exports unassigned drafts in cohort order', () => {
      const dinner = dinners.create({
        name: 'Draft',
        state: buildDraftDinnerState(cohortIds),
      })

      const records = csvRecords(
        exportsService.exportDinner(dinner.id, { format: 'csv' }).body,
      )

      expect(records.map((record) => record['Founder ID'])).toEqual(cohortIds)
      expect(records[0]).toMatchObject({ Table: '', Seat: '', Fit: '', 'Below threshold': '' })
    })

    it('keeps missing founders visible with their saved details', () => {
      const dinner = dinners.create({ name: 'Recovery', state: buildDinnerState(cohortIds) })
      database.prepare('DELETE FROM founders WHERE id = ?').run(cohortIds[2])

      const records = csvRecords(
        exportsService.exportDinner(dinner.id, { format: 'csv' }).body,
      )

      expect(records).toHaveLength(6)
      expect(records[2]).toMatchObject({
        'Founder ID': cohortIds[2],
        Founder: cohort[2]!.name,
        Company: cohort[2]!.company,
      })
      expect(records[2]!.Notes).toContain('Missing from current dataset')
    })

    it('rejects web results in CSV exports', () => {
      const dinner = dinners.create({ name: 'CSV', state: buildDinnerState(cohortIds) })

      expect(() =>
        exportsService.exportDinner(dinner.id, { format: 'csv', includeWebResults: 'true' }),
      ).toThrow(ExportError)
    })

    it('exports a specific saved version', () => {
      const dinner = dinners.create({ name: 'Versions', state: buildDraftDinnerState(cohortIds) })
      dinners.appendVersion(dinner.id, { state: buildDinnerState(cohortIds) })

      const file = exportsService.exportDinner(dinner.id, { format: 'csv', version: '1' })

      expect(file.filename).toBe('versions-v1-2026-10-05.csv')
      expect(csvRecords(file.body)[0]!.Table).toBe('')
    })
  })

  describe('dinner JSON', () => {
    it('exports the complete configuration, scoring metadata, and recovery state', () => {
      const state = buildDinnerState(cohortIds)
      const dinner = dinners.create({ name: 'JSON Dinner', note: 'v1 note', state })

      const file = exportsService.exportDinner(dinner.id, { format: 'json' })
      const body = JSON.parse(file.body)

      expect(file.contentType).toBe('application/json; charset=utf-8')
      expect(file.filename).toBe('json-dinner-v1-2026-10-05.json')
      expect(body).toMatchObject({
        format: 'founder-app/dinner-export',
        formatVersion: 1,
        exportedAt: EXPORTED_AT.toISOString(),
        dinner: { id: dinner.id, name: 'JSON Dinner', note: 'v1 note', version: 1, status: 'ready' },
        recovery: { status: 'complete' },
      })
      expect(body.configuration).toEqual(state)
      expect(body.founders).toHaveLength(6)
      expect(body.founders[2]).toEqual({
        founderId: cohort[2]!.id,
        founder: cohort[2],
        tableIndex: 0,
        seatIndex: 2,
        fit: 0.66,
        belowThreshold: true,
        locked: true,
      })
      expect(body.founders.some((entry: object) => 'web_results' in entry)).toBe(false)
    })

    it('nests at most the latest five web results without flattening or provider metadata', () => {
      webResults.appendRun(webRun(cohortIds[0]!, 'run-old', '2026-09-01T00:00:00.000Z', 5))
      webResults.appendRun(webRun(cohortIds[0]!, 'run-new', '2026-09-20T00:00:00.000Z', 5))
      const dinner = dinners.create({ name: 'Web', state: buildDinnerState(cohortIds) })

      const file = exportsService.exportDinner(dinner.id, {
        format: 'json',
        includeWebResults: 'true',
      })
      const body = JSON.parse(file.body)

      const first = body.founders[0]
      expect(first.founder).toEqual(cohort[0])
      expect(Object.keys(first.founder).sort()).toEqual(Object.keys(cohort[0]!).sort())
      expect(first.web_results).toHaveLength(5)
      expect(first.web_results.map((result: { title: string }) => result.title)).toEqual(
        Array.from({ length: 5 }, (_, index) => `run-new result ${index + 1}`),
      )
      expect(first.web_results[0]).toEqual({
        runId: 'run-new',
        rank: 1,
        classification: 'both',
        title: 'run-new result 1',
        url: 'https://example.test/run-new/1',
        domain: 'example.test',
        snippet: 'Evidence 1',
        provider: 'anthropic',
        retrievedAt: '2026-09-20T00:00:00.000Z',
        confidence: 0.9,
        entityMatch: { founder: true, company: true },
      })
      expect(body.founders[1].web_results).toEqual([])
      expect(file.body).not.toContain('secret-metadata')
    })

    it('labels missing founders with their saved summary instead of a founder record', () => {
      const dinner = dinners.create({ name: 'Recovery', state: buildDinnerState(cohortIds) })
      database.prepare('DELETE FROM founders WHERE id = ?').run(cohortIds[2])

      const body = JSON.parse(
        exportsService.exportDinner(dinner.id, { format: 'json', includeWebResults: 'true' }).body,
      )

      expect(body.recovery.status).toBe('missing_founders')
      expect(body.founders[2]).toMatchObject({
        founderId: cohortIds[2],
        founder: null,
        missing: true,
        savedSummary: { name: cohort[2]!.name, company: cohort[2]!.company, role: cohort[2]!.role },
        web_results: [],
      })
    })
  })

  describe('founder exports', () => {
    it('exports founder IDs and names, adding Search detail columns on request', () => {
      const ids = [cohortIds[1]!, cohortIds[0]!]

      const plain = exportsService.exportFounders({ founderIds: ids, format: 'csv' })
      const detailed = exportsService.exportFounders({
        founderIds: ids,
        format: 'csv',
        includeDetails: true,
      })

      expect(plain.filename).toBe('founder-search-results-2026-10-05.csv')
      expect(parseCsv(plain.body)).toEqual([
        ['Founder ID', 'Founder name'],
        [cohort[1]!.id, cohort[1]!.name],
        [cohort[0]!.id, cohort[0]!.name],
      ])
      expect(parseCsv(detailed.body)[0]).toEqual([
        'Founder ID',
        'Founder name',
        'Company',
        'Company vertical',
        'Role',
        'Age',
        'Education',
        'Cohort group',
        'Cohort section',
      ])
      expect(csvRecords(detailed.body)[0]).toMatchObject({
        Company: cohort[1]!.company,
        Age: String(cohort[1]!.age),
      })
      expect(detailed.body).not.toContain('web_results')
    })

    it('nests web results in JSON founder exports only when requested', () => {
      webResults.appendRun(webRun(cohortIds[0]!, 'run-1', '2026-09-20T00:00:00.000Z', 5))

      const withResults = JSON.parse(
        exportsService.exportFounders({
          founderIds: [cohortIds[0]!],
          format: 'json',
          includeDetails: true,
          includeWebResults: true,
        }).body,
      )
      const without = JSON.parse(
        exportsService.exportFounders({ founderIds: [cohortIds[0]!], format: 'json' }).body,
      )

      expect(withResults.format).toBe('founder-app/founder-export')
      expect(withResults.founders[0].founder).toEqual(cohort[0])
      expect(withResults.founders[0].web_results).toHaveLength(5)
      expect(without.founders[0]).toEqual({
        founder: { id: cohort[0]!.id, name: cohort[0]!.name },
      })
    })

    it('rejects unknown founders and invalid requests', () => {
      expect(() =>
        exportsService.exportFounders({ founderIds: ['missing-founder'], format: 'csv' }),
      ).toThrow(expect.objectContaining({ code: 'unknown_founders', details: { founderIds: ['missing-founder'] } }))
      expect(() =>
        exportsService.exportFounders({ founderIds: [cohortIds[0]!], format: 'csv', includeWebResults: true }),
      ).toThrow(expect.objectContaining({ code: 'invalid_export' }))
      expect(() =>
        exportsService.exportFounders({ founderIds: [cohortIds[0]!, cohortIds[0]!], format: 'json' }),
      ).toThrow(expect.objectContaining({ code: 'invalid_export' }))
    })
  })
})
