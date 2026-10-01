# Founder Discovery and Search Design

## Purpose

Build a founder-first web application that helps members of a founder community
discover relevant people before they know exactly what to search for, then refine
the directory through full-text search, filters, and sorting.

The first release is a local prototype using the supplied 574-founder dataset.
It validates the founder discovery and search experience plus an organizer-only
grouping workspace. It does not include authentication, messaging, or
server-side persistence.

## Users and success criteria

The primary user is a founder looking for useful peers, collaborators, or people
with complementary experience.

The prototype succeeds when a founder can:

1. Choose an existing record to represent themselves.
2. Find useful candidates without entering a query.
3. Search by founder name, company, vertical, role, or education.
4. combine filters and sorting without losing context.
5. Understand why a discovered founder is being recommended.
6. Identify which additional profile information would improve future matching.

An organizer must also be able to:

1. Choose the attendee pool and target group size.
2. Group attendees by similarity, diversity, or custom weighted criteria.
3. Apply hard constraints such as separating people from the same company.
4. Inspect why each group was formed.
5. Export the generated assignments.

## Dataset

The source contains 574 complete records and no duplicate IDs. Each record has:

- ID
- Name
- Company
- Hierarchical company vertical
- Age
- Education
- Role
- Historical group
- Historical group section

The directory contains 255 companies, 40 vertical values, three roles, and six
education values. Existing group fields are historical event metadata and are
not treated as stable profile identity.

Age and education are optional discovery signals. Neither affects default
relevance ranking because they are weak indicators of founder compatibility.

## Product approach

Use a discovery-plus-faceted-directory model.

The landing state is useful without a query. It presents small, explainable
collections derived from the selected founder:

- Same sector, different role
- Complementary operators
- Outside your usual circle
- Shared context
- Browse by vertical

The directory remains visible below the collections. A query or filter moves the
interface into search mode while preserving the selected profile and active
controls. Clearing the query and filters restores the discovery state.

This approach provides immediate value from the current structured data and
creates a clean path toward intent-led and personalized matching once richer
profile fields exist.

## Information architecture

The application has two responsive views.

### Founder directory

1. Masthead with product identity and dataset count.
2. "You are browsing as" profile selector.
3. Search field and filter controls.
4. Zero-query discovery collections or search summary.
5. Founder result grid.
6. Founder detail drawer.
7. "Improve your matches" panel showing future profile fields.

The URL stores query, filter, sort, and selected-profile state so a view can be
bookmarked or shared.

### Organizer grouping workspace

The organizer view is available at `/admin`. In the local prototype, the route
is visibly marked as an admin preview but is not access-controlled. Production
use requires authentication and an organizer role.

The workspace contains:

1. Attendee-pool filters and selected count.
2. Target group-size control.
3. Grouping strategy selector.
4. Parameter weights and hard constraints.
5. Deterministic seed control for alternate valid arrangements.
6. Generated group cards with composition summaries.
7. Warnings for constraints that cannot be fully satisfied.
8. CSV export.

## Search and filtering

Search is case-insensitive and token-based across:

- Name
- Company
- Full vertical path
- Role
- Education

Results must contain every non-empty query token somewhere in their indexed
text. Exact and prefix matches rank above substring matches.

Filters include:

- Top-level vertical
- Detailed vertical
- Role
- Education
- Age range
- Company
- Historical group
- Historical group section

Filters are combined with AND semantics across categories and OR semantics
within a multi-select category. Active filters appear as removable chips.

Sort options are:

- Relevance
- Name
- Most similar
- Most complementary
- Serendipity

Similarity and complementarity scores are deterministic and explainable.
Serendipity uses a stable hash rather than runtime randomness so results do not
jump between renders.

## Discovery scoring

The selected profile is excluded from recommendations.

### Same sector, different role

Prefer the same detailed vertical, then the same top-level vertical. Require a
different role. Explain the shared sector and differing role.

### Complementary operators

Reward different roles and education, a modest age spread, and related rather
than identical verticals. Penalize the same company.

### Outside your usual circle

Prefer different top-level verticals, groups, sections, roles, and education.
Penalize the same company.

### Shared context

Reward the same detailed vertical, role, education, and nearby age. Penalize the
same company so the collection still introduces someone new.

Each card displays one concise reason based on its strongest scoring signals.
Scores themselves are not presented as scientific compatibility measures.

## Founder records and future profile data

The prototype displays the supplied fields and separately proposes richer fields
for future collection:

