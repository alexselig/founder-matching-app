import type { Founder } from '../../shared/founder.js'
import { FOUNDER_SCHEMA, type FounderFieldKey } from '../../shared/schemaRegistry.js'

export interface RuleConflict {
  readonly ruleIds: readonly string[]
  readonly founderIds: readonly string[]
  readonly message: string
}

export interface FounderReference {
  readonly id?: string
  readonly name?: string
}

interface RuleBase {
  readonly id: string
}

export type HardRuleInput =
  | (RuleBase & {
      readonly type: 'must-sit-together'
      readonly founders: readonly FounderReference[]
    })
  | (RuleBase & {
      readonly type: 'cannot-sit-together'
      readonly founders: readonly FounderReference[]
    })
  | (RuleBase & { readonly type: 'same-company-separation' })
  | (RuleBase & {
      readonly type: 'field-count'
      readonly field: string
      readonly value: string | number
      readonly min?: number
      readonly max?: number
    })
  | (RuleBase & { readonly type: 'fixed-table-size'; readonly size: number })
  | (RuleBase & {
      readonly type: 'pinned-table'
      readonly founder: FounderReference
      readonly tableIndex: number
    })
  | (RuleBase & {
      readonly type: 'pinned-seat'
      readonly founder: FounderReference
      readonly tableIndex: number
      readonly seatIndex: number
    })

export type HardRule =
  | (RuleBase & {
      readonly type: 'must-sit-together'
      readonly founderIds: readonly string[]
    })
  | (RuleBase & {
      readonly type: 'cannot-sit-together'
      readonly founderIds: readonly string[]
    })
  | (RuleBase & { readonly type: 'same-company-separation' })
  | (RuleBase & {
      readonly type: 'field-count'
      readonly field: FounderFieldKey
      readonly value: string | number
      readonly min?: number
      readonly max?: number
    })
  | (RuleBase & { readonly type: 'fixed-table-size'; readonly size: number })
  | (RuleBase & {
      readonly type: 'pinned-table'
      readonly founderId: string
      readonly tableIndex: number
    })
  | (RuleBase & {
      readonly type: 'pinned-seat'
      readonly founderId: string
      readonly tableIndex: number
      readonly seatIndex: number
    })

export interface HardRuleSet {
  readonly rules: readonly HardRule[]
  readonly conflicts: readonly RuleConflict[]
}

type TableLike = {
  readonly founderIds: readonly string[]
  readonly seats?: readonly (string | null)[]
}

class UnionFind {
  private readonly parent = new Map<string, string>()

  add(value: string) {
    if (!this.parent.has(value)) {
      this.parent.set(value, value)
    }
  }

  find(value: string): string {
    this.add(value)
    const parent = this.parent.get(value)!
    if (parent === value) {
      return value
    }
    const root = this.find(parent)
    this.parent.set(value, root)
    return root
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot)
    }
  }
}

function normalizeName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

function conflict(
  ruleIds: readonly string[],
  founderIds: readonly string[],
  message: string,
): RuleConflict {
  return {
    ruleIds: [...new Set(ruleIds)].sort(),
    founderIds: [...new Set(founderIds)].sort(),
    message,
  }
}

function resolveFounder(
  reference: FounderReference,
  founders: readonly Founder[],
  ruleId: string,
): { founderId?: string; conflict?: RuleConflict } {
  if (reference.id !== undefined) {
    const founder = founders.find((candidate) => candidate.id === reference.id)
    return founder
      ? { founderId: founder.id }
      : {
          conflict: conflict(
            [ruleId],
            [reference.id],
            `Rule ${ruleId} references unknown founder ID ${reference.id}`,
          ),
        }
  }

  if (reference.name !== undefined) {
    const name = normalizeName(reference.name)
    const matches = founders.filter(
      (candidate) =>
        candidate.searchName === name || normalizeName(candidate.name) === name,
    )
    if (matches.length === 1) {
      return { founderId: matches[0]!.id }
    }
    if (matches.length > 1) {
      return {
        conflict: conflict(
          [ruleId],
          matches.map((founder) => founder.id),
          `Founder name "${reference.name}" is ambiguous and requires resolution`,
        ),
      }
    }
    return {
      conflict: conflict(
        [ruleId],
        [],
        `Rule ${ruleId} references unknown founder name "${reference.name}"`,
      ),
    }
  }

  return {
    conflict: conflict(
      [ruleId],
      [],
      `Rule ${ruleId} is missing a founder ID or name`,
    ),
  }
}

