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
