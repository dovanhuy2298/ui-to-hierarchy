import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { log } from "./log.js";
import * as getFullHierarchy from "./tools/get-full-hierarchy.js";
import * as focusOn from "./tools/focus-on.js";
import * as findByText from "./tools/find-by-text.js";
import * as findByStyle from "./tools/find-by-style.js";

// Runtime fallback: __TOOL_VERSION__ is substituted by tsup define at build time.
// Without this guard, running via tsx or a test runner that skips define-substitution
// would throw ReferenceError: __TOOL_VERSION__ is not defined.
const TOOL_VERSION =
  typeof __TOOL_VERSION__ !== "undefined" ? __TOOL_VERSION__ : "0.0.0-unknown";

/**
 * Build and return a configured McpServer with all four tools registered.
 *
 * Does NOT connect a transport. Tests call this and wire InMemoryTransport.
 * The CLI calls startServer() which calls this and wires StdioServerTransport.
 *
 * Keep createServer (returns server, no transport) and startServer (wires stdio)
 * separate so tests can inject InMemoryTransport without touching real stdio.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ui-to-hierarch",
    version: TOOL_VERSION,
  });

  server.registerTool(
    getFullHierarchy.name,
    {
      title: getFullHierarchy.title,
      description: getFullHierarchy.description,
      inputSchema: getFullHierarchy.inputSchema,
    },
    getFullHierarchy.handler,
  );

  server.registerTool(
    focusOn.name,
    {
      title: focusOn.title,
      description: focusOn.description,
      inputSchema: focusOn.inputSchema,
    },
    focusOn.handler,
  );

  server.registerTool(
    findByText.name,
    {
      title: findByText.title,
      description: findByText.description,
      inputSchema: findByText.inputSchema,
    },
    findByText.handler,
  );

  server.registerTool(
    findByStyle.name,
    {
      title: findByStyle.title,
      description: findByStyle.description,
      inputSchema: findByStyle.inputSchema,
    },
    findByStyle.handler,
  );

  log.info("server created", { version: TOOL_VERSION });
  return server;
}

/**
 * Entry point for the CLI: create the server, wire StdioServerTransport, connect.
 *
 * After connect() returns, the process stays alive because StdioServerTransport
 * holds process.stdin open.
 */
export async function startServer(): Promise<void> {
  log.info("server starting", { version: TOOL_VERSION });
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