function resolveFounderList(
  references: readonly FounderReference[],
  founders: readonly Founder[],
  ruleId: string,
) {
  const founderIds: string[] = []
  const conflicts: RuleConflict[] = []
  for (const reference of references) {
    const resolved = resolveFounder(reference, founders, ruleId)
    if (resolved.conflict) {
      conflicts.push(resolved.conflict)
    } else if (resolved.founderId) {
      founderIds.push(resolved.founderId)
    }
  }
  return {
    founderIds: [...new Set(founderIds)],
    conflicts,
  }
}

function resolveField(value: string) {
  const token = normalizeName(value)
  const matches = FOUNDER_SCHEMA.filter((field) =>
    [field.key, field.path, field.label, field.source, ...field.aliases].some(
      (name) => normalizeName(name) === token,
    ),
  )
  return matches.length === 1 ? matches[0]!.key : undefined
}

function compileRule(
  input: HardRuleInput,
  founders: readonly Founder[],
): { rule?: HardRule; conflicts: RuleConflict[] } {
  switch (input.type) {
    case 'must-sit-together':
    case 'cannot-sit-together': {
      const resolved = resolveFounderList(input.founders, founders, input.id)
      if (resolved.conflicts.length) {
        return { conflicts: resolved.conflicts }
      }
      if (resolved.founderIds.length < 2) {
        return {
          conflicts: [
            conflict(
              [input.id],
              resolved.founderIds,
              `Rule ${input.id} requires at least two distinct founders`,
            ),
          ],
        }
      }
      return {
        rule: Object.freeze({
          id: input.id,
          type: input.type,
          founderIds: Object.freeze(resolved.founderIds),
        }),
        conflicts: [],
      }
    }
    case 'same-company-separation':
      return { rule: Object.freeze({ ...input }), conflicts: [] }
    case 'field-count': {
      const field = resolveField(input.field)
      if (!field) {
        return {
          conflicts: [
            conflict([input.id], [], `Rule ${input.id} has unknown field ${input.field}`),
          ],
        }
      }
      if (
        (input.min === undefined && input.max === undefined) ||
        (input.min !== undefined && (!Number.isInteger(input.min) || input.min < 0)) ||
        (input.max !== undefined && (!Number.isInteger(input.max) || input.max < 0)) ||
        (input.min !== undefined && input.max !== undefined && input.min > input.max)
      ) {
        return {
          conflicts: [
            conflict([input.id], [], `Rule ${input.id} has an invalid field-count range`),
          ],
        }
      }
      return { rule: Object.freeze({ ...input, field }), conflicts: [] }
    }
    case 'fixed-table-size':
      return Number.isInteger(input.size) && input.size > 0
        ? { rule: Object.freeze({ ...input }), conflicts: [] }
        : {
            conflicts: [
              conflict([input.id], [], `Rule ${input.id} has an invalid table size`),
            ],
          }
    case 'pinned-table':
    case 'pinned-seat': {
      const resolved = resolveFounder(input.founder, founders, input.id)
      if (resolved.conflict || !resolved.founderId) {
        return { conflicts: resolved.conflict ? [resolved.conflict] : [] }
      }
      if (
        !Number.isInteger(input.tableIndex) ||
        input.tableIndex < 0 ||
        (input.type === 'pinned-seat' &&
          (!Number.isInteger(input.seatIndex) || input.seatIndex < 0))
      ) {
        return {
          conflicts: [
            conflict(
              [input.id],
              [resolved.founderId],
              `Rule ${input.id} has an invalid table or seat index`,
            ),
          ],
        }
      }
      return {
        rule: Object.freeze({
          id: input.id,
          type: input.type,
          founderId: resolved.founderId,
          tableIndex: input.tableIndex,
          ...(input.type === 'pinned-seat' ? { seatIndex: input.seatIndex } : {}),
        }) as HardRule,
        conflicts: [],
      }
    }
  }
}

