import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AnnotatedFinding, Finding } from "@ramp/shared";
import {
  enrichFindingForMatch,
  gradeDetection,
  matchFinding,
  resolveFindingSourceFile,
  wcagRulesMatch,
} from "./match.js";

describe("wcagRulesMatch", () => {
  it("matches compound harness rules against short expected ids", () => {
    assert.equal(wcagRulesMatch("4.1.2", "1.3.1 Info and Relationships / 4.1.2"), true);
    assert.equal(wcagRulesMatch("1.1.1", "1.1.1 Non-text Content"), true);
    assert.equal(wcagRulesMatch("2.4.1", "1.3.1 Info and Relationships"), false);
  });
});

describe("resolveFindingSourceFile", () => {
  it("infers source file from page URL", () => {
    const finding: Finding = {
      id: "f1",
      runId: "r1",
      type: "missing_form_labels",
      severity: "serious",
      wcagRule: "4.1.2",
      page: "/tmp/repo/bookwyrm/templates/search/layout.html",
      confidence: 0.9,
      autoFixable: true,
    };
    assert.equal(
      resolveFindingSourceFile(finding, ["bookwyrm/templates/search/layout.html"]),
      "bookwyrm/templates/search/layout.html",
    );
  });
});

describe("matchFinding", () => {
  const expected: AnnotatedFinding = {
    type: "missing_form_labels",
    wcagRule: "4.1.2",
    file: "bookwyrm/templates/search/layout.html",
    expectedFix: "fix",
  };

  it("matches harness finding after sourceFile inference", () => {
    const raw: Finding = {
      id: "f1",
      runId: "r1",
      type: "missing_form_labels",
      severity: "serious",
      wcagRule: "4.1.2 Name, Role, Value",
      page: "/tmp/bookwyrm/templates/search/layout.html",
      confidence: 0.9,
      autoFixable: true,
    };
    const enriched = enrichFindingForMatch(raw, [expected]);
    assert.equal(matchFinding(expected, enriched), true);
  });
});

describe("gradeDetection", () => {
  it("counts a harness near-miss as a true positive after enrichment", () => {
    const expected: AnnotatedFinding[] = [
      {
        type: "missing_form_labels",
        wcagRule: "4.1.2",
        file: "bookwyrm/templates/search/layout.html",
        expectedFix: "fix",
      },
    ];
    const detected: Finding[] = [
      {
        id: "f1",
        runId: "r1",
        type: "missing_form_labels",
        severity: "serious",
        wcagRule: "4.1.2 Name, Role, Value",
        page: "/var/bookwyrm/templates/search/layout.html",
        confidence: 0.9,
        autoFixable: true,
      },
    ];
    const grade = gradeDetection(expected, detected);
    assert.equal(grade.truePositives, 1);
    assert.equal(grade.recall, 1);
  });
});
