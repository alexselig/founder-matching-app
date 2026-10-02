import type { Founder } from '../../shared/founder'
import { FOUNDER_SCHEMA } from '../../shared/schemaRegistry'

export type SearchFieldKind = 'text' | 'number' | 'enum' | 'boolean'

export type SearchOperator = 'is' | 'contains' | 'startsWith' | 'between' | 'atLeast' | 'atMost'

export interface NumericRange {
  min: number
  max: number
}

export type SearchDimensionValue = string | number | boolean | NumericRange

export interface SearchDimension {
  field: string
  operator: SearchOperator
  value: SearchDimensionValue
}

export interface StructuredSearchQuery {
  text: string
  dimensions: SearchDimension[]
}

export type MatchType = 'exact' | 'prefix' | 'substring' | 'hierarchy' | 'range' | 'enum' | 'boolean'

export interface MatchedDimension {
  field: string
  label: string
  source: 'dimension' | 'text'
  operator: SearchOperator
  query: string
  value: string
  display: string
  matchType: MatchType
  score: number
  reason: string
}

export interface SearchResult {
  founder: Founder
  score: number
  matchedDimensions: MatchedDimension[]
  explanation: string
}

export interface SearchFieldDefinition {
  key: string
  path: string
  label: string
  kind: SearchFieldKind
  search: boolean
  filter: boolean
  group: boolean
  sort: boolean
  aliases: readonly string[]
  values?: readonly string[]
  hierarchy?: boolean
  opaque?: boolean
  code?: boolean
}

export class SearchQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchQueryError'
  }
}

export const SEARCH_FIELDS: readonly SearchFieldDefinition[] = Object.freeze(
  FOUNDER_SCHEMA.map((definition) =>
    Object.freeze({
      key: definition.key,
      path: definition.path,
      label: definition.label,
      kind: definition.kind,
      search: definition.search,
      filter: definition.filter,
      group: definition.group,
      sort: definition.sort,
      aliases: definition.aliases,
      hierarchy: definition.normalizer === 'vertical-path',
      opaque: definition.normalizer === 'opaque-string',
      code: definition.normalizer === 'category-code',
    }),
  ),
)

export const OPERATORS_BY_KIND: Readonly<Record<SearchFieldKind, readonly SearchOperator[]>> = Object.freeze({
  text: ['is', 'contains', 'startsWith'],
  number: ['between', 'is', 'atLeast', 'atMost'],
  enum: ['is'],
  boolean: ['is'],
})

export const OPERATOR_LABELS: Readonly<Record<SearchOperator, string>> = Object.freeze({
  is: 'is',
  contains: 'contains',
  startsWith: 'starts with',
  between: 'is between',
  atLeast: 'is at least',
  atMost: 'is at most',
})

const MATCH_SCORES: Readonly<Record<MatchType, number>> = {
  exact: 4,
  enum: 4,
  boolean: 4,
  hierarchy: 3,
  range: 3,
  prefix: 3,
  substring: 2,
}

const TEXT_SCORES = { exact: 3, prefix: 2, substring: 1 } as const

export function normalizeSearchValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function getSearchField(key: string, fields: readonly SearchFieldDefinition[] = SEARCH_FIELDS) {
  return fields.find((field) => field.key === key)
}

function isRange(value: SearchDimensionValue): value is NumericRange {
  return typeof value === 'object' && value !== null
}

