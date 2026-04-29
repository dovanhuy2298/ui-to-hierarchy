import { z } from "zod";
import { notImplemented, withErrorBoundary } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { projectRootSchema } from "./common.js";

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
    const _root = resolveRoot(args.projectRoot);
    return notImplemented(name);
  });
}
