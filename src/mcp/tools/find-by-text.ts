import { z } from "zod";
import { notImplemented, internalError } from "../errors.js";
import type { ToolResponse } from "../errors.js";
import { resolveRoot } from "../../core/resolve-root.js";

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