export function validateStructuredQuery(
  query: StructuredSearchQuery,
  fields: readonly SearchFieldDefinition[] = SEARCH_FIELDS,
): StructuredSearchQuery {
  if (typeof query?.text !== 'string') {
    throw new SearchQueryError('Search text must be a string')
  }
  if (!Array.isArray(query.dimensions)) {
    throw new SearchQueryError('Search dimensions must be a list')
  }

  for (const dimension of query.dimensions) {
    const field = getSearchField(dimension.field, fields)
    if (!field) throw new SearchQueryError(`Unknown search field "${dimension.field}"`)
    if (!field.filter) throw new SearchQueryError(`${field.label} cannot be used as a search dimension`)
    if (!OPERATORS_BY_KIND[field.kind].includes(dimension.operator)) {
      throw new SearchQueryError(`Unsupported operator "${dimension.operator}" for ${field.label}`)
    }

    const { value } = dimension
    if (field.kind === 'boolean') {
      if (typeof value !== 'boolean') throw new SearchQueryError(`${field.label} must be true or false`)
    } else if (field.kind === 'number') {
      if (dimension.operator === 'between') {
        if (!isRange(value) || !Number.isFinite(value.min) || !Number.isFinite(value.max)) {
          throw new SearchQueryError(`${field.label} range needs a minimum and maximum`)
        }
        if (value.min > value.max) {
          throw new SearchQueryError(`${field.label} range must have a minimum no greater than its maximum`)
        }
      } else if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new SearchQueryError(`${field.label} needs a number`)
      }
    } else {
      if (typeof value !== 'string' || !value.trim()) throw new SearchQueryError(`${field.label} needs a value`)
      if (field.kind === 'enum' && field.values) {
        const normalized = normalizeSearchValue(value)
        if (!field.values.some((allowed) => normalizeSearchValue(allowed) === normalized)) {
          throw new SearchQueryError(`${field.label} must be one of ${field.values.join(', ')}`)
        }
      }
    }
  }

  return query
}

function readPath(record: unknown, path: string): unknown {
  if (record && typeof record === 'object' && path in record) {
    return (record as Record<string, unknown>)[path]
  }
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[segment]
    return undefined
  }, record)
}

function fieldValues(founder: Founder, field: SearchFieldDefinition): unknown[] {
  const value = readPath(founder, field.path)
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function displayValue(field: SearchFieldDefinition, value: string) {
  return field.kind === 'number' || field.code ? `${field.label} ${value}` : value
}

function levels(value: string) {
  return value.split('->').map(normalizeSearchValue)
}

function buildMatch(
  field: SearchFieldDefinition,
  dimension: Pick<SearchDimension, 'operator'> & { query: string },
  source: MatchedDimension['source'],
  value: string,
  matchType: MatchType,
  score: number,
  reason: string,
): MatchedDimension {
  return {
    field: field.key,
    label: field.label,
    source,
    operator: dimension.operator,
    query: dimension.query,
    value,
    display: displayValue(field, value),
    matchType,
    score,
    reason,
  }
}

function matchTextDimension(field: SearchFieldDefinition, dimension: SearchDimension, values: unknown[]) {
  const query = String(dimension.value)
  const normalizedQuery = normalizeSearchValue(query)
  const context = { operator: dimension.operator, query }

  for (const candidate of values) {
    if (typeof candidate !== 'string' && typeof candidate !== 'number') continue
    const actual = String(candidate)
    const normalized = normalizeSearchValue(actual)

    if (field.kind === 'enum') {
      if (normalized === normalizedQuery) {
        return buildMatch(field, context, 'dimension', actual, 'enum', MATCH_SCORES.enum, `${field.label} is ${actual}`)
      }
      continue
    }

    if (dimension.operator === 'is' && field.hierarchy) {
      const queryLevels = levels(query)
      const actualLevels = levels(actual)
      const isAncestor =
        queryLevels.length <= actualLevels.length && queryLevels.every((level, index) => level === actualLevels[index])
      if (isAncestor && queryLevels.length === actualLevels.length) {
        return buildMatch(field, context, 'dimension', actual, 'exact', MATCH_SCORES.exact, `${field.label} is ${actual}`)
      }
      if (isAncestor) {
        return buildMatch(
          field,
          context,
          'dimension',
          actual,
          'hierarchy',
          MATCH_SCORES.hierarchy,
          `${field.label} ${actual} is within ${query}`,
        )
      }
      if (queryLevels.length === 1 && actualLevels.slice(1).includes(queryLevels[0])) {
        return buildMatch(
          field,
          context,
          'dimension',
          actual,
          'hierarchy',
          MATCH_SCORES.hierarchy,
          `${field.label} ${actual} includes ${query}`,
        )
      }
      continue
    }

    if (dimension.operator === 'is' && normalized === normalizedQuery) {
      return buildMatch(field, context, 'dimension', actual, 'exact', MATCH_SCORES.exact, `${field.label} is ${actual}`)
    }
    if (dimension.operator === 'startsWith' && normalized.startsWith(normalizedQuery)) {
      return buildMatch(
        field,
        context,
        'dimension',
        actual,
        'prefix',
        MATCH_SCORES.prefix,
        `${field.label} "${actual}" starts with "${query}"`,
      )
    }
    if (dimension.operator === 'contains' && normalized.includes(normalizedQuery)) {
      return buildMatch(
        field,
        context,
        'dimension',
        actual,
        'substring',
        MATCH_SCORES.substring,
        `${field.label} "${actual}" contains "${query}"`,
      )
    }
  }
  return null
}

function matchNumberDimension(field: SearchFieldDefinition, dimension: SearchDimension, values: unknown[]) {
  const context = { operator: dimension.operator, query: formatDimensionValue(dimension) }
  for (const candidate of values) {
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) continue
    const { value } = dimension
    if (dimension.operator === 'between' && isRange(value) && candidate >= value.min && candidate <= value.max) {
      return buildMatch(
        field,
        context,
        'dimension',
        String(candidate),
        'range',
        MATCH_SCORES.range,
        `${field.label} ${candidate} is between ${value.min} and ${value.max}`,
      )
    }
    if (dimension.operator === 'atLeast' && typeof value === 'number' && candidate >= value) {
      return buildMatch(
        field,
        context,
        'dimension',
        String(candidate),
        'range',
        MATCH_SCORES.range,
        `${field.label} ${candidate} is at least ${value}`,
      )
    }
    if (dimension.operator === 'atMost' && typeof value === 'number' && candidate <= value) {
      return buildMatch(
        field,
        context,
        'dimension',
        String(candidate),
        'range',
        MATCH_SCORES.range,
        `${field.label} ${candidate} is at most ${value}`,
      )
    }
    if (dimension.operator === 'is' && candidate === value) {
      return buildMatch(
        field,
        context,
        'dimension',
        String(candidate),
        'exact',
        MATCH_SCORES.exact,
        `${field.label} is ${candidate}`,
      )
    }
  }
  return null
}

