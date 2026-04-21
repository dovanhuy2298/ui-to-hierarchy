import { z } from "zod";
import { notImplemented, internalError } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const name = "get_full_hierarchy";
export const title = "Get Full Hierarchy";
export const description =
  "Returns the ordered layout chain and page component subtree for a Next.js App Router route. " +
  "Phase 2 stub — returns not-implemented error; real parsing lands in Phase 5.";

export const inputSchema = z.object({
  route: z
    .string()
    .regex(
      /^\/$|^\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\])(?:\/(?:[\w\-]+|\[[\w.]+\]|\[\.\.\.[\w]+\]|\[\[\.\.\.[\w]+\]\]))*$/,
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
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Absolute path to the Next.js project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().",
    ),
});

export async function handler(
  args: z.infer<typeof inputSchema>,
): Promise<ToolResponse> {
  try {
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  } catch (err) {
    return internalError(name, err);
  }
}
