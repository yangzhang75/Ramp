# Ramp Skill

## Skill Name

**Ramp**

## Tagline

**Turn accessibility reports into merge-ready pull requests.**

## One-Line Description

Ramp is an AI accessibility repair skill that audits a frontend repository or website for WCAG accessibility issues, scores compliance, generates safe code fixes, validates improvements, and prepares a merge-ready pull request.

---

## Purpose

Ramp helps developers make websites more accessible by closing the gap between accessibility detection and accessibility repair.

Existing tools such as Lighthouse and axe can identify accessibility violations, but they usually stop at reporting. Developers still need to understand WCAG rules, locate the correct component, decide the right fix, edit the code, and validate that the issue is actually resolved.

Ramp is designed to complete the full loop:

**Detect → Score → Fix → Validate → Pull Request**

The final artifact should not just be a report. The final artifact should be a reviewable, merge-ready pull request.

---

## Problem Context

Many websites are still difficult or impossible to use for people who are blind, have low vision, rely on screen readers, navigate with keyboards instead of a mouse, or have motor impairments.

Web accessibility is guided by WCAG, the Web Content Accessibility Guidelines. WCAG defines whether a website provides accessible names, labels, keyboard navigation, sufficient color contrast, semantic structure, and screen-reader-friendly content.

Common accessibility failures include:

* Images without alternative text
* Icon buttons without accessible names
* Form inputs without associated labels
* Low color contrast
* Incorrect heading hierarchy
* Missing landmarks such as `main`, `nav`, and `footer`
* Missing focus indicators
* Components that cannot be used with only a keyboard
* Poor screen reader structure

Ramp should act like an accessibility engineer inside an AI agent workflow. Its job is not only to explain problems, but to generate verified code changes that developers can review and merge.

---

## When to Use This Skill

Use Ramp when the user asks to:

* Audit a website for accessibility issues.
* Improve WCAG compliance in a frontend repository.
* Fix accessibility issues found by Lighthouse, axe, or manual review.
* Generate accessibility-related code patches.
* Create a pull request for accessibility improvements.
* Compare accessibility compliance before and after fixes.
* Repair common accessibility issues in React, Next.js, Vue, or HTML projects.

Example user requests:

```text
Audit this React repo for accessibility issues and fix what you can.
```

```text
Run an accessibility scan on this website and generate a PR for common WCAG violations.
```

```text
Improve the accessibility score of this frontend project.
```

```text
Find missing labels, missing alt text, and contrast issues in this app.
```

```text
Create a pull request that fixes high-confidence accessibility bugs.
```

---

## Inputs

Ramp accepts either a repository, a deployed URL, or both.

```json
{
  "repo_url": "https://github.com/example/frontend-app",
  "branch": "main",
  "target_url": "http://localhost:3000",
  "framework": "react",
  "package_manager": "npm",
  "fix_scope": [
    "missing_alt_text",
    "missing_form_labels",
    "icon_button_accessible_names",
    "low_color_contrast",
    "heading_structure",
    "missing_landmarks"
  ],
  "create_pull_request": true,
  "safe_mode": true
}
```

### Required Inputs

At least one of the following:

* `repo_url`
* local repository path
* deployed `target_url`

For automatic code repair, a repository is required.

### Optional Inputs

* `branch`
* `framework`
* `package_manager`
* `target_url`
* `fix_scope`
* `create_pull_request`
* `max_fix_attempts`
* `safe_mode`
* `test_command`
* `lint_command`
* `build_command`

---

## Outputs

Ramp should return a structured report.