function matchBooleanDimension(field: SearchFieldDefinition, dimension: SearchDimension, values: unknown[]) {
  const label = dimension.value ? 'yes' : 'no'
  if (!values.some((candidate) => candidate === dimension.value)) return null
  return buildMatch(
    field,
    { operator: dimension.operator, query: label },
    'dimension',
    label,
    'boolean',
    MATCH_SCORES.boolean,
    `${field.label} is ${label}`,
  )
}

function matchDimension(founder: Founder, dimension: SearchDimension, fields: readonly SearchFieldDefinition[]) {
  const field = getSearchField(dimension.field, fields)!
  const values = fieldValues(founder, field)
  if (field.kind === 'number') return matchNumberDimension(field, dimension, values)
  if (field.kind === 'boolean') return matchBooleanDimension(field, dimension, values)
  return matchTextDimension(field, dimension, values)
}

function words(value: string) {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function matchTextToken(founder: Founder, token: string, fields: readonly SearchFieldDefinition[]) {
  let best: MatchedDimension | null = null
  for (const field of fields) {
    if (!field.search || field.kind === 'boolean') continue
    for (const candidate of fieldValues(founder, field)) {
      if (typeof candidate !== 'string' && typeof candidate !== 'number') continue
      const actual = String(candidate)
      const normalized = normalizeSearchValue(actual)
      const context = { operator: 'contains' as const, query: token }
      let match: MatchedDimension | null = null
      if (normalized === token) {
        match = buildMatch(field, { ...context, operator: 'is' }, 'text', actual, 'exact', TEXT_SCORES.exact, `${field.label} is ${actual}`)
      } else if (field.opaque || field.kind === 'number') {
        match = null
      } else if (words(normalized).some((word) => word.startsWith(token))) {
        match = buildMatch(
          field,
          { ...context, operator: 'startsWith' },
          'text',
          actual,
          'prefix',
          TEXT_SCORES.prefix,
          `${field.label} "${actual}" has a word starting with "${token}"`,
        )
      } else if (token.length >= 3 && normalized.includes(token)) {
        match = buildMatch(
          field,
          context,
          'text',
          actual,
          'substring',
          TEXT_SCORES.substring,
          `${field.label} "${actual}" contains "${token}"`,
        )
      }
      if (match && (!best || match.score > best.score)) best = match
    }
  }
  return best
}

export function searchTokens(text: string) {
  return words(normalizeSearchValue(text))
}

export function executeSearch(
  founders: readonly Founder[],
  query: StructuredSearchQuery,
  fields: readonly SearchFieldDefinition[] = SEARCH_FIELDS,
): SearchResult[] {
  validateStructuredQuery(query, fields)
  const tokens = searchTokens(query.text)
  const results: SearchResult[] = []

  for (const founder of founders) {
    const matchedDimensions: MatchedDimension[] = []
    let matched = true

    for (const dimension of query.dimensions) {
      const match = matchDimension(founder, dimension, fields)
      if (!match) {
        matched = false
        break
      }
      matchedDimensions.push(match)
    }
    if (!matched) continue

    for (const token of tokens) {
      const match = matchTextToken(founder, token, fields)
      if (!match) {
        matched = false
        break
      }
      matchedDimensions.push(match)
    }
    if (!matched) continue

    results.push({
      founder,
      score: matchedDimensions.reduce((total, dimension) => total + dimension.score, 0),
      matchedDimensions,
      explanation: matchedDimensions.map((dimension) => dimension.reason).join('; '),
    })
  }

  return results.sort(compareByRelevance)
}

export function compareByRelevance(a: SearchResult, b: SearchResult) {
  return (
    b.score - a.score ||
    a.founder.name.localeCompare(b.founder.name) ||
    (a.founder.id < b.founder.id ? -1 : a.founder.id > b.founder.id ? 1 : 0)
  )
}

export function formatDimensionValue(dimension: SearchDimension) {
  const { operator, value } = dimension
  if (operator === 'between' && isRange(value)) {
    return value.min === value.max ? String(value.min) : `${value.min}–${value.max}`
  }
  if (operator === 'atLeast') return `at least ${String(value)}`
  if (operator === 'atMost') return `at most ${String(value)}`
  if (operator === 'contains') return `contains “${String(value)}”`
  if (operator === 'startsWith') return `starts with “${String(value)}”`
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

interface PhraseCandidate {
  field: string
  value: string
  priority: number
}

interface Vocabulary {
  aliases: { tokens: string[]; field: string }[]
  aliasWords: Set<string>
  fieldPhrases: Map<string, Map<string, string>>
  barePhrases: Map<string, PhraseCandidate[]>
  maxPhraseLength: number
}

const STOP_WORDS = new Set(
  (
    'a an and any anyone are as at all age aged ages build builders building builds by companies company ' +
    'did do find folks for founder founders from give in into is like list look looking me meet of old on or ' +
    'operator operators people person persons please show similar some someone startup startups that the their ' +
    'to was who whom with work working works year years'
  ).split(' '),
)

const ROLE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  engineering: ['engineer', 'engineers', 'technical'],
  design: ['designer', 'designers'],
  sales: ['seller', 'sellers', 'salespeople', 'salesperson'],
}

const VERTICAL_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  'financial technology and services': ['fintech'],
  'b2b software and services': ['b2b', 'saas', 'b2b saas', 'enterprise software'],
  healthcare: ['health', 'healthtech', 'health tech'],
  education: ['edtech'],
  government: ['govtech'],
  'real estate and construction': ['proptech'],
}

