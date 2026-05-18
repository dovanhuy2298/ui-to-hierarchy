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

export const name = "find_by_style";
export const title = "Find By Style";
export const description =
  "Finds component nodes that use a given CSS class name or style prop. " +
  "Returns matching nodes with file:line location.";

export const inputSchema = z.object({
  class_or_prop: z
    .string()
    .min(1)
    .describe(
      "CSS class name or style prop to search for (e.g., flex, bg-blue-500, color, marginTop).",
    ),
  format: z
    .enum(["markdown", "json"])
    .default("markdown")
    .describe(
      "Output format: markdown (default, LLM-friendly tree) or json (structured object for programmatic use).",
    ),
  projectRoot: projectRootSchema,
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const root = resolveRoot(args.projectRoot);
    const adapter = await selectAdapter(root);
    if ("isError" in adapter) return adapter;
    const analyzer = new Analyzer({ root, adapter });
    const { tree, warnings } = await analyzer.findByStyle({ class_or_prop: args.class_or_prop });
    const base = buildEnvelope(tree, { resolvedRootOverride: root });
    const envelope = { ...base, warnings: [...base.warnings, ...warnings] };
    const text =
      args.format === "json"
        ? JSON.stringify(renderJson(tree, envelope), null, 2)
        : renderMarkdown(tree, envelope);
    return { content: [{ type: "text" as const, text }] };
  });
}
