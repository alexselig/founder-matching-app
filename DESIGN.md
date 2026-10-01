# YC Design System

Source: `~/Downloads/yc-design-system.zip`

Founder Table uses the supplied Y Combinator design system as its sole visual
language. Do not mix these tokens with Alex Tools or another design system.

## Principles

- Every element occupies a functional grid cell.
- Use one loud `yc-orange` area per view.
- Use flat rectangles, circles, and half-circles. No gradients or shadows.
- Use display type sparingly and keep body copy at 68 characters or less.
- Write plainly with short sentences, concrete nouns, and no hype.

## Colors

| Token | Light | Dark | Use |
|---|---|---|---|
| `surface` | `#ffffff` | `#111214` | Page and grid cells |
| `surface-alt` | `#f5f3ee` | `#1a1b1e` | One quiet cell per row |
| `line` | `#e3e5e9` | `#2a2c31` | Grid hairlines |
| `line-strong` | `#7d828b` | `#6e737c` | Control borders |
| `ink` | `#141414` | `#f4f2ee` | Primary text and icons |
| `ink-muted` | `#5b5f66` | `#a3a7ae` | Metadata and captions |
| `yc-orange` | `#f26522` | `#f26522` | Primary block and action |
| `on-orange` | `#141414` | `#111214` | Text on orange |
| `orange-text` | `#b4410b` | `#ff7a3d` | Orange used as text |
| `bauhaus-blue` | `#2f5bea` | `#6b8cff` | Active state and focus |
| `on-blue` | `#ffffff` | `#0b0b0c` | Text on blue |
| `bauhaus-yellow` | `#f2b33d` | `#f2b33d` | Small tertiary accent |

Orange is a fill, not small text on white. Yellow occupies at most one quarter
of the orange area and never touches an orange block directly.

## Type

- Display: `"League Spartan", "Futura", "Avenir Next", system-ui, sans-serif`
- Body: `"Figtree", "Avenir Next", system-ui, sans-serif`
- Display XL: 96px / 0.9 / 800, uppercase
- Display L: 64px / 0.95 / 800, uppercase
- Heading 1: 40px / 1.05 / 800
- Heading 2: 28px / 1.15 / 700
- Eyebrow: 13px / 16px / 700 / `0.12em`, uppercase
- Body large: 19px / 30px / 400
- Body: 16px / 26px / 400
- Body small: 14px / 20px / 400

## Grid and spacing

Spacing scale: `4, 8, 16, 24, 32, 48, 96, 144px`.

The desktop page runs edge-to-edge on a 96px module with 1px hairlines. Use a
96px nav row, narrow numeral and utility columns, and 32px cell padding. Collapse
to one column with 16px gutters on mobile while preserving the hairlines.

## Shape and states

- Radius is zero except pill tags and circular avatars.
- No shadows.
- Controls use a 1px `line-strong` border.
- Active states use a 4px blue or orange bar.
- Focus is 2px blue with a 2px offset.
- Motion is 160ms or 320ms along grid axes and respects reduced motion.

