import { z } from "zod";
import { notImplemented, internalError } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";

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
  projectRoot: z
    .string()
    .optional()
    .describe(
      "Absolute path to the Next.js project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().",
    ),
});

export async function handler(args: z.infer<typeof inputSchema>): Promise<ToolResponse> {
  try {
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  } catch (err) {
    return internalError(name, err);
  }
}
