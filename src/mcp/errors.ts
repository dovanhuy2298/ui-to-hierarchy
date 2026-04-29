import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolResponse = CallToolResult;

/**
 * Return a structured "not implemented" response for stub handlers (D-05).
 * Used by all four tool handlers in Phase 2.
 */
export function notImplemented(toolName: string): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: `${toolName} is not implemented yet. Phase 2 (MCP Transport Shell) only ships the stdio surface; real parsing lands in Phase 5 (IR Queries & Tool Wire-up). See .planning/ROADMAP.md.`,
      },
    ],
    isError: true,
  };
}

/**
 * Wrap an unexpected runtime error so it never escapes as an unhandled rejection (D-07).
 * Does NOT surface err.stack — only err.message — to avoid leaking internals (T-02-03).
 */
export function internalError(toolName: string, err: unknown): ToolResponse {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text",
        text: `${toolName} encountered an internal error: ${message}`,
      },
    ],
    isError: true,
  };
}

/**
 * Return a structured input-validation error for Phase 5 handlers that add
 * extra zod parsing beyond the SDK schema-boundary check (D-06).
 */
export function invalidInput(toolName: string, zodError: unknown): ToolResponse {
  const message = zodError instanceof Error ? zodError.message : String(zodError);
  return {
    content: [{ type: "text", text: `${toolName} received invalid input: ${message}` }],
    isError: true,
  };
}

/**
 * Wrap a tool handler body so unexpected exceptions are uniformly converted to
 * an internalError() response (D-07). Phase 5 wire-up edits one body per tool
 * instead of repeating the try/catch boilerplate four times.
 */
export async function withErrorBoundary(
  toolName: string,
  fn: () => Promise<ToolResponse>,
): Promise<ToolResponse> {
  try {
    return await fn();
  } catch (err) {
    return internalError(toolName, err);
  }
}
