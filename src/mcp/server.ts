import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { log } from "./log.js";
import * as getFullHierarchy from "./tools/get-full-hierarchy.js";
import * as focusOn from "./tools/focus-on.js";
import * as findByText from "./tools/find-by-text.js";
import * as findByStyle from "./tools/find-by-style.js";

/**
 * Build and return a configured McpServer with all four tools registered.
 *
 * Does NOT connect a transport. Tests call this and wire InMemoryTransport.
 * The CLI calls startServer() which calls this and wires StdioServerTransport.
 *
 * CRITICAL: Keep createServer and startServer separate (see RESEARCH.md Pitfall 1).
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "ui-to-hierarch",
    version: __TOOL_VERSION__,
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

  log.info("server created", { version: __TOOL_VERSION__ });
  return server;
}

/**
 * Entry point for the CLI: create the server, wire StdioServerTransport, connect.
 *
 * After connect() returns, the process stays alive because StdioServerTransport
 * holds process.stdin open.
 */
export async function startServer(): Promise<void> {
  log.info("server starting", { version: __TOOL_VERSION__ });
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