export function detectRuleConflicts(
  rules: readonly HardRule[],
  founders: readonly Founder[],
): RuleConflict[] {
  const conflicts: RuleConflict[] = []
  const together = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'must-sit-together' }> =>
      rule.type === 'must-sit-together',
  )
  const unionFind = new UnionFind()
  for (const rule of together) {
    const [first, ...rest] = rule.founderIds
    if (!first) {
      continue
    }
    for (const founderId of rest) {
      unionFind.union(first, founderId)
    }
  }

  for (const rule of rules) {
    if (rule.type !== 'cannot-sit-together') {
      continue
    }
    for (let leftIndex = 0; leftIndex < rule.founderIds.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < rule.founderIds.length;
        rightIndex += 1
      ) {
        const left = rule.founderIds[leftIndex]!
        const right = rule.founderIds[rightIndex]!
        if (unionFind.find(left) === unionFind.find(right)) {
          const componentRoot = unionFind.find(left)
          const linkingRuleIds = together
            .filter((candidate) =>
              candidate.founderIds.some(
                (founderId) => unionFind.find(founderId) === componentRoot,
              ),
            )
            .map((candidate) => candidate.id)
          conflicts.push(
            conflict(
              [rule.id, ...linkingRuleIds],
              [left, right],
              `Founders ${left} and ${right} are required together and apart`,
            ),
          )
        }
      }
    }
  }

  const pinsByFounder = new Map<
    string,
    Array<
      Extract<HardRule, { type: 'pinned-table' }> |
      Extract<HardRule, { type: 'pinned-seat' }>
    >
  >()
  for (const rule of rules) {
    if (rule.type === 'pinned-table' || rule.type === 'pinned-seat') {
      pinsByFounder.set(rule.founderId, [
        ...(pinsByFounder.get(rule.founderId) ?? []),
        rule,
      ])
    }
  }
  for (const [founderId, pins] of pinsByFounder) {
    const tableIndexes = new Set(pins.map((pin) => pin.tableIndex))
    const seatIndexes = new Set(
      pins
        .filter(
          (pin): pin is Extract<HardRule, { type: 'pinned-seat' }> =>
            pin.type === 'pinned-seat',
        )
        .map((pin) => `${pin.tableIndex}:${pin.seatIndex}`),
    )
    if (tableIndexes.size > 1 || seatIndexes.size > 1) {
      conflicts.push(
        conflict(
          pins.map((pin) => pin.id),
          [founderId],
          `Founder ${founderId} is pinned to incompatible locations`,
        ),
      )
    }
  }

  const seatPins = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'pinned-seat' }> =>
      rule.type === 'pinned-seat',
  )
  const seatLocations = new Map<string, typeof seatPins>()
  for (const pin of seatPins) {
    const location = `${pin.tableIndex}:${pin.seatIndex}`
    seatLocations.set(location, [...(seatLocations.get(location) ?? []), pin])
  }
  for (const pins of seatLocations.values()) {
    const founderIds = [...new Set(pins.map((pin) => pin.founderId))]
    if (founderIds.length > 1) {
      conflicts.push(
        conflict(
          pins.map((pin) => pin.id),
          founderIds,
          `Multiple founders are pinned to the same seat`,
        ),
      )
    }
  }

  const founderById = new Map(founders.map((founder) => [founder.id, founder]))
  const separationRules = rules.filter(
    (rule): rule is Extract<HardRule, { type: 'same-company-separation' }> =>
      rule.type === 'same-company-separation',
  )
  const components = new Map<string, string[]>()
  for (const founder of founders) {
    const root = unionFind.find(founder.id)
    components.set(root, [...(components.get(root) ?? []), founder.id])
  }
  for (const [componentRoot, componentFounderIds] of components) {
    if (componentFounderIds.length < 2) {
      continue
    }
    const byCompany = new Map<string, string[]>()
    for (const founderId of componentFounderIds) {
      const founder = founderById.get(founderId)
      if (founder) {
        byCompany.set(founder.company, [
          ...(byCompany.get(founder.company) ?? []),
          founderId,
        ])
      }
    }
    for (const sameCompanyIds of byCompany.values()) {
      if (sameCompanyIds.length > 1) {
        const linkingRuleIds = together
          .filter((rule) =>
            rule.founderIds.some(
              (founderId) => unionFind.find(founderId) === componentRoot,
            ),
          )
          .map((rule) => rule.id)
        for (const separationRule of separationRules) {
          conflicts.push(
            conflict(
              [separationRule.id, ...linkingRuleIds],
              sameCompanyIds,
              `Same-company founders are required together and separated`,
            ),
          )
        }
      }
    }
  }

  return conflicts
}