```json
{
  "status": "completed",
  "before_score": 52,
  "after_score": 86,
  "violations_before": 14,
  "violations_after": 4,
  "fixed_issues": [
    {
      "type": "missing_form_label",
      "severity": "serious",
      "wcag_rule": "1.3.1 Info and Relationships",
      "file": "src/components/LoginForm.tsx",
      "fix": "Added visible label connected with htmlFor/id"
    },
    {
      "type": "icon_button_accessible_name",
      "severity": "serious",
      "wcag_rule": "4.1.2 Name, Role, Value",
      "file": "src/components/Navbar.tsx",
      "fix": "Added aria-label to icon-only navigation button"
    }
  ],
  "remaining_issues": [
    {
      "type": "keyboard_navigation",
      "reason": "Requires human review because interaction behavior is ambiguous"
    }
  ],
  "validation": {
    "axe_scan": "passed_with_remaining_issues",
    "build": "passed",
    "lint": "passed",
    "tests": "not_available"
  },
  "pull_request_url": "https://github.com/example/frontend-app/pull/12"
}
```

---

## Core Workflow

### Step 1: Repository Setup

Clone or open the repository.

Inspect project structure:

* `package.json`
* framework type: React, Next.js, Vue, Svelte, or plain HTML
* package manager: npm, pnpm, yarn, or bun
* available scripts: `dev`, `build`, `test`, `lint`
* source folders: `src/`, `app/`, `pages/`, `components/`, or `public/`

If the repository cannot be installed or run, Ramp should stop and return a setup failure report.

Example failure:

```json
{
  "status": "setup_failed",
  "reason": "npm install failed due to dependency conflict",
  "next_step": "Try running with --legacy-peer-deps or provide a working lockfile"
}
```

Ramp should not make code changes if the project cannot be safely inspected.

---

### Step 2: Start the App

Start the frontend locally when possible.

Preferred commands:

```bash
npm install
npm run dev
```

Fallback commands:

```bash
npm run build
npm run preview
```

If the user provides custom commands, use those commands.

Ramp should wait until the app is reachable at the target URL before scanning.

---

### Step 3: Accessibility Audit

Run an accessibility scan using browser automation and accessibility testing tools.

Recommended tools:

* Playwright for page loading and interaction
* axe-core for accessibility violations
* DOM snapshot extraction
* screenshot capture
* color contrast checker
* keyboard navigation simulation
* static code search for source mapping

The audit should produce:

* violation type
* severity
* affected DOM node
* WCAG rule
* screenshot or DOM evidence
* likely source file
* confidence score
* whether the issue is automatically fixable

Example issue record:

```json
{
  "id": "button-name",
  "type": "icon_button_accessible_name",
  "severity": "serious",
  "wcag_rule": "4.1.2 Name, Role, Value",
  "dom_node": "<button class='search-btn'><svg /></button>",
  "page": "/dashboard",
  "source_file": "src/components/SearchButton.tsx",
  "confidence": 0.87,
  "auto_fixable": true
}
```

---

### Step 4: Accessibility Score

Calculate a before-fix accessibility score.

Suggested scoring model:

```text
score = max(0, 100 - weighted_violation_penalty)
```

Suggested severity weights:

```text
critical: -12
serious: -8
moderate: -4
minor: -2
```

Example score summary:

```text
Before score: 52/100
Critical issues: 3
Serious issues: 5
Moderate issues: 4
Minor issues: 2
```

The score should be used for comparison, not as a claim of full WCAG compliance.

---

### Step 5: Fix Planning

Group violations into fixable categories.

For the MVP, prioritize high-confidence and automatically verifiable issues:

1. Missing `alt` text on images
2. Missing labels for form inputs
3. Icon buttons without accessible names
4. Low color contrast
5. Incorrect heading hierarchy
6. Missing landmarks
7. Missing focus indicators

For each issue, generate a repair plan.

Example:

```json
{
  "issue": "Input element has no accessible label",
  "file": "src/components/LoginForm.tsx",
  "repair_strategy": "Add a visible label connected with htmlFor/id",
  "risk": "low",
  "requires_human_review": false
}
```

Ramp should avoid fixing issues where the correct repair requires unclear product or design intent.

---

### Step 6: Code Modification

Apply minimal, reviewable code changes.

General repair principles:

