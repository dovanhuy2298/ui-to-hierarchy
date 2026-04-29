import { z } from "zod";
import { withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";
import { Analyzer } from "../../core/Analyzer.js";
import { NextJsAdapter } from "../../adapters/next/NextJsAdapter.js";
import { buildEnvelope } from "../../renderers/envelope-builder.js";
import { renderMarkdown } from "../../renderers/markdown.js";

export const name = "focus_on";
export const title = "Focus On Component";
export const description =
  "Returns the component subtree rooted at a named JSX component, optionally including ancestors.";

export const inputSchema = z.object({
  component: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9_]*$/)
    .describe(
      "JSX component name in PascalCase (e.g., Card, DashboardLayout). Lowercase tags and kebab-case are rejected.",
    ),
  scope: z
    .enum(["up", "full", "down"])
    .default("full")
    .describe(
      "Traversal scope: 'up' (ancestors only), 'full' (ancestors + subtree, default), 'down' (subtree only).",
    ),
  projectRoot: projectRootSchema,
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  return withErrorBoundary(name, async () => {
    const root = resolveRoot(args.projectRoot);
    const analyzer = new Analyzer({ root, adapter: NextJsAdapter });
    const { tree, warnings } = await analyzer.focusOn({ component: args.component, scope: args.scope });
    const envelope = { ...buildEnvelope(tree, { resolvedRootOverride: root }), warnings };
    const text = renderMarkdown(tree, envelope);
    return { content: [{ type: "text" as const, text }] };
  });
}
