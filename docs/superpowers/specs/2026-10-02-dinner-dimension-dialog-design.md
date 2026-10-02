# Dinner Dimension Dialog Design

## Goal

Replace automatic "next dimension" insertion with an explicit organizer choice in both Dinner setup and generated seating-plan review.

## Interaction

Clicking **+ Add dimension** opens a modal dialog. The organizer selects:

- One currently unused founder dimension
- Initial weight: L, M, or H

The dialog does not mutate criteria until **Add dimension** is confirmed. Cancel, Escape, and the scrim close without changes.

The same dialog and catalog power:

- Advanced criteria in the setup view
- Matching criteria in the generated Tables/Analysis review rail

Removed default dimensions become available to add again. The selected dimension keeps its catalog objective and description; the organizer can change the objective after adding with the existing Similar/Diverse control.

## Architecture

Expose available-dimension lookup and explicit addition from `dinnerState.ts`. Add one shared `DinnerDimensionDialog` component. Both setup and results controls invoke that component and pass their existing `onCriteriaChange` callback.

## Verification

Tests prove clicking the trigger alone changes nothing, the selected field and weight are applied on confirmation, removed default dimensions can be restored, and both setup/results surfaces use the same dialog.
