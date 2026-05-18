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

export const name = "get_full_hierarchy";
export const title = "Get Full Hierarchy";
export const description =
  "Returns the ordered layout chain and page component subtree for a file-based router project (Next.js App Router or Expo Router).";

const ROUTE_REGEX =
  /^\/$|^\/(?:[\w-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/;

export const inputSchema = z.object({
  route: z
    .string()
    .regex(ROUTE_REGEX)
    .refine(
      v => v === "/" || !v.endsWith("/"),
      { message: "Route must not have a trailing slash (except root /)" },
    )
    .describe(
      "File-based router route path compatible with Next.js App Router and Expo Router (e.g., /, /dashboard, /posts/[slug], /[...rest]). Must start with /. No trailing slash except for root.",
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
      const { tree, warnings } = await analyzer.getFullHierarchy({ route: args.route });
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
