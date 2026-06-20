import type { AnnotatedFinding, Finding } from "@ramp/shared";

/** Extract normalized WCAG criterion numbers (e.g. "1.4.3", "4.1.2"). */
export function extractWcagNumbers(rule: string): string[] {
  const matches = rule.match(/\d+\.\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[^\d.]/g, "")))];
}

export function normalizeWcagRule(rule: string): string {
  return rule.trim().split(/\s+/)[0]?.replace(/[^\d.]/g, "") ?? rule.trim();
}

export function wcagRulesMatch(expected: string, actual: string): boolean {
  const expectedNums = extractWcagNumbers(expected);
  const actualNums = extractWcagNumbers(actual);

  if (expectedNums.length > 0 && actualNums.length > 0) {
    return expectedNums.some((num) => actualNums.includes(num));
  }

  return normalizeWcagRule(expected) === normalizeWcagRule(actual);
}

export function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\\/g, "/");
}

export function pathsMatch(expectedFile: string, sourceFile?: string): boolean {
  if (!sourceFile?.trim()) return false;
  const a = normalizePath(expectedFile);
  const b = normalizePath(sourceFile);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/** Infer sourceFile when the harness omits it but page URL points at a task file. */
export function resolveFindingSourceFile(
  finding: Finding,
  expectedFiles: string[],
  pageUrl?: string,
): string | undefined {
  if (finding.sourceFile?.trim()) return finding.sourceFile.trim();

  const haystack = [finding.page, pageUrl].filter(Boolean).join("\n");
  if (haystack) {
    const byPath = expectedFiles.find((file) => haystack.includes(normalizePath(file)));
    if (byPath) return byPath;
  }

  // Single-file tasks: attribute findings to the only expected file.
  const unique = [...new Set(expectedFiles.map(normalizePath))];
  if (unique.length === 1) return unique[0];

  return undefined;
}

export function enrichFindingForMatch(
  finding: Finding,
  expected: AnnotatedFinding[],
  pageUrl?: string,
): Finding {
  const sourceFile = resolveFindingSourceFile(
    finding,
    expected.map((row) => row.file),
    pageUrl,
  );
  if (!sourceFile || sourceFile === finding.sourceFile) return finding;
  return { ...finding, sourceFile };
}

export function matchFinding(
  expected: AnnotatedFinding,
  finding: Finding,
): boolean {
  return (
    finding.type === expected.type &&
    wcagRulesMatch(expected.wcagRule, finding.wcagRule) &&
    pathsMatch(expected.file, finding.sourceFile)
  );
}

export function gradeDetection(
  expected: AnnotatedFinding[],
  detected: Finding[],
  pageUrl?: string,
): { truePositives: number; recall: number; precision: number } {
  const enriched = detected.map((finding) =>
    enrichFindingForMatch(finding, expected, pageUrl),
  );

  let truePositives = 0;
  const matchedDetected = new Set<string>();

  for (const exp of expected) {
    const hit = enriched.find(
      (finding) =>
        !matchedDetected.has(finding.id) && matchFinding(exp, finding),
    );
    if (hit) {
      truePositives++;
      matchedDetected.add(hit.id);
    }
  }

  const recall = expected.length === 0 ? 0 : truePositives / expected.length;
  const precision =
    detected.length === 0 ? 0 : truePositives / detected.length;

  return { truePositives, recall, precision };
}