export function compileHardRules(
  inputs: readonly HardRuleInput[],
  founders: readonly Founder[],
): HardRuleSet {
  const rules: HardRule[] = []
  const conflicts: RuleConflict[] = []
  const seenRuleIds = new Set<string>()

  for (const input of inputs) {
    if (seenRuleIds.has(input.id)) {
      conflicts.push(conflict([input.id], [], `Duplicate rule ID ${input.id}`))
      continue
    }
    seenRuleIds.add(input.id)
    const compiled = compileRule(input, founders)
    if (compiled.rule) {
      rules.push(compiled.rule)
    }
    conflicts.push(...compiled.conflicts)
  }

  conflicts.push(...detectRuleConflicts(rules, founders))
  return Object.freeze({
    rules: Object.freeze(rules),
    conflicts: Object.freeze(conflicts),
  })
}

function matchingCount(
  table: TableLike,
  founderById: ReadonlyMap<string, Founder>,
  field: FounderFieldKey,
  value: string | number,
) {
  return table.founderIds.filter(
    (founderId) => founderById.get(founderId)?.[field] === value,
  ).length
}

export function findRuleViolations(
  tables: readonly TableLike[],
  founders: readonly Founder[],
  rules: readonly HardRule[],
): RuleConflict[] {
  const violations: RuleConflict[] = []
  const tableByFounder = new Map<string, number>()
  tables.forEach((table, tableIndex) => {
    table.founderIds.forEach((founderId) => tableByFounder.set(founderId, tableIndex))
  })
  const founderById = new Map(founders.map((founder) => [founder.id, founder]))

  for (const rule of rules) {
    switch (rule.type) {
      case 'must-sit-together': {
        const assignedTables = new Set(
          rule.founderIds.map((founderId) => tableByFounder.get(founderId)),
        )
        if (assignedTables.size > 1 || assignedTables.has(undefined)) {
          violations.push(
            conflict(
              [rule.id],
              rule.founderIds,
              `Rule ${rule.id} requires founders to sit together`,
            ),
          )
        }
        break
      }
      case 'cannot-sit-together': {
        for (let leftIndex = 0; leftIndex < rule.founderIds.length; leftIndex += 1) {
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < rule.founderIds.length;
            rightIndex += 1
          ) {
            const left = rule.founderIds[leftIndex]!
            const right = rule.founderIds[rightIndex]!
            if (
              tableByFounder.get(left) !== undefined &&
              tableByFounder.get(left) === tableByFounder.get(right)
            ) {
              violations.push(
                conflict(
                  [rule.id],
                  [left, right],
                  `Rule ${rule.id} requires founders to sit apart`,
                ),
              )
            }
          }
        }
        break
      }
      case 'same-company-separation':
        for (const table of tables) {
          const byCompany = new Map<string, string[]>()
          for (const founderId of table.founderIds) {
            const company = founderById.get(founderId)?.company
            if (company) {
              byCompany.set(company, [...(byCompany.get(company) ?? []), founderId])
            }
          }
          for (const sameCompanyIds of byCompany.values()) {
            if (sameCompanyIds.length > 1) {
              violations.push(
                conflict(
                  [rule.id],
                  sameCompanyIds,
                  `Rule ${rule.id} separates founders from the same company`,
                ),
              )
            }
          }
        }
        break
      case 'field-count':
        tables.forEach((table, tableIndex) => {
          const count = matchingCount(table, founderById, rule.field, rule.value)
          if (
            (rule.min !== undefined && count < rule.min) ||
            (rule.max !== undefined && count > rule.max)
          ) {
            violations.push(
              conflict(
                [rule.id],
                table.founderIds,
                `Rule ${rule.id} is not satisfied at table ${tableIndex}`,
              ),
            )
          }
        })
        break
      case 'fixed-table-size':
        tables.forEach((table, tableIndex) => {
          if (table.founderIds.length !== rule.size) {
            violations.push(
              conflict(
                [rule.id],
                table.founderIds,
                `Rule ${rule.id} requires table ${tableIndex} to have size ${rule.size}`,
              ),
            )
          }
        })
        break
      case 'pinned-table':
        if (tableByFounder.get(rule.founderId) !== rule.tableIndex) {
          violations.push(
            conflict(
              [rule.id],
              [rule.founderId],
              `Rule ${rule.id} pins founder ${rule.founderId} to table ${rule.tableIndex}`,
            ),
          )
        }
        break
      case 'pinned-seat':
        if (tables[rule.tableIndex]?.seats?.[rule.seatIndex] !== rule.founderId) {
          violations.push(
            conflict(
              [rule.id],
              [rule.founderId],
              `Rule ${rule.id} pins founder ${rule.founderId} to a seat`,
            ),
          )
        }
        break
    }
  }

  return violations
}
