// Phase 6 cold-spawn perf measurement script (D-08, D-09, D-10, D-11).
//
// Spawns a fresh `node dist/cli.js` per invocation, performs the full MCP
// handshake (StdioClientTransport construct → Client.connect → callTool), and
// measures end-to-end wall-clock latency from spawn through JSON-RPC response.
//
// Output: .planning/phases/06-hardening-fixture-gates/06-PERF.md (overwritten).
// Per SPEC R7 this is informational — no threshold, no test failure.

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distCli = resolve(__dirname, "../../dist/cli.js");
const fixture = resolve(__dirname, "../fixtures/phase-06/nested-routes");
const N = 30;

const TOOLS = [
  {
    name: "get_full_hierarchy",
    arguments: { route: "/dashboard/123", format: "json" as const, projectRoot: fixture },
  },
  {
    name: "focus_on",
    arguments: { component: "DashboardDetail", scope: "full" as const, projectRoot: fixture },
  },
  {
    name: "find_by_text",
    arguments: { query: "Sidebar slot", projectRoot: fixture },
  },
  {
    name: "find_by_style",
    arguments: { class_or_prop: "grid-cols-3", projectRoot: fixture },
  },
];

async function measureOnce(tool: (typeof TOOLS)[number]): Promise<number> {
  // D-08: window starts BEFORE transport construction and ends AFTER
  // callTool resolves but BEFORE close (close cost excluded).
  const t0 = performance.now();
  const transport = new StdioClientTransport({
    command: "node",
    args: [distCli],
    stderr: "pipe",
  });
  const client = new Client({ name: "perf", version: "0.0.0" });
  await client.connect(transport);
  await client.callTool(tool);
  const elapsed = performance.now() - t0;
  await client.close();
  await transport.close();
  return elapsed;
}

function pct(sorted: number[], p: number): number {
  // Hand-rolled percentile (RESEARCH.md "Don't Hand-Roll" exception — single
  // call site, no new dep). Nearest-rank, ceil index, clamped to length.
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i] ?? 0;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

async function main(): Promise<void> {
  const rows: { tool: string; min: number; p50: number; p95: number; max: number }[] = [];

  for (const tool of TOOLS) {
    process.stderr.write(`[perf] measuring ${tool.name} (${N} cold spawns)...\n`);
    const samples: number[] = [];
    for (let i = 0; i < N; i++) {
      const ms = await measureOnce(tool);
      samples.push(ms);
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    rows.push({
      tool: tool.name,
      min: sorted[0] ?? 0,
      p50: pct(sorted, 50),
      p95: pct(sorted, 95),
      max: sorted[sorted.length - 1] ?? 0,
    });
  }

  // D-10 privacy: emit platform/arch/Node/CPU/RAM only.
  // Do NOT emit os.hostname() or os.userInfo().
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? "unknown";
  const cpuCount = cpus.length;
  const ramGb = (os.totalmem() / 1024 ** 3).toFixed(1);

  const lines: string[] = [
    "# Phase 6 Performance Baseline",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "**Methodology:** cold spawn of dist/cli.js per invocation, 30 samples per tool, end-to-end wall-clock from spawn to JSON-RPC response.",
    "",
    "## Host",
    "",
    `- Platform: ${process.platform} (${process.arch})`,
    `- Node: ${process.version}`,
    `- CPU: ${cpuModel} × ${cpuCount}`,
    `- RAM: ${ramGb} GB`,
    "",
    "## Latency (ms)",
    "",
    "| Tool | min | p50 | p95 | max |",
    "| ---- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(`| ${r.tool} | ${fmt(r.min)} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} |`);
  }
  lines.push("");
  lines.push(
    "> Reproducibility: re-running on the same machine should yield p95 within ±20% (manual sanity check, not enforced).",
  );

  const out = resolve(
    __dirname,
    "../../.planning/phases/06-hardening-fixture-gates/06-PERF.md",
  );
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
