import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const distCli = resolve(fileURLToPath(import.meta.url), "../../../dist/cli.js");
const fixture = resolve(
  fileURLToPath(import.meta.url),
  "../../../test/fixtures/phase-06/nested-routes",
);

const transport = new StdioClientTransport({
  command: "node",
  args: [distCli],
  stderr: "pipe",
});
const client = new Client({ name: "uat-capture", version: "0.0.0" });
await client.connect(transport);

const calls = [
  {
    name: "get_full_hierarchy",
    arguments: { route: "/dashboard/123", format: "json", projectRoot: fixture },
  },
  {
    name: "focus_on",
    arguments: { component: "DashboardDetail", scope: "full", projectRoot: fixture },
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

const results: Array<{ call: typeof calls[number]; result: unknown }> = [];
for (const call of calls) {
  const result = await client.callTool(call);
  results.push({ call, result });
}

await client.close();
await transport.close();

const out = process.argv[2] ?? "uat-envelopes.json";
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`wrote ${out}`);
