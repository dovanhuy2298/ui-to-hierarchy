import { z } from "zod";
import { notImplemented, withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";

export const name = "get_full_hierarchy";
export const title = "Get Full Hierarchy";
export const description =
  "Returns the ordered layout chain and page component subtree for a Next.js App Router route.";

export const inputSchema = z.object({
  route: z
    .string()
    .regex(
      /^\/$|^\/(?:[\w-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/,
    )
    .describe(
      "Next.js App Router route path (e.g., /, /dashboard, /posts/[slug], /[...rest]). Must start with /. No trailing slash except for root.",
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
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  });
}