const BARE_FIELD_PRIORITY = ['role', 'education', 'companyVertical', 'cohortSection'] as const
const COMPANY_CONNECTORS = new Set(['at', 'from'])

function phraseKey(value: string) {
  return words(normalizeSearchValue(value)).join(' ')
}

function setPhrase(map: Map<string, string>, phrase: string, value: string) {
  if (phrase && !map.has(phrase)) map.set(phrase, value)
}

const vocabularyCache = new WeakMap<readonly Founder[], Vocabulary>()

function buildVocabulary(founders: readonly Founder[], fields: readonly SearchFieldDefinition[]): Vocabulary {
  const cached = fields === SEARCH_FIELDS ? vocabularyCache.get(founders) : undefined
  if (cached) return cached

  const fieldPhrases = new Map<string, Map<string, string>>()
  const aliases: Vocabulary['aliases'] = []

  for (const field of fields) {
    if (!field.filter || field.kind === 'number' || field.kind === 'boolean' || field.opaque) continue
    const phrases = new Map<string, string>()
    const sourceValues = field.values ?? founders.flatMap((founder) => fieldValues(founder, field).map(String))

    for (const value of sourceValues) {
      if (field.hierarchy) {
        const parts = value.split('->').map((part) => part.trim())
        parts.forEach((level, index) => {
          const path = parts.slice(0, index + 1).join(' -> ')
          const levelTokens = phraseKey(level).split(' ')
          setPhrase(phrases, levelTokens.join(' '), path)
          levelTokens.forEach((token, tokenIndex) => {
            if (token === 'and' && tokenIndex > 0) setPhrase(phrases, levelTokens.slice(0, tokenIndex).join(' '), path)
          })
        })
      } else {
        setPhrase(phrases, phraseKey(value), value)
      }
    }

    const synonyms = field.hierarchy ? VERTICAL_SYNONYMS : field.key === 'role' ? ROLE_SYNONYMS : {}
    for (const [canonical, alternates] of Object.entries(synonyms)) {
      const target = phrases.get(canonical)
      if (target) alternates.forEach((alternate) => setPhrase(phrases, alternate, target))
    }

    fieldPhrases.set(field.key, phrases)
    field.aliases.forEach((alias) => aliases.push({ tokens: phraseKey(alias).split(' '), field: field.key }))
  }

  aliases.sort((a, b) => b.tokens.length - a.tokens.length)
  const aliasWords = new Set(
    fields.flatMap((field) => field.aliases.flatMap((alias) => phraseKey(alias).split(' '))),
  )

  const barePhrases = new Map<string, PhraseCandidate[]>()
  BARE_FIELD_PRIORITY.forEach((fieldKey, priority) => {
    const phrases = fieldPhrases.get(fieldKey)
    if (!phrases) return
    for (const [phrase, value] of phrases) {
      if (fieldKey === 'cohortSection' && !/^\d+[a-z]+$/.test(phrase)) continue
      const candidates = barePhrases.get(phrase) ?? []
      candidates.push({ field: fieldKey, value, priority })
      barePhrases.set(phrase, candidates)
    }
  })

  let maxPhraseLength = 1
  for (const phrases of fieldPhrases.values()) {
    for (const phrase of phrases.keys()) maxPhraseLength = Math.max(maxPhraseLength, phrase.split(' ').length)
  }

  const vocabulary = { aliases, aliasWords, fieldPhrases, barePhrases, maxPhraseLength }
  if (fields === SEARCH_FIELDS) vocabularyCache.set(founders, vocabulary)
  return vocabulary
}

