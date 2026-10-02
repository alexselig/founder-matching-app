# GitHub Feature Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the repository README and showcase screenshots so GitHub accurately presents the current V2 product.

**Architecture:** `README.md` owns the concise public feature tour and uses repository-relative links to stable screenshot filenames. `scripts/capture-showcase.mjs` remains the single screenshot generator and captures all 16 images from the deployed public demo.

**Tech Stack:** GitHub-flavored Markdown, Playwright, PNG

## Global Constraints

- Use the exact heading `## Learn About Features`.
- Regenerate all 16 files in `docs/showcase/images/`.
- Use `SHOWCASE_BASE_URL=https://founder-index-demo.onrender.com`.
- Preserve existing screenshot filenames.
- Use only repository-relative README image links.
- State that the public demo is read-only and uses fictitious founder data.

---

### Task 1: Add the current V2 feature tour to the README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: stable image paths under `docs/showcase/images/`
- Produces: a GitHub-rendered `Learn About Features` section with six linked screenshots

- [ ] **Step 1: Replace the obsolete route list**

Replace `## Views` with:

```markdown
## Product surfaces

- `/v2/search` — schema-wide founder discovery, structured search, and explainable recommendations
- `/v2/seating-plans` — saved seating arrangements, version history, and recovery warnings
- `/v2/dinner` — cohort setup, matching criteria, table optimization, manual edits, analysis, and export
- `/v2/settings/ai` — server-side provider status and credential validation
```

- [ ] **Step 2: Add the feature section after the live demo link**

Add a two-column HTML table under `## Learn About Features`. Use six cells with these image paths and captions:

```markdown
<table>
  <tr>
    <td width="50%">
      <a href="docs/showcase/images/01-search-zero.png"><img src="docs/showcase/images/01-search-zero.png" alt="Founder discovery with explainable zero-query suggestions"></a>
      <strong>Discover founders before typing.</strong><br>
      Start from explainable adjacent, complementary, and cross-domain suggestions.
    </td>
    <td width="50%">
      <a href="docs/showcase/images/02-search-grid.png"><img src="docs/showcase/images/02-search-grid.png" alt="Structured founder search results"></a>
      <strong>Turn natural language into structured search.</strong><br>
      Inspect and edit the dimensions behind every result set.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="docs/showcase/images/06-seating-plans-populated.png"><img src="docs/showcase/images/06-seating-plans-populated.png" alt="Saved seating plans archive"></a>
      <strong>Resume and review saved plans.</strong><br>
      Reopen arrangements, inspect versions, and recover plans that need attention.
    </td>
    <td width="50%">
      <a href="docs/showcase/images/07-dinner-configuration.png"><img src="docs/showcase/images/07-dinner-configuration.png" alt="Dinner setup with dimensions and weights"></a>
      <strong>Configure the matching objective.</strong><br>
      Select a cohort, table shape, dimensions, rules, and weights before optimization.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="docs/showcase/images/09-tables.png"><img src="docs/showcase/images/09-tables.png" alt="Optimized seating tables workspace"></a>
      <strong>Review every seat placement.</strong><br>
      Scan continuous compact tables, thresholds, locks, and below-threshold seats.
    </td>
    <td width="50%">
      <a href="docs/showcase/images/14-web-evidence.png"><img src="docs/showcase/images/14-web-evidence.png" alt="Top web results evidence drawer"></a>
      <strong>Check the evidence behind a profile.</strong><br>
      Open recent web results without leaving the founder workflow.
    </td>
  </tr>
</table>
```

Follow it with:

```markdown
The public demo is read-only and uses fictitious founder data.
```

- [ ] **Step 3: Validate README image targets**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import re

text = Path("README.md").read_text()
paths = re.findall(r'(?:src|href)="(docs/showcase/images/[^"]+)"', text)
missing = sorted({path for path in paths if not Path(path).is_file()})
assert not missing, missing
assert "## Learn About Features" in text
print(f"Validated {len(set(paths))} README image targets")
PY
```

Expected: `Validated 6 README image targets`.

### Task 2: Regenerate the canonical screenshots from production

**Files:**
- Modify: `docs/showcase/images/01-search-zero.png`
- Modify: `docs/showcase/images/02-search-grid.png`
- Modify: `docs/showcase/images/03-search-list.png`
- Modify: `docs/showcase/images/04-search-no-results.png`
- Modify: `docs/showcase/images/05-seating-plans-zero.png`
- Modify: `docs/showcase/images/06-seating-plans-populated.png`
- Modify: `docs/showcase/images/07-dinner-configuration.png`
- Modify: `docs/showcase/images/08-rule-recovery.png`
- Modify: `docs/showcase/images/09-tables.png`
- Modify: `docs/showcase/images/10-analysis.png`
- Modify: `docs/showcase/images/11-alternatives.png`
- Modify: `docs/showcase/images/12-saved-history.png`
- Modify: `docs/showcase/images/13-export.png`
- Modify: `docs/showcase/images/14-web-evidence.png`
- Modify: `docs/showcase/images/15-ai-provider.png`
- Modify: `docs/showcase/images/16-mobile-tables.png`

**Interfaces:**
- Consumes: deployed routes and accessible labels encoded in `scripts/capture-showcase.mjs`
- Produces: 16 current PNG screenshots with stable filenames

- [ ] **Step 1: Capture all screenshots from the live site**

Run:

```bash
SHOWCASE_BASE_URL=https://founder-index-demo.onrender.com node scripts/capture-showcase.mjs
```

Expected: `Captured 16 showcase images in .../docs/showcase/images`.

- [ ] **Step 2: Verify all screenshots are non-empty PNG files**

Run:

```bash
python3 - <<'PY'
from pathlib import Path

images = sorted(Path("docs/showcase/images").glob("*.png"))
assert len(images) == 16, len(images)
for image in images:
    assert image.stat().st_size > 50_000, (image, image.stat().st_size)
    assert image.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", image
print("Validated 16 PNG screenshots")
PY
```

Expected: `Validated 16 PNG screenshots`.

- [ ] **Step 3: Review the changed screenshot set**

Run:

```bash
git status --short docs/showcase/images
```

Expected: the current production changes update Search, Seating Plans, Tables, and evidence screenshots; unchanged files may remain absent from the status output.

### Task 3: Commit and synchronize GitHub

**Files:**
- Modify: `README.md`
- Modify: `docs/showcase/images/*.png`
- Modify: `docs/superpowers/plans/2026-10-02-github-feature-showcase.md`

**Interfaces:**
- Consumes: completed README and screenshot tasks
- Produces: `origin/main` matching local `main`

- [ ] **Step 1: Mark every plan step complete**

Change each checkbox in this plan from `- [ ]` to `- [x]`.

- [ ] **Step 2: Check the final diff**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no whitespace errors; README, this plan, and refreshed PNGs are listed.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/showcase/images docs/superpowers/plans/2026-10-02-github-feature-showcase.md
git commit -m "docs: refresh GitHub feature showcase"
```

- [ ] **Step 4: Push and verify synchronization**

```bash
git push origin main
git fetch origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
git status --short --branch
```

Expected: `main...origin/main` with no ahead/behind marker and no changed files.