* Prefer semantic HTML over ARIA when possible.
* Prefer visible labels over hidden labels when appropriate.
* Do not use ARIA to cover up poor semantics.
* Preserve existing behavior.
* Preserve existing styling as much as possible.
* Keep fixes small and localized.
* Avoid broad refactors.
* Do not claim full compliance unless validation supports it.

Example repairs:

```tsx
// Before
<input type="email" placeholder="Email" />

// After
<label htmlFor="email">Email</label>
<input id="email" type="email" placeholder="Email" />
```

```tsx
// Before
<button>
  <SearchIcon />
</button>

// After
<button aria-label="Search">
  <SearchIcon />
</button>
```

```tsx
// Before
<img src="/hero.png" />

// After
<img src="/hero.png" alt="Dashboard preview showing project analytics" />
```

```tsx
// Before
<div className="page">
  <Header />
  <Content />
</div>

// After
<div className="page">
  <Header />
  <main>
    <Content />
  </main>
</div>
```

---

### Step 7: Validation Loop

After applying fixes, rerun validation.

Validation should include:

* axe-core scan
* page smoke test
* build command
* lint command, if available
* test command, if available
* keyboard navigation smoke test, if relevant

Ramp should compare before and after results.

Example validation result:

```text
Accessibility score improved from 52 to 86.
axe violations reduced from 14 to 4.
Build passed.
Lint passed.
No runtime page crash detected.
```

If a fix causes build failure or page failure, Ramp should revert the risky change and mark that issue as requiring human review.

---

### Step 8: Pull Request Generation

If `create_pull_request` is true, create a branch and prepare a pull request.

Suggested branch name:

```text
ramp/a11y-repair
```

Suggested PR title:

```text
Improve accessibility compliance with verified WCAG fixes
```

Suggested PR body:

```markdown
## Summary

Ramp improved the accessibility score from 52/100 to 86/100.

## Fixed Issues

- Added accessible names to icon-only buttons
- Added labels to form inputs
- Added descriptive alt text to images
- Improved contrast for low-visibility text
- Corrected heading hierarchy
- Added missing semantic landmarks

## Validation

- axe violations reduced from 14 to 4
- Build passed
- Lint passed
- Manual smoke test completed

## Remaining Issues

Some issues require human design review, including complex keyboard navigation and ambiguous image descriptions.

## Notes

This PR focuses on high-confidence accessibility fixes. It does not claim complete WCAG compliance.
```

The PR should include enough evidence for a developer to review quickly.

---

## Agent Harness Behavior

Ramp should behave like an accessibility engineer, not a generic code assistant.

Before editing code, Ramp must:

1. Read the WCAG rule connected to the violation.
2. Inspect the affected DOM node.
3. Locate the likely source component.
4. Choose the smallest safe fix.
5. Apply the patch.
6. Re-run validation.
7. Report before and after results.

Ramp should use structured evidence instead of guessing.

---

## Safe Fix Rules

Ramp may automatically fix:

* Missing `alt` attributes when image purpose is clear
* Empty `alt=""` for clearly decorative images
* Missing form labels when placeholder or nearby text provides label intent
* Missing `aria-label` for icon buttons when icon purpose is clear
* Missing semantic landmarks
* Simple heading order issues
* Simple color contrast issues when design impact is low
* Missing focus style when style system is clear

Ramp should require human review for:

* Ambiguous image descriptions
* Complex keyboard interaction patterns
* Focus traps in modals or custom widgets
* Major layout changes
* Product-sensitive wording
* Design system changes that affect many components
* Cases where the accessible name cannot be inferred confidently

Example human review output:

```json
{
  "status": "needs_human_review",
  "issue": "ambiguous_image_alt_text",
  "reason": "Image content is ambiguous and cannot be safely described from context",
  "suggested_review_question": "What information should this image communicate to screen reader users?"
}
```

---

## Common WCAG Mapping

