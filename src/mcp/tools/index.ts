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
 */
// biome-ignore lint/suspicious/noExplicitAny: handler args type is the tool's own z.infer; can't be narrowed at the registry boundary
export interface ToolModule {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject<z.ZodRawShape>;
  // biome-ignore lint/suspicious/noExplicitAny: each tool's handler infers its own arg type; the registry treats them uniformly
  readonly handler: (args: any) => Promise<ToolResponse>;
}

/**
 * Single source of truth for the registered tool surface. Tests derive their
 * expected count from `tools.length`; server.ts iterates to register each one.
 *
 * To add a new tool: create the file under tools/ exporting the ToolModule
 * shape, then append the namespace import here. No other edits required.
 */
export const tools: readonly ToolModule[] = [
  getFullHierarchy,
  focusOn,
  findByText,
  findByStyle,
];
