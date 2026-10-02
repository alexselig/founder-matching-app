# GitHub Feature Showcase

## Goal

Make the GitHub repository landing page accurately represent the current V2 product and its latest UI.

## README structure

- Keep the project introduction and live-demo link at the top.
- Replace the obsolete V1-oriented route list with the current V2 routes.
- Add an exact `## Learn About Features` heading.
- Present six concise feature groups in a two-column screenshot table:
  - Founder discovery
  - Structured search
  - Seating plan archive
  - Dinner setup
  - Tables workspace
  - Analysis and evidence
- Link each screenshot to its full-size tracked image.

## Screenshot source

- Regenerate all 16 files in `docs/showcase/images/` from the deployed public demo.
- Use `scripts/capture-showcase.mjs` with `SHOWCASE_BASE_URL=https://founder-index-demo.onrender.com`.
- Preserve the existing filenames so README links, commit history, and future refreshes remain stable.

## Copy

- Describe observable user capabilities, not implementation details.
- Keep each feature caption to one sentence.
- State that the public demo uses fictitious founder data and is read-only.

## Verification

- Confirm all 16 screenshots are regenerated successfully.
- Confirm every README image target exists in Git.
- Confirm the README uses only repository-relative links.
- Confirm local `main` and `origin/main` match after pushing.
