import { z } from "zod";
import { withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";
import { Analyzer } from "../../core/Analyzer.js";
import { NextJsAdapter } from "../../adapters/next/NextJsAdapter.js";
import { buildEnvelope } from "../../renderers/envelope-builder.js";
import { renderMarkdown } from "../../renderers/markdown.js";

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
  projectRoot: projectRootSchema,
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const root = resolveRoot(args.projectRoot);
    const analyzer = new Analyzer({ root, adapter: NextJsAdapter });
    const { tree, warnings } = await analyzer.findByText({ query: args.query });
    const envelope = { ...buildEnvelope(tree, { resolvedRootOverride: root }), warnings };
    const text = renderMarkdown(tree, envelope);
    return { content: [{ type: "text" as const, text }] };
  });
}
