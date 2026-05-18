import { z } from "zod";
import { withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";
import { Analyzer } from "../../core/Analyzer.js";
import { selectAdapter } from "../../adapters/select.js";
import { buildEnvelope } from "../../renderers/envelope-builder.js";
import { renderMarkdown } from "../../renderers/markdown.js";
import { renderJson } from "../../renderers/json.js";

export const name = "find_by_text";
export const title = "Find By Text";
export const description =
  "Finds component nodes whose rendered text content matches the given query string. " +
  "Returns matching nodes with file:line location.";

export const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Text string to search for in rendered component output (e.g., Submit, Cancel, Hello World).",
    ),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe(
      "Output format: markdown (default, LLM-friendly tree) or json (structured object for programmatic use).",
    ),
  projectRoot: projectRootSchema,
});

export function makeHandler(
  frameworkOverride?: string,
): (args: z.infer<typeof inputSchema>) => Promise<ToolResponse> {
  return async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
    return withErrorBoundary(name, async () => {
      const root = resolveRoot(args.projectRoot);
      const adapter = await selectAdapter(root, frameworkOverride);
      if ("isError" in adapter) return adapter;
      const analyzer = new Analyzer({ root, adapter });
      const { tree, warnings } = await analyzer.findByText({ query: args.query });
      const base = buildEnvelope(tree, { resolvedRootOverride: root });
      const envelope = { ...base, warnings: [...base.warnings, ...warnings] };
      const text =
        args.format === "json"
          ? JSON.stringify(renderJson(tree, envelope), null, 2)
          : renderMarkdown(tree, envelope);
      return { content: [{ type: "text" as const, text }] };
    });
  };
}

// Default handler (no override) for backward compatibility
export const handler = makeHandler();
