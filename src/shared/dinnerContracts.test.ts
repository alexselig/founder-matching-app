import { describe, expect, it } from 'vitest'

import {
  buildDinnerState,
  buildDraftDinnerState,
} from '../test/dinnerStateFixture.js'
import {
  AppendDinnerVersionRequestSchema,
  CreateDinnerRequestSchema,
  DinnerStateSchema,
  type DinnerState,
} from './dinnerContracts.js'

const IDS = ['f-0', 'f-1', 'f-2', 'f-3', 'f-4', 'f-5']

function mutated(mutate: (state: DinnerState) => void): unknown {
  const state = structuredClone(buildDinnerState(IDS))
  mutate(state)
  return state
}

function writable<T>(value: T) {
  return value as { -readonly [K in keyof T]: T[K] }
}

describe('DinnerStateSchema', () => {
  it('accepts a fully populated dinner unchanged', () => {
    const state = buildDinnerState(IDS)

    const parsed = DinnerStateSchema.parse(structuredClone(state))

    expect(parsed).toEqual(state)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(state)
  })

  it('accepts an unassigned draft', () => {
    const draft = buildDraftDinnerState(IDS)

    expect(DinnerStateSchema.parse(draft)).toEqual(draft)
  })

  it.each<[string, (state: DinnerState) => void]>([
    ['duplicate cohort founders', (state) => {
      writable(state.cohort).founderIds = ['f-0', 'f-0', 'f-2', 'f-3', 'f-4', 'f-5']
    }],
    ['an empty cohort', (state) => {
      Object.assign(state, buildDraftDinnerState([]))
    }],
    ['unknown top-level fields', (state) => {
      Object.assign(state, { secret: 'x' })
    }],
    ['a criterion weight that disagrees with its level', (state) => {
      Object.assign(state.criteria.criteria[0]!, { weight: 1 })
    }],
    ['a criterion on a non-schema field', (state) => {
      Object.assign(state.criteria.criteria[0]!, { field: 'email' })
    }],
    ['duplicate criterion IDs', (state) => {
      Object.assign(state.criteria.criteria[1]!, { id: 'criterion-role' })
    }],
    ['duplicate rule IDs', (state) => {
      Object.assign(state.rules[1]!, { id: 'rule-company' })
    }],
    ['a rule naming a founder outside the cohort', (state) => {
      Object.assign(state.rules[1]!, { founderIds: ['f-0', 'f-9'] })
    }],
    ['a field-count rule with no bound', (state) => {
      Object.assign(state.rules[3]!, { min: undefined, max: undefined })
    }],
    ['a field-count rule whose minimum exceeds its maximum', (state) => {
      Object.assign(state.rules[3]!, { min: 3, max: 1 })
    }],
    ['a pinned rule beyond the table count', (state) => {
      Object.assign(state.rules[4]!, { tableIndex: 2 })
    }],
    ['a lock for a founder outside the cohort', (state) => {
      Object.assign(state.locks[0]!, { founderId: 'f-9' })
    }],
    ['two locks for one founder', (state) => {
      writable(state).locks = [...state.locks, { founderId: 'f-2', tableIndex: 0 }]
    }],
    ['a lock that disagrees with the assignment', (state) => {
      Object.assign(state.locks[1]!, { tableIndex: 0 })
    }],
    ['a seat lock that disagrees with the seat', (state) => {
      Object.assign(state.locks[0]!, { seatIndex: 0 })
    }],
    ['assignments that omit a cohort founder', (state) => {
      const table = writable(state.assignments[1]!)
      table.founderIds = ['f-3', 'f-4']
      table.seats = ['f-3', 'f-4', null]
      table.founderFits = { 'f-3': 0.71, 'f-4': 0.58 }
      writable(state).locks = [state.locks[0]!]
    }],
    ['a founder seated at two tables', (state) => {
      const table = writable(state.assignments[1]!)
      table.founderIds = ['f-3', 'f-4', 'f-0']
      table.seats = ['f-3', 'f-4', 'f-0']
      table.founderFits = { 'f-3': 0.71, 'f-4': 0.58, 'f-0': 0.5 }
      writable(state).locks = [state.locks[0]!]
    }],
    ['seats that do not match capacity', (state) => {
      writable(state.assignments[0]!).seats = ['f-0', 'f-1', 'f-2', null]
    }],
    ['founder IDs that disagree with seats', (state) => {
      writable(state.assignments[0]!).founderIds = ['f-0', 'f-1']
    }],
    ['fits that disagree with seated founders', (state) => {
      writable(state.assignments[0]!).founderFits = { 'f-0': 0.8 }
    }],
    ['fits outside zero to one', (state) => {
      writable(state.assignments[0]!).founderFits = { 'f-0': 1.2, 'f-1': 0.5, 'f-2': 0.5 }
    }],
    ['out-of-order table indexes', (state) => {
      writable(state.assignments[0]!).index = 1
    }],
    ['a table count that disagrees with assignments', (state) => {
      writable(state).tableCount = 3
    }],
    ['assignments without metrics', (state) => {
      writable(state).metrics = null
    }],
    ['alternatives without assignments', (state) => {
      Object.assign(state, {
        assignments: [],
        metrics: null,
        locks: [],
        rules: [],
      })
    }],
    ['more than three alternatives', (state) => {
      const extra = state.alternatives[1]!
      writable(state).alternatives = [
        ...state.alternatives,
        { ...extra, id: 'alt-c' },
        { ...extra, id: 'alt-d' },
      ]
    }],
    ['an alternative that drops a founder', (state) => {
      const alternative = writable(state.alternatives[1]!)
      alternative.tables = [state.alternatives[1]!.tables[0]!]
    }],
    ['two recommended alternatives', (state) => {
      Object.assign(state.alternatives[1]!, { kind: 'recommended' })
    }],
    ['a chosen alternative that does not exist', (state) => {
      writable(state).chosenAlternativeId = 'alt-z'
    }],
    ['a fractional threshold', (state) => {
      writable(state).threshold = 70.5
    }],
    ['a threshold above 100', (state) => {
      writable(state).threshold = 101
    }],
    ['a note about a founder outside the cohort', (state) => {
      Object.assign(state.notes[0]!, { founderId: 'f-9' })
    }],
    ['a note about a missing table', (state) => {
      Object.assign(state.notes[1]!, { tableIndex: 5 })
    }],
    ['a blank note', (state) => {
      Object.assign(state.notes[2]!, { text: '   ' })
    }],
  ])('rejects %s', (_label, mutate) => {
    expect(DinnerStateSchema.safeParse(mutated(mutate)).success).toBe(false)
  })
})

describe('dinner save requests', () => {
  it('trims names and accepts an optional note', () => {
    const state = buildDinnerState(IDS)

    expect(
      CreateDinnerRequestSchema.parse({
        name: '  AI Infrastructure Dinner  ',
        note: 'First pass',
        state,
      }),
    ).toEqual({ name: 'AI Infrastructure Dinner', note: 'First pass', state })
    expect(AppendDinnerVersionRequestSchema.parse({ state })).toEqual({ state })
  })

  it.each([
    ['a blank name', { name: '   ' }],
    ['an overlong name', { name: 'x'.repeat(121) }],
    ['unknown fields', { name: 'Dinner', id: 'client-chosen' }],
  ])('rejects %s', (_label, extra) => {
    expect(
      CreateDinnerRequestSchema.safeParse({
        state: buildDinnerState(IDS),
        ...extra,
      }).success,
    ).toBe(false)
  })
})
