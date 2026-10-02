import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FOUNDER_SCHEMA, normalizeFounders, type FounderFieldDefinition } from './founder.js'

const foundersFixturePath = resolve(process.cwd(), 'src/founders.json')
const rawFixtureText = readFileSync(foundersFixturePath, 'utf8')
const rawFounders = JSON.parse(rawFixtureText) as unknown

describe('founder normalization', () => {
  it('guards the reference fixture fingerprint and record count', () => {
    const digest = createHash('sha256').update(rawFixtureText).digest('hex')

    expect(digest).toBe('243e9f403a989549d37b798cf33751863ef0234d3211d87b5bdcf002d4bf7771')
    expect(normalizeFounders(rawFounders)).toHaveLength(574)
  })

  it('normalizes founders without fabricating extra source fields', () => {
    const founders = normalizeFounders(rawFounders)
    const founder = founders.find((candidate) => candidate.id === '343105')

    expect(founder).toMatchObject({
      id: '343105',
      name: 'Di Qi',
      cohortGroup: '3',
      cohortSection: '3I',
      companyVertical: 'B2B Software and Services',
      companyVerticalLevels: ['B2B Software and Services'],
      company: 'Lantern',
      age: 33,
      education: 'Computer Science',
      role: 'Engineering',
      searchName: 'di qi',
    })
    expect(founder?.raw).toEqual({
      Id: '343105',
      Name: 'Di Qi',
      Group: '3',
      'Group Section': '3I',
      'Company vertical': 'B2B Software and Services',
      Company: 'Lantern',
      Age: 33,
      Education: 'Computer Science',
      Role: 'Engineering',
    })
  })

  it('preserves authoritative IDs and names while normalizing derived and designated fields', () => {
    const source = {
      Id: '  founder   001  ',
      Name: 'Zoë\u00a0Ng',
      Group: ' 3 ',
      'Group Section': ' 3I ',
      'Company vertical': ' B2B   Software -> Infrastructure ',
      Company: ' Example   Co ',
      Age: 31,
      Education: ' Computer   Science ',
      Role: ' Engineering ',
    }

    const [founder] = normalizeFounders([source])

    expect(founder).toMatchObject({
      id: source.Id,
      name: source.Name,
      cohortGroup: '3',
      cohortSection: '3I',
      companyVertical: 'B2B Software -> Infrastructure',
      companyVerticalLevels: ['B2B Software', 'Infrastructure'],
      company: 'Example Co',
      age: 31,
      education: 'Computer Science',
      role: 'Engineering',
      searchName: 'zoe ng',
    })
    expect(founder?.raw).toEqual(source)
    expect(founder?.raw.Id).toBe(source.Id)
    expect(founder?.raw.Name).toBe(source.Name)
  })

  it.each([
    ['Id', ' \t '],
    ['Name', '\u00a0'],
  ] as const)('rejects an empty authoritative %s value', (key, value) => {
    const source = {
      Id: 'founder-1',
      Name: 'Founder One',
      Group: '3',
      'Group Section': '3I',
      'Company vertical': 'B2B Software and Services',
      Company: 'Example Co',
      Age: 31,
      Education: 'Computer Science',
      Role: 'Engineering',
      [key]: value,
    }

    expect(() => normalizeFounders([source])).toThrow(`missing ${key}`)
  })

  it('exposes schema metadata for all nine source fields', () => {
    expect(FOUNDER_SCHEMA).toHaveLength(9)
    expect(FOUNDER_SCHEMA.map((field) => field.source)).toEqual([
      'Id',
      'Name',
      'Group',
      'Group Section',
      'Company vertical',
      'Company',
      'Age',
      'Education',
      'Role',
    ])
    expect(FOUNDER_SCHEMA.find((field) => field.key === 'name')).toMatchObject({
      label: 'Founder name',
      search: true,
      filter: false,
      sort: true,
      display: true,
      match: true,
      aliases: ['founder', 'founder name', 'name'],
      normalizer: 'unicode-text',
    })
    expect(FOUNDER_SCHEMA.find((field) => field.key === 'companyVertical')).toMatchObject({
      search: true,
      filter: true,
      sort: true,
      display: true,
      match: true,
      aliases: ['company vertical', 'industry', 'sector', 'vertical'],
      normalizer: 'vertical-path',
    })
  })

  it('keeps the shared schema deeply immutable', () => {
    expect(Object.isFrozen(FOUNDER_SCHEMA)).toBe(true)
    for (const field of FOUNDER_SCHEMA) {
      expect(Object.isFrozen(field)).toBe(true)
      expect(Object.isFrozen(field.aliases)).toBe(true)
    }

    const firstField = FOUNDER_SCHEMA[0]!
    const originalLabel = firstField.label
    const originalAlias = firstField.aliases[0]

    expect(() => {
      ;(FOUNDER_SCHEMA as FounderFieldDefinition[]).push(firstField)
    }).toThrow(TypeError)
    expect(() => {
      ;(firstField as { label: string }).label = 'Mutated'
    }).toThrow(TypeError)
    expect(() => {
      ;(firstField.aliases as string[]).push('mutated')
    }).toThrow(TypeError)

    expect(firstField.label).toBe(originalLabel)
    expect(firstField.aliases[0]).toBe(originalAlias)
  })
})
