/**
 * End-to-end integration tests for `runInit` (Phase 7, Plan 04).
 *
 * Drives the orchestrator directly with a `cwd` override into a per-test
 * temp directory created via `mkdtemp` and torn down via
 * `rm({recursive:true, force:true})`. No CLI spawning — these tests assert
 * the runInit contract, not the cli.ts wiring (that is Plan 05's smoke
 * test).
 *
 * Coverage map (9 of 14 INIT requirements end-to-end here; the rest are
 * covered by Wave 1 unit tests and Plan 05):
 *   INIT-01 — default --init creates CLAUDE.md with markers, exit 0, stdout empty
 *   INIT-05 — multi-target run auto-creates nested directories
 *   INIT-04 — idempotency: two runs → byte-identical second-run bytes + zero writes
 *   INIT-04 — version replacement: stale version → update; bytes outside marker preserved
 *   INIT-07 — hand-edit guard: tampered body → skip + exit 1; --force overwrites
 *   INIT-09 — CRLF+BOM round-trip → byte-identical run-2 output, no \r\r\n
 *   INIT-10 — dry-run writes zero bytes to disk
 *   INIT-11 — stdout invariant (zero stdout writes across every scenario)
 *   INIT-13 — non-interactive (input-stream listener count unchanged across run)
 *   INIT-14 — cursor frontmatter present + byte-preserved across an update
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { runInit } from "../../src/init/index.js";

function sha256(buf: Buffer | string): string {
  const data = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return createHash("sha256").update(data).digest("hex");
}

describe("runInit integration (Phase 7, Plan 04)", () => {
  let tmpDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrText = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "init-int-"));
    stderrText = "";
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: unknown) => {
        stderrText += typeof chunk === "string" ? chunk : String(chunk);
        return true;
      });
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(async () => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("INIT-01: --init default target creates CLAUDE.md with markers; exit 0; stdout empty", async () => {
    const code = await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );

    expect(code).toBe(0);

    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf8");
    expect(content).toContain("<!-- ui-hierarchy-mcp:start");
    expect(content).toContain("<!-- ui-hierarchy-mcp:end -->");

    // INIT-11 — stdout invariant
    expect(stdoutSpy.mock.calls.length).toBe(0);

    // stderr emitted one [init] create CLAUDE.md line.
    expect(stderrText).toMatch(/\[init\] create .*CLAUDE\.md/);
  });

  it("INIT-05: --target with all four ids auto-creates .cursor/rules/ and .github/", async () => {
    const code = await runInit(
      {
        targets: ["claude", "codex", "cursor", "copilot"],
        dryRun: false,
        force: false,
      },
      { cwd: tmpDir },
    );

    expect(code).toBe(0);

    // All four files exist at their canonical paths.
    await expect(readFile(join(tmpDir, "CLAUDE.md"), "utf8")).resolves.toContain(
      "<!-- ui-hierarchy-mcp:start",
    );
    await expect(readFile(join(tmpDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "<!-- ui-hierarchy-mcp:start",
    );
    await expect(
      readFile(join(tmpDir, ".cursor", "rules", "ui-hierarchy-mcp.mdc"), "utf8"),
    ).resolves.toContain("<!-- ui-hierarchy-mcp:start");
    await expect(
      readFile(join(tmpDir, ".github", "copilot-instructions.md"), "utf8"),
    ).resolves.toContain("<!-- ui-hierarchy-mcp:start");

    // INIT-11 — stdout invariant across this multi-target run.
    expect(stdoutSpy.mock.calls.length).toBe(0);
  });

  it("INIT-04 idempotency (regression test for fingerprint-preimage BLOCKER): two consecutive runs produce SHA-256-identical bytes and the second run performs zero writes", async () => {
    const flags = { targets: ["claude"] as const, dryRun: false, force: false };

    // Run 1 — create.
    const code1 = await runInit(
      { ...flags, targets: [...flags.targets] },
      { cwd: tmpDir },
    );
    expect(code1).toBe(0);
    const bytes1 = await readFile(join(tmpDir, "CLAUDE.md"));
    const hash1 = sha256(bytes1);

    // Reset stderr capture so we can isolate run-2's emissions.
    stderrText = "";

    // Run 2 — must be a noop. The presence of the explicit `noop` token is
    // the regression test for the fingerprint-preimage BLOCKER fixed in
    // revision 2: if `scan.body !== renderGuide(...)` byte-for-byte after
    // round-trip, verifyFingerprint would fail and run 2 would emit either
    // `update` (version match path collapses to update) or `skip`
    // (fingerprint mismatch path). Both are wrong.
    const code2 = await runInit(
      { ...flags, targets: [...flags.targets] },
      { cwd: tmpDir },
    );
    expect(code2).toBe(0);
    const bytes2 = await readFile(join(tmpDir, "CLAUDE.md"));
    const hash2 = sha256(bytes2);

    expect(hash2).toBe(hash1);
    expect(stderrText).toMatch(/\[init\] noop /);
    expect(stderrText).not.toMatch(/\[init\] (create|update|skip) /);
  });

  it("INIT-04 version replacement: stale-version marker is rewritten while pre-marker prose is preserved byte-for-byte", async () => {
    // Pre-write CLAUDE.md with a stale-version marker block. The fingerprint
    // we embed is the SHA-256 of the body string we use — so on first scan,
    // verifyFingerprint passes (body intact) but version mismatch triggers
    // the update branch. Result: orchestrator REPLACES the block.
    const prefix = "# Notes\n\nSome user prose here.\n\n";
    const staleBody = "old guide body placeholder\n";
    const staleFp = createHash("sha256").update(staleBody, "utf8").digest("hex");
    const staleBlock = `<!-- ui-hierarchy-mcp:start version=v9.9 fingerprint=${staleFp} -->\n${staleBody}\n<!-- ui-hierarchy-mcp:end -->`;
    const seeded = prefix + staleBlock + "\n";
    await writeFile(join(tmpDir, "CLAUDE.md"), seeded, "utf8");

    const prefixHash = sha256(prefix);

    const code = await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    expect(code).toBe(0);

    const after = await readFile(join(tmpDir, "CLAUDE.md"), "utf8");
    // Version was replaced.
    expect(after).toContain("version=0.0-test");
    expect(after).not.toContain("version=v9.9");

    // Pre-marker prose preserved byte-for-byte.
    const markerStartIdx = after.indexOf("<!-- ui-hierarchy-mcp:start");
    const preservedPrefix = after.slice(0, markerStartIdx);
    expect(sha256(preservedPrefix)).toBe(prefixHash);

    // Stderr says update.
    expect(stderrText).toMatch(/\[init\] update /);
  });

  it("INIT-07 hand-edit guard: tampered body triggers skip (exit 1); --force overwrites and subsequent run is noop", async () => {
    // Seed.
    await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    const seeded = await readFile(join(tmpDir, "CLAUDE.md"), "utf8");

    // Tamper: replace one body byte without rewriting the fingerprint.
    expect(seeded).toContain("get_full_hierarchy");
    const tampered = seeded.replace(
      "get_full_hierarchy",
      "get_full_hierarchyX",
    );
    expect(tampered).not.toBe(seeded);
    await writeFile(join(tmpDir, "CLAUDE.md"), tampered, "utf8");
    const tamperedHash = sha256(await readFile(join(tmpDir, "CLAUDE.md")));

    // Run without --force → skip + exit 1, file unchanged.
    stderrText = "";
    const codeSkip = await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    expect(codeSkip).toBe(1);
    expect(stderrText).toMatch(/\[init\] skip \(hand-edit\) /);
    expect(sha256(await readFile(join(tmpDir, "CLAUDE.md")))).toBe(tamperedHash);

    // Run with --force → overwrite, exit 0.
    stderrText = "";
    const codeForce = await runInit(
      { targets: ["claude"], dryRun: false, force: true },
      { cwd: tmpDir },
    );
    expect(codeForce).toBe(0);
    expect(stderrText).toMatch(/\[init\] update /);
    const forcedHash = sha256(await readFile(join(tmpDir, "CLAUDE.md")));
    expect(forcedHash).not.toBe(tamperedHash);

    // Subsequent plain run → noop (proves --force re-anchored the fingerprint).
    stderrText = "";
    const codeNoop = await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    expect(codeNoop).toBe(0);
    expect(stderrText).toMatch(/\[init\] noop /);
  });

  it("INIT-09 CRLF+BOM idempotency: re-running on a CRLF+BOM seed produces byte-identical output on run 2 and contains no \\r\\r\\n", async () => {
    const seed = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("# Notes\r\nSome existing content here.\r\n", "utf8"),
    ]);
    await writeFile(join(tmpDir, "CLAUDE.md"), seed);

    // Run 1 — appends marker block, preserves CRLF + BOM.
    await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    const bytes1 = await readFile(join(tmpDir, "CLAUDE.md"));

    // BOM and CRLF preserved.
    expect(bytes1[0]).toBe(0xef);
    expect(bytes1[1]).toBe(0xbb);
    expect(bytes1[2]).toBe(0xbf);
    expect(bytes1.toString("utf8")).toContain("\r\n");

    // Anti-pitfall: no \r\r\n anywhere (RESEARCH Pitfall 1 / T-07-08).
    expect(bytes1.toString("utf8")).not.toContain("\r\r\n");

    // Run 2 — must be byte-identical (noop path under matching version/fingerprint).
    await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    const bytes2 = await readFile(join(tmpDir, "CLAUDE.md"));
    expect(sha256(bytes2)).toBe(sha256(bytes1));
  });

  it("INIT-10 dry-run writes zero bytes to disk and emits 'would' stderr lines", async () => {
    const code = await runInit(
      { targets: ["claude", "codex"], dryRun: true, force: false },
      { cwd: tmpDir },
    );
    expect(code).toBe(0);

    // Nothing on disk.
    const entries = await readdir(tmpDir);
    expect(entries).toEqual([]);

    // Two "would " stderr lines.
    const wouldLines = stderrText
      .split("\n")
      .filter((l) => /^\[init\] would /.test(l));
    expect(wouldLines.length).toBeGreaterThanOrEqual(2);
    expect(stderrText).toMatch(/\[init\] would create /);
  });

  it("INIT-11 stdout invariant: zero stdout writes across multiple scenario calls", async () => {
    // Scenario 1: dry-run.
    await runInit(
      { targets: ["claude"], dryRun: true, force: false },
      { cwd: tmpDir },
    );
    // Scenario 2: live multi-target.
    await runInit(
      {
        targets: ["claude", "codex", "cursor", "copilot"],
        dryRun: false,
        force: false,
      },
      { cwd: tmpDir },
    );
    // Scenario 3: idempotent re-run.
    await runInit(
      { targets: ["claude"], dryRun: false, force: false },
      { cwd: tmpDir },
    );

    expect(stdoutSpy.mock.calls.length).toBe(0);
  });

  it("INIT-13 non-interactive: no input-stream data listeners added during runInit", async () => {
    const before = process.stdin.listenerCount("data");
    await runInit(
      {
        targets: ["claude", "codex", "cursor", "copilot"],
        dryRun: false,
        force: false,
      },
      { cwd: tmpDir },
    );
    const after = process.stdin.listenerCount("data");
    expect(after).toBe(before);
  });

  it("INIT-14 cursor frontmatter: file has YAML frontmatter above marker; prefix bytes preserved on update", async () => {
    // Run once — creates the cursor file with frontmatter.
    await runInit(
      { targets: ["cursor"], dryRun: false, force: false },
      { cwd: tmpDir },
    );
    const cursorPath = join(tmpDir, ".cursor", "rules", "ui-hierarchy-mcp.mdc");
    const v1 = await readFile(cursorPath, "utf8");

    // Frontmatter contract (INIT-14).
    expect(v1.startsWith("---\ndescription:")).toBe(true);
    expect(v1).toContain("alwaysApply: true");
    expect(v1).toContain('globs:\n  - "**/*.tsx"\n  - "**/*.jsx"');
    expect(v1).toContain("---\n");

    const markerStart1 = v1.indexOf("<!-- ui-hierarchy-mcp:start");
    expect(markerStart1).toBeGreaterThan(0);
    const prefixHash1 = sha256(v1.slice(0, markerStart1));

    // Force an update to exercise replaceBlock on the frontmatter file.
    await runInit(
      { targets: ["cursor"], dryRun: false, force: true },
      { cwd: tmpDir },
    );
    const v2 = await readFile(cursorPath, "utf8");
    const markerStart2 = v2.indexOf("<!-- ui-hierarchy-mcp:start");
    const prefixHash2 = sha256(v2.slice(0, markerStart2));

    expect(prefixHash2).toBe(prefixHash1);
  });
});
