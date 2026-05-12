import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Shared spawn/lifecycle helpers for MCP integration tests (Phase 08 plan 04, per D-06).
// Owns ONLY spawn/teardown/stderr accumulation. Envelope handling, fixture-specific
// invariants, and tree-walking helpers stay in the suite files.

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const distCli: string = resolve(__dirname, "../../dist/cli.js");
export const srcCli: string = resolve(__dirname, "../../src/cli.ts");

// Build-staleness guard (D-04). Throws if dist/cli.js missing or older than src/cli.ts.
export function assertFreshBuild(): void {
  if (!existsSync(distCli)) {
    throw new Error(
      `dist/cli.js not found at ${distCli}. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
  const distMtime = statSync(distCli).mtimeMs;
  const srcMtime = statSync(srcCli).mtimeMs;
  if (srcMtime > distMtime) {
    throw new Error(
      `dist/cli.js is older than src/cli.ts. Run 'pnpm build' before 'pnpm test:integration'.`,
    );
  }
}

export interface SpawnedMcpClient {
  client: Client;
  transport: StdioClientTransport;
  stderrChunks: Buffer[];
}

// Spawn `node dist/cli.js`, connect an MCP client, and accumulate stderr.
// Caller is responsible for teardown: `await client.close(); await transport.close();`
export async function spawnMcpClient(
  clientName: string,
  clientVersion: string = "0.0.0",
): Promise<SpawnedMcpClient> {
  assertFreshBuild();
  const transport = new StdioClientTransport({
    command: "node",
    args: [distCli],
    stderr: "pipe",
  });
  const stderrChunks: Buffer[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const client = new Client({ name: clientName, version: clientVersion });
  await client.connect(transport);
  return { client, transport, stderrChunks };
}