- Company description
- Company stage
- Team size
- Location and time zone
- Business model
- Functional expertise
- Current needs
- Areas where the founder can help
- Meeting intent
- Sectors of interest
- In-person or remote preference
- Languages
- Contact preference
- Profile and field-level visibility

Needs, help offered, intent, and expertise should use controlled multi-select
taxonomies with optional free text. Founder-supplied data must remain distinct
from inferred or behavioral data. Sensitive traits must not be inferred.

Batch and interests are not present in the supplied data. The prototype data
model therefore supports optional `batch` and `interests` fields and identifies
them as missing rather than fabricating values. The organizer workspace disables
their weighting until at least one attendee has a value. A future profile editor
will collect:

- Batch or cohort
- Professional interests
- Personal conversation interests

## Organizer grouping

Grouping is configurable rather than tied to a single definition of a good
dinner table.

### Strategies

- **Similar:** cluster attendees who share selected attributes.
- **Diverse:** distribute selected attributes across groups.
- **Balanced:** use moderate diversity while preserving some shared context.
- **Custom:** let the organizer assign each parameter a similarity, diversity,
  or ignored objective with a weight.

Available parameters in the prototype are:

- Age
- Batch, when captured
- Industry at the top-level or detailed vertical level
- Interests, when captured
- Role
- Education
- Company
- Historical group and group section

### Controls and constraints

The organizer chooses a target size. The algorithm creates groups whose sizes
differ by no more than one when the attendee count is not evenly divisible.

Hard constraints include:

- Separate attendees from the same company where feasible.
- Keep selected attendees together.
- Keep selected attendees apart.
- Lock an attendee into a specific group.
- Exclude an attendee from the current run.

Conflicting constraints produce explicit warnings. The application still
returns the best valid partial arrangement when possible and identifies each
unsatisfied constraint.

### Algorithm

Use a deterministic greedy assignment followed by bounded pairwise swaps:

1. Normalize each enabled attribute into a comparable distance.
2. Sort attendees by how difficult they are to place.
3. Assign each attendee to the eligible group with the best weighted score.
4. Run pairwise swaps while they improve the total score without breaking hard
   constraints.
5. Use the organizer-provided seed only to break equivalent choices.

This approach is fast and explainable for 574 records. It does not claim a
globally optimal solution. Each group shows summaries for enabled parameters and
the strongest reasons behind its composition.

## Visual design

Use the Alex Tools house system:

- Paper background `#fbfaf7`
- Ink `#111111`
- Instrument Sans
- Square corners
- One-pixel rules instead of soft shadows
- Navy for process/navigation
- Teal for verified or shared context
- Rust for unmet needs or warnings
- Tan for provisional data

The interface should feel like an editorial directory rather than a social
network or swipe application. Dense data is acceptable, but controls and result
cards must remain legible on mobile.

## Architecture

Use a static React and TypeScript application built with Vite.

Modules are separated by responsibility:

- Dataset validation and normalization
- Search indexing and text scoring
- Filter and sort logic
- Discovery scoring and explanations
- Grouping attribute distances and weighted scoring
- Group assignment, constraints, and optimization
- CSV export
- URL state serialization
- Presentational components

The supplied JSON is checked into the repository as prototype data. No remote
request is required at runtime.

## Error handling

Dataset loading validates required fields and displays an explicit blocking
error if records are malformed. Invalid URL values are ignored individually
while valid values remain active. Empty search states explain which controls
removed all results and provide a single action to clear them.

No operation should silently substitute fabricated founder data.

## Testing

Unit tests cover:

- Dataset normalization and validation
- Search token matching and ranking
- Filter combination semantics
- Similarity, complementarity, and discovery explanations
- Stable serendipity ordering
- Even group sizing and deterministic seeded assignment
- Similarity and diversity objectives
- Same-company separation
- Locked, together, apart, and excluded attendees
- Explicit reporting of impossible constraints
- URL state parsing and serialization

Component tests cover the zero-query state, active search state, empty state,
filter removal, selected-profile changes, founder detail drawer, grouping
configuration, generated groups, warnings, and export.

The production build and static preview are verified before publishing.

## Explicitly deferred

- Authentication and invitations
- Founder-managed profile editing
- Messaging or introduction requests
- Saved founders and interaction history
- Server-side persistence
- Natural-language intent search
- Machine-learned ranking
- Globally optimal constraint solving
- Production organizer authentication and administration
