export interface RawFounder {
  Id: string
  Name: string
  Group: string
  'Group Section': string
  'Company vertical': string
  Company: string
  Age: number
  Education: string
  Role: string
  Batch?: string
  Interests?: string[]
}

export interface Founder {
  id: string
  name: string
  group: string
  groupSection: string
  vertical: string
  topLevelVertical: string
  company: string
  age: number
  education: string
  role: string
  batch?: string
  interests: string[]
}

export function normalizeFounders(input: unknown): Founder[] {
  if (!Array.isArray(input)) throw new Error('Founder dataset must be an array')
  const seen = new Set<string>()
  return input.map((value, index) => {
    const row = value as Partial<RawFounder>
    const requireString = (key: keyof RawFounder) => {
      const field = row[key]
      if (typeof field !== 'string' || !field.trim()) {
        throw new Error(`Founder record ${index + 1} is missing ${String(key)}`)
      }
      return field.trim()
    }
    const id = requireString('Id')
    if (seen.has(id)) throw new Error(`Duplicate founder ID ${id}`)
    seen.add(id)
    const name = requireString('Name')
    if (!Number.isInteger(row.Age) || (row.Age ?? 0) < 18 || (row.Age ?? 0) > 120) {
      throw new Error(`Founder record ${index + 1} has an invalid Age`)
    }
    const vertical = requireString('Company vertical')
    return {
      id,
      name,
      group: requireString('Group'),
      groupSection: requireString('Group Section'),
      vertical,
      topLevelVertical: vertical.split(' -> ')[0],
      company: requireString('Company'),
      age: row.Age as number,
      education: requireString('Education'),
      role: requireString('Role'),
      batch: typeof row.Batch === 'string' && row.Batch.trim() ? row.Batch.trim() : undefined,
      interests: Array.isArray(row.Interests)
        ? row.Interests.filter((interest): interest is string => typeof interest === 'string')
        : [],
    }
  })
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function founderDistance(a: Founder, b: Founder, attribute: GroupingAttribute) {
  switch (attribute) {
    case 'age': return Math.min(Math.abs(a.age - b.age) / 20, 1)
    case 'industry': return a.topLevelVertical === b.topLevelVertical ? 0 : 1
    case 'role': return a.role === b.role ? 0 : 1
    case 'education': return a.education === b.education ? 0 : 1
    case 'company': return a.company === b.company ? 0 : 1
    case 'historicalGroup': return a.group === b.group ? 0 : 1
    case 'batch': return a.batch && b.batch && a.batch === b.batch ? 0 : 1
    case 'interests': {
      const shared = a.interests.filter((interest) => b.interests.includes(interest)).length
      const union = new Set([...a.interests, ...b.interests]).size
      return union ? 1 - shared / union : 1
    }
  }
}

export function buildDiscovery(founders: Founder[], selected: Founder) {
  const candidates = founders.filter(
    (founder) => founder.id !== selected.id && founder.company !== selected.company,
  )
  const rank = (
    score: (founder: Founder) => number,
    reason: (founder: Founder) => string,
  ) =>
    [...candidates]
      .sort((a, b) => score(b) - score(a) || stableHash(a.id) - stableHash(b.id))
      .slice(0, 4)
      .map((founder) => ({ founder, reason: reason(founder) }))

  return [
    {
      kicker: 'Useful adjacency',
      title: 'Same sector, different seat',
      description: 'Shared market context with a different operating perspective.',
      founders: rank(
        (founder) =>
          (founder.vertical === selected.vertical ? 5 : founder.topLevelVertical === selected.topLevelVertical ? 3 : 0) +
          (founder.role !== selected.role ? 2 : -4),
        (founder) => `${founder.role} perspective in ${founder.topLevelVertical}`,
      ),
    },
    {
      kicker: 'Complementary',
      title: 'Operators who round you out',
      description: 'Different backgrounds, enough common ground for a useful conversation.',
      founders: rank(
        (founder) =>
          (founder.role !== selected.role ? 3 : 0) +
          (founder.education !== selected.education ? 2 : 0) +
          (founder.topLevelVertical === selected.topLevelVertical ? 2 : 0),
        (founder) => `${founder.role} operator with a ${founder.education.toLowerCase()} background`,
      ),
    },
    {
      kicker: 'Shared context',
      title: 'People likely to get it quickly',
      description: 'Closer patterns for conversations that can start in the middle.',
      founders: rank(
        (founder) =>
          (founder.vertical === selected.vertical ? 4 : 0) +
          (founder.role === selected.role ? 2 : 0) +
          (founder.education === selected.education ? 1 : 0) -
          Math.abs(founder.age - selected.age) / 10,
        (founder) => `${founder.role === selected.role ? `Also in ${founder.role}` : founder.topLevelVertical} · age ${founder.age}`,
      ),
    },
  ]
}

export type GroupingStrategy = 'balanced' | 'diverse' | 'similar' | 'random'
export type GroupingAttribute =
  | 'age'
  | 'industry'
  | 'role'
  | 'education'
  | 'company'
  | 'historicalGroup'
  | 'batch'
  | 'interests'

interface GroupingConfig {
  targetSize: number
  strategy: GroupingStrategy
  seed: string
  attributes: GroupingAttribute[]
}

export function generateGroups(founders: Founder[], config: GroupingConfig) {
  const groupCount = Math.max(1, Math.ceil(founders.length / config.targetSize))
  const baseSize = Math.floor(founders.length / groupCount)
  const largerGroups = founders.length % groupCount
  const capacities = Array.from(
    { length: groupCount },
    (_, index) => baseSize + (index < largerGroups ? 1 : 0),
  )
  const groups: Founder[][] = Array.from({ length: groupCount }, () => [])
  const ordered = [...founders].sort(
    (a, b) => stableHash(`${config.seed}:${a.id}`) - stableHash(`${config.seed}:${b.id}`),
  )
  for (const founder of ordered) {
    const available = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group, index }) => group.length < capacities[index])
    const scored = available.map(({ group, index }) => {
      if (!group.length) return { index, score: index * 0.0001 }
      const distance =
        group.reduce(
          (sum, peer) =>
            sum +
            config.attributes.reduce(
              (attributeSum, attribute) => attributeSum + founderDistance(founder, peer, attribute),
              0,
            ),
          0,
        ) / (group.length * Math.max(config.attributes.length, 1))
      const companyPenalty = group.some((peer) => peer.company === founder.company) ? 3 : 0
      const strategyScore =
        config.strategy === 'similar'
          ? distance
          : config.strategy === 'diverse'
            ? -distance
            : config.strategy === 'random'
              ? stableHash(`${config.seed}:${founder.id}:${index}`) / 2 ** 32
              : Math.abs(distance - 0.55)
      return { index, score: strategyScore + companyPenalty }
    })
    scored.sort((a, b) => a.score - b.score || a.index - b.index)
    groups[scored[0].index].push(founder)
  }
  return { groups }
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function exportGroupsCsv(groups: Founder[][]) {
  const rows = [['Group', 'Name', 'Company', 'Industry', 'Role', 'Age', 'Batch', 'Interests']]
  groups.forEach((group, index) =>
    group.forEach((founder) =>
      rows.push([
        String(index + 1),
        founder.name,
        founder.company,
        founder.vertical,
        founder.role,
        String(founder.age),
        founder.batch ?? '',
        founder.interests.join('; '),
      ]),
    ),
  )
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