interface FoundDimension {
  index: number
  dimension: SearchDimension
}

interface AgePattern {
  regex: RegExp
  build: (groups: string[]) => Pick<SearchDimension, 'operator' | 'value'> | null
}

const AGE_PATTERNS: readonly AgePattern[] = [
  {
    regex: /\b(?:ages?|aged)\s*(?:between\s+|from\s+)?(\d{1,3})\s*(?:-|to|and)\s*(\d{1,3})\b/g,
    build: ([a, b]) => ({ operator: 'between', value: { min: Math.min(+a, +b), max: Math.max(+a, +b) } }),
  },
  {
    regex: /\b(?:between\s+)?(\d{1,3})\s*(?:-|to|and)\s*(\d{1,3})\s*(?:years?\s*old|year\s*olds?|yo)\b/g,
    build: ([a, b]) => ({ operator: 'between', value: { min: Math.min(+a, +b), max: Math.max(+a, +b) } }),
  },
  {
    regex: /\b(?:in\s+(?:their|his|her|the)\s+)?([1-9])0s\b/g,
    build: ([decade]) => ({ operator: 'between', value: { min: +decade * 10, max: +decade * 10 + 9 } }),
  },
  {
    regex: /\b(?:(?:ages?|aged)\s+)?(?:over|older\s+than|above)\s+(\d{1,3})\b/g,
    build: ([n]) => ({ operator: 'atLeast', value: +n + 1 }),
  },
  {
    regex: /\b(?:(?:ages?|aged)\s+)?at\s+least\s+(\d{1,3})\b/g,
    build: ([n]) => ({ operator: 'atLeast', value: +n }),
  },
  {
    regex: /\b(?:(?:ages?|aged)\s+)?(?:under|younger\s+than|below)\s+(\d{1,3})\b/g,
    build: ([n]) => ({ operator: 'atMost', value: +n - 1 }),
  },
  {
    regex: /\b(?:(?:ages?|aged)\s+)?at\s+most\s+(\d{1,3})\b/g,
    build: ([n]) => ({ operator: 'atMost', value: +n }),
  },
  {
    regex: /\b(?:ages?|aged)\s*(?:is\s+|of\s+|:\s*)?(\d{1,3})\b/g,
    build: ([n]) => ({ operator: 'is', value: +n }),
  },
  {
    regex: /\b(\d{1,3})\s*(?:years?\s*old|year\s*old|yo)\b/g,
    build: ([n]) => ({ operator: 'is', value: +n }),
  },
]

