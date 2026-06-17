/**
 * test:pr — end-to-end self-check of the PR pipeline.
 *
 * Runs preflight (token + permission), then opens a real dummy PR so we know
 * openPr() works before wiring it into the fix loop.
 *
 * Requires GITHUB_TOKEN and GITHUB_TARGET_REPO in the environment.
 */
import { openPr, preflight } from "../github.js";

async function main(): Promise<void> {
  console.log("=== Ramp PR pipeline self-check ===");

  const pf = await preflight();
  console.log(`GITHUB_TOKEN present : ${pf.tokenPresent}`);
  console.log(`Target repo          : ${pf.repo}`);
  console.log(`Default branch       : ${pf.defaultBranch ?? "(unknown)"}`);
  console.log(`Push/PR permission   : ${pf.canPush ?? "(unknown)"}`);

  if (!pf.ok) {
    console.error(`\n[BLOCKED] ${pf.reason}`);
    process.exit(1);
  }
  console.log("Preflight OK — opening test PR...\n");

  const ts = Date.now();
  const branch = `ramp/test-pr-${ts}`;
  const newContent =
    `# Ramp PR pipeline test\n\n` +
    `Generated at ${new Date(ts).toISOString()} by \`pnpm test:pr\`.\n\n` +
    `This file exists only to verify that \`openPr()\` can create a branch, ` +
    `commit a file, and open a pull request. Safe to close and delete.\n`;

  const url = await openPr({
    branch,
    filePath: "ramp-test.md",
    newContent,
    title: "[ramp] PR pipeline test",
    body:
      "Automated self-check of Ramp's `openPr()` pipeline " +
      `(branch \`${branch}\`). Safe to close.`,
  });

  console.log(`PR_URL: ${url}`);
}

main().catch((e: unknown) => {
  console.error("test:pr failed:", e);
  process.exit(1);
});