Ramp should connect issues to relevant WCAG rules when possible.

Examples:

| Issue                          | WCAG Rule                    |
| ------------------------------ | ---------------------------- |
| Missing image alt text         | 1.1.1 Non-text Content       |
| Missing form label             | 1.3.1 Info and Relationships |
| Low color contrast             | 1.4.3 Contrast Minimum       |
| Keyboard inaccessible control  | 2.1.1 Keyboard               |
| Missing focus indicator        | 2.4.7 Focus Visible          |
| Incorrect heading order        | 2.4.6 Headings and Labels    |
| Button missing accessible name | 4.1.2 Name, Role, Value      |

---

## MVP Scope

For the hackathon MVP, Ramp should support:

* React or Next.js frontend repositories
* Local app scanning using Playwright and axe-core
* 3 to 5 common accessibility issue types
* Before and after accessibility score
* Code patch generation
* Validation after repair
* GitHub PR creation or simulated PR diff
* Dashboard showing issue list, severity, score improvement, and PR summary

MVP issue types:

1. Missing image alt text
2. Missing form labels
3. Icon buttons without accessible names
4. Low contrast text or buttons
5. Missing landmarks or heading issues

The MVP does not need to fix every WCAG issue. It should focus on common, high-impact, automatically verifiable problems.

---

## Non-Goals

Ramp should not:

* Claim complete WCAG compliance from automated checks alone.
* Replace manual accessibility audits.
* Automatically make high-risk design decisions.
* Rewrite the entire frontend.
* Break existing behavior to satisfy a scanner.
* Add meaningless labels such as `aria-label="button"`.
* Hide important content from users.
* Treat accessibility as only a score.

---

## Demo Flow

A recommended hackathon demo:

1. Open a sample React app with intentional accessibility issues.
2. Run Ramp on the repository.
3. Show before score, such as `45/100`.
4. Show detected violations:

   * Missing labels
   * Missing alt text
   * Icon buttons without accessible names
   * Low contrast CTA
   * Missing `main` landmark
5. Click **Generate Fix PR**.
6. Ramp applies code changes.
7. Ramp reruns the audit.
8. Show after score, such as `86/100`.
9. Show reduced violations.
10. Open the generated PR or simulated PR diff.

The key demo moment:

```text
Before: accessibility report with violations.
After: merge-ready pull request with verified fixes.
```

---

## Example PR Summary

```markdown
# Improve accessibility compliance with Ramp

## Before

Accessibility score: 45/100  
axe violations: 15

## After

Accessibility score: 86/100  
axe violations: 4

## Fixes Included

- Added alt text to 5 informative images
- Added empty alt text to 2 decorative images
- Added labels to 3 form inputs
- Added accessible names to 4 icon buttons
- Added a main landmark to the dashboard page
- Improved contrast for the primary CTA

## Validation

- Build passed
- Lint passed
- axe scan rerun successfully
- No page crash detected

## Remaining Work

Some remaining issues require human review, including complex keyboard behavior and ambiguous image descriptions.
```

---

## Evaluation Metrics

Ramp should be evaluated using measurable outcomes:

* Accessibility score before and after
* Number of violations before and after
* Percentage reduction in critical and serious violations
* Number of successful automatic fixes
* Number of fixes requiring human review
* Build/lint/test pass rate after modifications
* Comparison of raw model vs Ramp harness performance

Example benchmark comparison:

```text
Raw LLM:
Detected 6/15 issues
Fixed 3/15 issues
Final score: 61/100

Ramp Harness:
Detected 13/15 issues
Fixed 10/15 issues
Final score: 86/100
```

---

## Pitch

Ramp builds digital curb cuts for the web.

Accessibility tools already tell developers what is broken, but reports do not make websites usable. Ramp closes the loop by auditing a frontend repo, scoring WCAG compliance, generating safe code fixes, validating the result, and opening a merge-ready pull request.

We do not just report accessibility problems.

We submit fixes.
