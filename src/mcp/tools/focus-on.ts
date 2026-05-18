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
      const { tree, warnings } = await analyzer.focusOn({ component: args.component, scope: args.scope });
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
