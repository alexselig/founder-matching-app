# Founder Card Alignment and Callout Stroke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the approved Search Grid prototype so `More` sits left-aligned below the company name, Matched dimensions starts level with the founder name, and the account-callout pointer continues the 4px blue top highlight.

**Architecture:** Preserve the approved V15 prototype and create a V16 review artifact with CSS-only layout changes; do not restructure card markup or alter interaction behavior. Add a focused Playwright geometry check that loads the static prototype and asserts the requested alignment and computed pointer stroke.

**Tech Stack:** Static HTML/CSS/JavaScript prototype, Node.js 22+, Playwright 1.63.

## Global Constraints

- Use the YC Design System in `DESIGN.md` as the sole visual language.
- Preserve zero-radius cards, flat surfaces, existing typography, and existing interaction behavior.
- Use Bauhaus blue `#2f5bea` for the callout top highlight and both exposed pointer edges.
- Preserve `v2-search-grid-founder-header-review-v15.html`; create a new V16 artifact instead of overwriting the approved review.
- Do not change founder data, card disclosure behavior, account switching, search controls, or footer behavior.

---

### Task 1: Refine the Search Grid review artifact

**Files:**
- Create: `.superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v16.html`
- Create: `scripts/check-v2-search-grid-founder-header-v16.mjs`
- Reference: `.superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v15.html`
- Reference: `DESIGN.md`

**Interfaces:**
- Consumes: the V15 static prototype, its existing `.founder-card`, `.identity`, `.more`, `.match-row`, `.matched`, and `.account-callout::before` selectors.
- Produces: a V16 prototype with unchanged HTML interactions and a Node validation script that exits `0` only when all three requested visual invariants hold.

- [ ] **Step 1: Copy the approved prototype to a new review version**

Run:

```bash
cd /Users/alexselig/founder-matching-app
cp .superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v15.html \
  .superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v16.html
```

Expected: V15 remains unchanged and the new V16 file exists with identical contents.

- [ ] **Step 2: Write the failing Playwright geometry check**

Create `scripts/check-v2-search-grid-founder-header-v16.mjs`:

```js
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const prototypePath =
  "/Users/alexselig/founder-matching-app/.superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v16.html";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(pathToFileURL(prototypePath).href);

  const geometry = await page.locator(".founder-card").first().evaluate((card) => {
    const founderName = card.querySelector("h2");
    const company = card.querySelector(".identity p");
    const more = card.querySelector(".more");
    const matchedLabel = card.querySelector(".matched small");

    if (!founderName || !company || !more || !matchedLabel) {
      throw new Error("Founder card is missing required alignment elements");
    }

    const founderRect = founderName.getBoundingClientRect();
    const companyRect = company.getBoundingClientRect();
    const moreRect = more.getBoundingClientRect();
    const matchedRect = matchedLabel.getBoundingClientRect();

    return {
      companyLeft: companyRect.left,
      companyBottom: companyRect.bottom,
      moreLeft: moreRect.left,
      moreTop: moreRect.top,
      founderTop: founderRect.top,
      matchedTop: matchedRect.top,
    };
  });

  assert.ok(
    Math.abs(geometry.moreLeft - geometry.companyLeft) <= 1,
    `More left ${geometry.moreLeft} must align with company left ${geometry.companyLeft}`,
  );
  assert.ok(
    geometry.moreTop >= geometry.companyBottom,
    `More top ${geometry.moreTop} must sit below company bottom ${geometry.companyBottom}`,
  );
  assert.ok(
    Math.abs(geometry.matchedTop - geometry.founderTop) <= 1,
    `Matched dimensions top ${geometry.matchedTop} must align with founder top ${geometry.founderTop}`,
  );

  const pointer = await page.locator(".account-callout").evaluate((callout) => {
    const style = getComputedStyle(callout, "::before");
    return {
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      borderLeftColor: style.borderLeftColor,
      borderLeftWidth: style.borderLeftWidth,
    };
  });

  assert.deepEqual(pointer, {
    borderTopColor: "rgb(47, 91, 234)",
    borderTopWidth: "4px",
    borderLeftColor: "rgb(47, 91, 234)",
    borderLeftWidth: "4px",
  });

  console.log("V16 founder card alignment and callout pointer checks passed");
} finally {
  await browser.close();
}
```

- [ ] **Step 3: Run the check to verify the V15-derived artifact fails**

Run:

```bash
cd /Users/alexselig/founder-matching-app
node scripts/check-v2-search-grid-founder-header-v16.mjs
```

Expected: FAIL on the matched-dimensions top alignment or pointer stroke because the copied V15 CSS still vertically centers `.match-row` and uses a 1px ink pointer outline.

- [ ] **Step 4: Apply the minimal CSS refinement to V16**

In `.superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v16.html`, replace the pointer rule with:

```css
.account-callout::before {
  content: "";
  position: absolute;
  top: -12px;
  right: 22px;
  width: 14px;
  height: 14px;
  border-top: 4px solid var(--blue);
  border-left: 4px solid var(--blue);
  background: #fff;
  transform: rotate(45deg);
}
```

Add an explicit text-column layout after the proposed `.identity` rule:

```css
body.proposed .founder-card .identity > div:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
```

Change the proposed match-row alignment from:

```css
align-self: center;
```

to:

```css
align-self: start;
```

Replace the proposed `More` spacing declarations:

```css
min-height: 44px;
padding: 5px 0 0;
```

with:

```css
min-height: 24px;
margin-top: 6px;
padding: 0;
align-self: flex-start;
```

Expected: `More` shares the company-name left edge and sits directly below it; Matched dimensions starts at the founder-name top; the callout pointer has two 4px blue exposed edges.

- [ ] **Step 5: Run the focused geometry check**

Run:

```bash
cd /Users/alexselig/founder-matching-app
node scripts/check-v2-search-grid-founder-header-v16.mjs
```

Expected:

```text
V16 founder card alignment and callout pointer checks passed
```

- [ ] **Step 6: Run repository validation**

Run:

```bash
cd /Users/alexselig/founder-matching-app
npm test -- --run
npm run lint
```

Expected: Vitest exits successfully with all tests passing, and oxlint exits with no new errors.

- [ ] **Step 7: Commit the review artifact and validation**

Run:

```bash
cd /Users/alexselig/founder-matching-app
git add \
  .superpowers/brainstorm/57405-1790890899/content/v2-search-grid-founder-header-review-v16.html \
  scripts/check-v2-search-grid-founder-header-v16.mjs
git commit -m "style: refine founder card alignment" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 68a8214a-cc83-4029-b61e-430f472a9f9a"
```

Expected: one commit containing only the V16 review artifact and its focused geometry check; existing unrelated working-tree changes remain untouched.
