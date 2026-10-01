# Maximin Founder and Table Quality Design

## Problem

The current greedy assignment optimizes each founder's next placement against
partially filled tables. That can produce a good average while leaving one
founder or one table materially worse than the rest.

The organizer must be able to select only the matching parameters they trust,
then optimize the arrangement so weak tables are not sacrificed for stronger
ones.

## Decision

Use a lexicographic maximin objective:

1. Maximize the quality of the worst-served founder.
2. If tied, maximize the next-worst founder, continuing through all founders.
3. If founder quality is tied, maximize the worst table.
4. Continue through the remaining tables.
5. Use overall mean quality only as the final tie-break.

This treats fairness as the primary objective and average quality as a
secondary objective.

## Parameter selection

The organizer explicitly enables the parameters used in a run. Disabled
parameters contribute nothing.

Available parameters remain:

- Age
- Industry
- Role
- Education
- Company
- Historical group
- Batch, when captured
- Interests, when captured

Missing values are ignored for the affected pair rather than interpreted as
similar or different. If no enabled parameter can compare a pair, that pair
receives a neutral quality of `0.5`.

## Pair quality

Every enabled parameter produces a distance from `0` to `1`.

The strategy converts distance to pair quality:

- Similar: `1 - distance`
- Diverse: `distance`
- Balanced: `1 - abs(distance - 0.55) / 0.55`, clamped to `0–1`
- Random: seeded neutral quality; selected profile parameters do not contribute

Same-company placement remains a separate soft constraint. A same-company pair
receives quality `0`, regardless of the selected strategy.

## Founder and table quality

For a founder at a table:

`founderQuality = mean(pairQuality(founder, every table peer))`

For a table:

`tableQuality = minimum(founderQuality for founders at that table)`

Using the minimum founder quality as the table score prevents a strong majority
from hiding one poorly served founder.

## Optimization

1. Build balanced table capacities.
2. Create a deterministic seeded initial arrangement.
3. Precompute pair qualities for the selected parameters and strategy.
4. Evaluate cross-table founder swaps.
5. Accept a swap only when it lexicographically improves the affected founders'
   sorted quality vector.
6. When founder vectors tie, compare the two affected table qualities.
7. Continue until a full pass finds no improving swap or the safety limit is
   reached.

The result is a pairwise local optimum: no evaluated one-for-one cross-table
swap can improve the fairness objective. It is not claimed to be the global
mathematical optimum across every possible partition.

For large attendee pools, evaluate candidate swaps in deterministic seeded order
and apply a documented comparison limit. Return whether the run converged or
stopped at the limit.

## Result diagnostics

The grouping result includes:

- Minimum founder quality
- Minimum table quality
- Mean founder quality
- Per-table quality
- Per-founder quality
- Number of accepted swaps
- Number of evaluated swaps
- Whether pairwise convergence was reached

The admin view shows the minimum and mean quality, labels the weakest table, and
warns when optimization stops at its comparison limit.

## Error handling

- Reject an empty parameter set for Similar, Diverse, or Balanced unless the
  organizer explicitly chooses Random.
- Ignore missing pair attributes and report parameters unavailable across the
  selected pool.
- Keep table-size validation explicit.
- Never return an apparently successful quality score when no pair can be
  evaluated.

## Testing

Tests must prove:

- Every founder appears exactly once.
- Table sizes differ by no more than one.
- The same seed and configuration reproduce the same result.
- Different seeds can produce different initial arrangements.
- Optimization never lowers the lexicographic quality vector.
- No cross-table swap improves a converged result.
- Maximin optimization improves a deliberately bad initial arrangement.
- The weakest table cannot be sacrificed to raise only the mean.
- Disabled and missing parameters do not influence quality.
- Similar, Diverse, and Balanced convert distance as documented.

