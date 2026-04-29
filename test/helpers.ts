import type { ToolResponse } from "../src/mcp/errors.js";

/**
 * Cast `client.callTool()`'s `unknown` result to `ToolResponse`.
 *
 * The SDK Client types result.content as unknown[]; this helper centralizes
 * the one cast site so tests don't sprinkle `as ToolResponse` everywhere.
 */
export function asToolResponse(result: unknown): ToolResponse {
  return result as ToolResponse;
}

/**
 * Extract the text field of the first content entry on a ToolResponse.
 * Throws if the entry is missing or not of type "text" so type assumptions
 * are validated at runtime instead of silently coerced.
 *
 * Centralizes the `(r.content[0] as { type, text }).text` ceremony that
 * otherwise repeats at every assertion site.
 */
export function firstText(r: { content: Array<{ type: string }> }): string {
  const item = r.content[0];
  if (!item || item.type !== "text") {
    throw new Error("expected text content in first entry");
  }
  return (item as { type: "text"; text: string }).text;
}
