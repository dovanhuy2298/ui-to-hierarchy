import type { z } from "zod";
import type { ToolResponse } from "../errors.js";
import * as findByStyle from "./find-by-style.js";
import * as findByText from "./find-by-text.js";
import * as focusOn from "./focus-on.js";
import * as getFullHierarchy from "./get-full-hierarchy.js";

/**
 * Contract every tool module must satisfy. Each tool file exports these named
 * bindings; the registry below collects them so adding a tool is a one-file
 * change (create file → add to `tools` array). server.ts iterates this list.
 *
 * The handler arg type is each tool's own `z.infer<typeof inputSchema>` — the
 * SDK's registerTool re-validates against the inferred shape before invoking,
 * so the registry boundary uses `any` deliberately.
 */
export interface ToolModule {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
  // Per-handler args type is z.infer<inputSchema>; cannot narrow at the registry boundary.
  // The SDK re-validates against inputSchema before invoking, so `any` here is intentional.
  readonly handler: (args: any) => Promise<ToolResponse>;
  // Factory for creating a handler with an explicit framework override (CR-01).
  readonly makeHandler: (frameworkOverride?: string) => (args: any) => Promise<ToolResponse>;
}

/**
 * Single source of truth for the registered tool surface. Tests derive their
 * expected count from `tools.length`; server.ts iterates to register each one.
 *
 * To add a new tool: create the file under tools/ exporting the ToolModule
 * shape, then append the namespace import here. No other edits required.
 */
export const tools: readonly ToolModule[] = [getFullHierarchy, focusOn, findByText, findByStyle];
