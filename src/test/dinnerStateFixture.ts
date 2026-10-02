import type { DinnerState, DinnerTable } from '../shared/dinnerContracts.js'

function table(
  index: number,
  seats: string[],
  fits: number[],
): DinnerTable {
  return {
    index,
    capacity: seats.length,
    founderIds: [...seats],
    seats: [...seats],
    founderFits: Object.fromEntries(
      seats.map((founderId, seat) => [founderId, fits[seat]!]),
    ),
    quality: Math.min(...fits),
  }
}

// Two tables of three with every saved-dinner feature populated.
export function buildDinnerState(founderIds: readonly string[]): DinnerState {
  if (founderIds.length !== 6) {
    throw new Error('buildDinnerState requires exactly six founder IDs')
  }
  const [f0, f1, f2, f3, f4, f5] = founderIds as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const tables = [
    table(0, [f0, f1, f2], [0.82, 0.74, 0.66]),
    table(1, [f3, f4, f5], [0.71, 0.58, 0.9]),
  ]
  const metrics = {
    founderFitVector: [0.82, 0.74, 0.66, 0.71, 0.58, 0.9],
    tableQualityVector: [0.66, 0.58],
    meanFounderFit: 0.735,
    meanTableQuality: 0.62,
  }

  return {
    cohort: {
      source: 'search',
      founderIds: [...founderIds],
      searchText: 'Engineering founders in B2B software',
    },
    brief: 'Mix sectors, diversify roles, avoid same-company pairs',
    tableCount: 2,
    criteria: {
      criteria: [
        {
          id: 'criterion-role',
          field: 'role',
          objective: 'diversity',
          weightLevel: 'H',
          weight: 3,
          operator: 'categorical',
          missingValuePolicy: 'exclude',
          enabled: true,
          provenance: 'manual',
        },
        {
          id: 'criterion-vertical',
          field: 'companyVertical',
          objective: 'similarity',
          weightLevel: 'M',
          weight: 2,
          operator: 'hierarchical',
          missingValuePolicy: 'exclude',
          enabled: true,
          provenance: 'ai',
        },
        {
          id: 'criterion-age',
          field: 'age',
          objective: 'similarity',
          weightLevel: 'L',
          weight: 1,
          operator: 'numeric',
          missingValuePolicy: 'zero',
          enabled: false,
          provenance: 'hybrid',
        },
      ],
    },
    rules: [
      { id: 'rule-company', type: 'same-company-separation' },
      { id: 'rule-together', type: 'must-sit-together', founderIds: [f0, f1] },
      { id: 'rule-apart', type: 'cannot-sit-together', founderIds: [f0, f3] },
      {
        id: 'rule-engineering',
        type: 'field-count',
        field: 'role',
        value: 'Engineering',
        min: 0,
        max: 2,
      },
      {
        id: 'rule-pin',
        type: 'pinned-seat',
        founderId: f4,
        tableIndex: 1,
        seatIndex: 1,
      },
    ],
    locks: [
      { founderId: f2, tableIndex: 0, seatIndex: 2 },
      { founderId: f5, tableIndex: 1 },
    ],
    assignments: tables,
    metrics,
    alternatives: [
      { id: 'alt-recommended', kind: 'recommended', tables, metrics },
      {
        id: 'alt-b',
        kind: 'alternative',
        tables: [
          table(0, [f1, f0, f2], [0.8, 0.75, 0.6]),
          table(1, [f3, f4, f5], [0.7, 0.6, 0.88]),
        ],
        metrics: {
          founderFitVector: [0.75, 0.8, 0.6, 0.7, 0.6, 0.88],
          tableQualityVector: [0.6, 0.6],
          meanFounderFit: 0.7217,
          meanTableQuality: 0.6,
        },
      },
    ],
    chosenAlternativeId: 'alt-recommended',
    threshold: 70,
    notes: [
      { id: 'note-founder', text: 'Seat near the stage', founderId: f0 },
      { id: 'note-table', text: 'Quiet corner table', tableIndex: 1 },
      { id: 'note-dinner', text: 'Dinner starts at 7pm' },
    ],
  }
}

export function buildDraftDinnerState(
  founderIds: readonly string[],
): DinnerState {
  return {
    cohort: { source: 'direct', founderIds: [...founderIds] },
    tableCount: null,
    criteria: { criteria: [] },
    rules: [],
    locks: [],
    assignments: [],
    metrics: null,
    alternatives: [],
    chosenAlternativeId: null,
    threshold: 70,
    notes: [],
  }
}
