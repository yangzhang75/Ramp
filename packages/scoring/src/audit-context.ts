import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AnnotatedFinding, BenchTask } from "@ramp/shared";

export interface SourceBundle {
  path: string;
  content: string;
}

export interface AuditContext {
  targetUrl: string;
  hints: string;
  cleanupPaths: string[];
}

const JSX_TAG =
  /<(img|button|input|select|textarea|label|main|nav|header|footer|form|a|h[1-6]|svg)\b[\s\S]*?\/?>/gi;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function jsxTagToHtml(tag: string): string {
  return tag
    .replace(/\bclassName=/g, "class=")
    .replace(/\bhtmlFor=/g, "for=")
    .replace(/=\{`[^`]*`\}/g, '=""')
    .replace(/=\{[^}]*\}/g, '=""');
}

function extractJsxMarkup(content: string): string {
  const tags = [...content.matchAll(JSX_TAG)].map((match) =>
    jsxTagToHtml(match[0]!),
  );
  return tags.length > 0 ? tags.join("\n") : "";
}

function extractHtmlBody(content: string): string {
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1]! : content;
}

function renderBundleMarkup(bundle: SourceBundle): string {
  const { path, content } = bundle;

  if (path.endsWith(".html") || path.endsWith(".htm")) {
    return extractHtmlBody(content);
  }

  if (path.endsWith(".css")) {
    return `
<style data-source-file="${path}">
/* ${path} */
${content}
</style>
<button type="button" class="ramp-focus-probe">Focus probe</button>
<p class="ramp-text-probe">Sample text for contrast</p>
<a href="#" class="ramp-link-probe">Sample link</a>
<input type="text" placeholder="Email" aria-label="" />
<button type="button"><svg width="16" height="16" aria-hidden="true"></svg></button>`;
  }

  const jsxMarkup = extractJsxMarkup(content);
  if (jsxMarkup) return jsxMarkup;

  return `<pre>${escapeHtml(content)}</pre>`;
}

function writeTempHtml(taskId: string, body: string, head = ""): string {
  const path = join(tmpdir(), `ramp-score-page-${taskId}-${randomUUID()}.html`);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  ${head}
</head>
<body>
${body}
</body>
</html>`;
  writeFileSync(path, html, "utf8");
  return path;
}

function shouldUseDirectHtmlFile(bundles: SourceBundle[]): boolean {
  return bundles.length === 1 && bundles[0]!.path.endsWith(".html");
}

export function collectSourceBundles(
  expectedFindings: AnnotatedFinding[],
  repoPath: string,
  readFile: (repoPath: string, file: string, line?: number) => string,
): SourceBundle[] {
  const seen = new Set<string>();
  const bundles: SourceBundle[] = [];

  for (const finding of expectedFindings) {
    if (seen.has(finding.file)) continue;
    seen.add(finding.file);
    bundles.push({
      path: finding.file,
      content: readFile(repoPath, finding.file, finding.line),
    });
  }
  return bundles;
}

export function buildAuditContext(
  task: Pick<BenchTask, "id">,
  repoPath: string,
  bundles: SourceBundle[],
): AuditContext {
  const cleanupPaths: string[] = [];

  let targetUrl: string;
  if (shouldUseDirectHtmlFile(bundles)) {
    targetUrl = resolve(repoPath, bundles[0]!.path);
  } else {
    const body = bundles
      .map(
        (bundle) =>
          `<section data-source-file="${bundle.path}">\n${renderBundleMarkup(bundle)}\n</section>`,
      )
      .join("\n");
    const tempHtml = writeTempHtml(task.id, body || "<p>Benchmark audit page</p>");
    cleanupPaths.push(tempHtml);
    targetUrl = tempHtml;
  }

  const hints =
    `Benchmark task ${task.id}. When calling submit_finding, set sourceFile to the exact repo-relative path ` +
    `(use data-source-file on the nearest section when auditing the composite page).\n` +
    bundles.map((bundle) => `FILE: ${bundle.path}\n${bundle.content}`).join("\n\n");

  return { targetUrl, hints, cleanupPaths };
}

export function readSourceWindow(
  repoPath: string,
  file: string,
  line?: number,
): string {
  const fullPath = join(repoPath, file);
  if (!existsSync(fullPath)) {
    return `(missing file: ${file})`;
  }
  const content = readFileSync(fullPath, "utf8");
  if (!line) return content;
  const lines = content.split("\n");
  const start = Math.max(0, line - 25);
  const end = Math.min(lines.length, line + 25);
  return lines.slice(start, end).join("\n");
}
