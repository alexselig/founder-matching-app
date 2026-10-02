import type { Founder } from '../../shared/founder'

export interface DiscoveryRecommendation {
  founder: Founder
  reason: string
}

export interface DiscoveryCollection {
  kicker: string
  title: string
  description: string
  founders: DiscoveryRecommendation[]
}

const COLLECTION_SIZE = 4

export function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function topLevelVertical(founder: Founder) {
  return founder.companyVerticalLevels[0] ?? founder.companyVertical
}

interface CollectionDefinition {
  kicker: string
  title: string
  description: string
  score: (founder: Founder, current: Founder) => number
  reason: (founder: Founder, current: Founder) => string
}

const COLLECTIONS: readonly CollectionDefinition[] = [
  {
    kicker: 'Useful adjacency',
    title: 'Same sector, different seat',
    description: 'Shared market context with a different operating perspective.',
    score: (founder, current) =>
      (founder.companyVertical === current.companyVertical
        ? 5
        : topLevelVertical(founder) === topLevelVertical(current)
          ? 3
          : 0) + (founder.role !== current.role ? 2 : -4),
    reason: (founder) => `${founder.role} perspective in ${topLevelVertical(founder)}`,
  },
  {
    kicker: 'Complementary',
    title: 'Operators who round you out',
    description: 'Different backgrounds, enough common ground for a useful conversation.',
    score: (founder, current) =>
      (founder.role !== current.role ? 3 : 0) +
      (founder.education !== current.education ? 2 : 0) +
      (topLevelVertical(founder) === topLevelVertical(current) ? 2 : 0),
    reason: (founder) => `${founder.role} operator with a ${founder.education.toLowerCase()} background`,
  },
  {
    kicker: 'Shared context',
    title: 'People likely to get it quickly',
    description: 'Closer patterns for conversations that can start in the middle.',
    score: (founder, current) =>
      (founder.companyVertical === current.companyVertical ? 4 : 0) +
      (founder.role === current.role ? 2 : 0) +
      (founder.education === current.education ? 1 : 0) -
      Math.abs(founder.age - current.age) / 10,
    reason: (founder, current) =>
      `${founder.role === current.role ? `Also in ${founder.role}` : topLevelVertical(founder)} · age ${founder.age}`,
  },
]

export function buildDiscoveryCollections(
  founders: readonly Founder[],
  current: Founder | null,
): DiscoveryCollection[] {
  const shown = new Set<string>()
  const candidates = current
    ? founders.filter((founder) => founder.id !== current.id && founder.company !== current.company)
    : []

  return COLLECTIONS.map(({ score, reason, ...copy }) => {
    const picks = current
      ? candidates
          .filter((founder) => !shown.has(founder.id))
          .map((founder) => ({ founder, score: score(founder, current) }))
          .sort((a, b) => b.score - a.score || stableHash(a.founder.id) - stableHash(b.founder.id))
          .slice(0, COLLECTION_SIZE)
          .map(({ founder }) => ({ founder, reason: reason(founder, current) }))
      : []
    picks.forEach(({ founder }) => shown.add(founder.id))
    return { ...copy, founders: picks }
  })
}
