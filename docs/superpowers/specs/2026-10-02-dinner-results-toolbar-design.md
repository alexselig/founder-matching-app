# Dinner Results Toolbar Design

## Goal

Make the Tables and Analysis result controls read as one clear navigation row rather than several unrelated toggles.

## Layout

The desktop control order is:

1. Full-height Tables / Analysis tabs
2. Threshold stepper
3. Fit-score legend
4. Density control aligned to the far right

Density is available only in Tables. It is not rendered in Analysis because it has no effect there.

Tables and Analysis span the full toolbar height and use tab styling: shared row edges, a clear active surface, and a bottom active indicator. Threshold uses a minus button, editable numeric input, and plus button. It is clamped to the existing 60–85 range. Legend remains a compact inline utility.

## Responsive Behavior

Existing tablet behavior may continue hiding the legend. Existing phone behavior may continue hiding Threshold and Density. The full-height tabs remain available at every width.

## Verification

Tests verify DOM order, Density visibility by workspace, threshold typing and increment/decrement bounds, and the full-height tab CSS. Existing density, Tables, Analysis, tablet, and phone behavior must remain green.
