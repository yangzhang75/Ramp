import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAuditContext, collectSourceBundles } from "./audit-context.js";

describe("buildAuditContext", () => {
  it("builds a composite rendered page for jsx sources instead of escaped pre", () => {
    const bundles = [
      {
        path: "src/components/DoubtCard.tsx",
        content: `<img src="/logo.png" />\n<button aria-label="close"><svg /></button>`,
      },
    ];
    const context = buildAuditContext({ id: "ramp-test" }, "/tmp/repo", bundles);
    assert.match(context.targetUrl, /ramp-score-page-ramp-test/);
    assert.match(context.hints, /FILE: src\/components\/DoubtCard.tsx/);
    assert.doesNotMatch(context.hints, /&lt;img/);
    assert.match(context.hints, /<img src="\/logo.png"/);
  });

  it("uses direct html file when task has a single html bundle", () => {
    const bundles = [
      {
        path: "examples/page.html",
        content: "<html><body><main><button id='go'></button></main></body></html>",
      },
    ];
    const context = buildAuditContext({ id: "ramp-html" }, "/tmp/repo", bundles);
    assert.equal(context.targetUrl, "/tmp/repo/examples/page.html");
    assert.equal(context.cleanupPaths.length, 0);
  });

  it("combines multiple html files into one composite page", () => {
    const bundles = [
      { path: "a.html", content: "<html><body><button id='a'></button></body></html>" },
      { path: "b.html", content: "<html><body><button id='b'></button></body></html>" },
    ];
    const context = buildAuditContext({ id: "ramp-multi" }, "/tmp/repo", bundles);
    assert.match(context.targetUrl, /ramp-score-page-ramp-multi/);
    assert.match(context.hints, /FILE: a.html/);
    assert.match(context.hints, /FILE: b.html/);
  });
});

describe("collectSourceBundles", () => {
  it("deduplicates expected files", () => {
    const bundles = collectSourceBundles(
      [
        { type: "missing_alt_text", wcagRule: "1.1.1", file: "a.tsx", expectedFix: "x" },
        { type: "missing_alt_text", wcagRule: "1.1.1", file: "a.tsx", expectedFix: "y" },
      ],
      "/repo",
      (_repo, file) => `content:${file}`,
    );
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0]!.path, "a.tsx");
  });
});