function prepareText(input: string) {
  return normalizeSearchValue(input)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\p{L}\p{N}\s:-]/gu, ' ')
}

export function compileSearchText(
  input: string,
  founders: readonly Founder[],
  fields: readonly SearchFieldDefinition[] = SEARCH_FIELDS,
): StructuredSearchQuery {
  let working = prepareText(input)
  if (!working.trim()) return { text: '', dimensions: [] }

  const found: FoundDimension[] = []
  const ageField = fields.find((field) => field.kind === 'number' && field.filter && field.aliases.includes('age'))

  if (ageField) {
    for (const pattern of AGE_PATTERNS) {
      working = working.replace(pattern.regex, (match: string, ...args: unknown[]) => {
        const offset = args.at(-2) as number
        const groups = args.slice(0, -2).filter((group): group is string => typeof group === 'string')
        const built = pattern.build(groups)
        if (!built) return match
        found.push({ index: offset, dimension: { field: ageField.key, ...built } })
        return ' '.repeat(match.length)
      })
    }
  }

  const vocabulary = buildVocabulary(founders, fields)
  const tokens = [...working.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ text: match[0], index: match.index }))
  const consumed = new Array<boolean>(tokens.length).fill(false)

  const phraseAt = (start: number, phrases: Map<string, string>) => {
    for (let length = Math.min(vocabulary.maxPhraseLength, tokens.length - start); length > 0; length -= 1) {
      const slice = tokens.slice(start, start + length)
      if (slice.some((_, offset) => consumed[start + offset])) continue
      const value = phrases.get(slice.map((token) => token.text).join(' '))
      if (value) return { value, length }
    }
    return null
  }

  const consume = (start: number, length: number) => {
    for (let offset = 0; offset < length; offset += 1) consumed[start + offset] = true
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed[index]) continue
    for (const alias of vocabulary.aliases) {
      const matchesAlias = alias.tokens.every((token, offset) => tokens[index + offset]?.text === token)
      if (!matchesAlias) continue
      const valueStart = index + alias.tokens.length + (tokens[index + alias.tokens.length]?.text === 'is' ? 1 : 0)
      const phrase = phraseAt(valueStart, vocabulary.fieldPhrases.get(alias.field)!)
      if (!phrase) continue
      found.push({ index: tokens[index].index, dimension: { field: alias.field, operator: 'is', value: phrase.value } })
      consume(index, valueStart - index + phrase.length)
      break
    }
  }

  const companyPhrases = vocabulary.fieldPhrases.get('company')
  if (companyPhrases) {
    tokens.forEach((token, index) => {
      if (consumed[index] || !COMPANY_CONNECTORS.has(token.text)) return
      const phrase = phraseAt(index + 1, companyPhrases)
      if (!phrase) return
      found.push({ index: tokens[index + 1].index, dimension: { field: 'company', operator: 'is', value: phrase.value } })
      consume(index, phrase.length + 1)
    })
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (consumed[index]) continue
    for (let length = Math.min(vocabulary.maxPhraseLength, tokens.length - index); length > 0; length -= 1) {
      const slice = tokens.slice(index, index + length)
      if (slice.some((_, offset) => consumed[index + offset])) continue
      const candidates = vocabulary.barePhrases.get(slice.map((token) => token.text).join(' '))
      if (!candidates) continue
      const [best] = [...candidates].sort((a, b) => a.priority - b.priority)
      found.push({ index: tokens[index].index, dimension: { field: best.field, operator: 'is', value: best.value } })
      consume(index, length)
      break
    }
  }

  const dimensions: SearchDimension[] = []
  for (const { dimension } of found.sort((a, b) => a.index - b.index)) {
    if (!dimensions.some((existing) => existing.field === dimension.field)) dimensions.push(dimension)
  }

  const text = tokens
    .filter((token, index) => !consumed[index] && !STOP_WORDS.has(token.text) && !vocabulary.aliasWords.has(token.text))
    .map((token) => token.text)
    .join(' ')

  return { text, dimensions }
}
