import type { Founder } from '../../shared/founder'

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export interface FounderAttribute {
  label: string
  value: string
  wide?: boolean
}

export function founderAttributes(founder: Founder): FounderAttribute[] {
  return [
    { label: 'Founder ID', value: founder.id },
    { label: 'Company', value: founder.company },
    { label: 'Company vertical', value: founder.companyVertical, wide: true },
    { label: 'Role', value: founder.role },
    { label: 'Age', value: String(founder.age) },
    { label: 'Education', value: founder.education },
    { label: 'Cohort group', value: founder.cohortGroup },
    { label: 'Cohort section', value: founder.cohortSection },
  ]
}

export function founderAccountLabel(founder: Founder) {
  return `${founder.name} · ${founder.company}`
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function noResultsHeading(constraintCount: number) {
  if (constraintCount === 0) return 'No founders match this search.'
  if (constraintCount === 1) return 'No founders match this dimension.'
  if (constraintCount === 2) return 'No founders match both dimensions.'
  return `No founders match all ${NUMBER_WORDS[constraintCount] ?? constraintCount} dimensions.`
}
