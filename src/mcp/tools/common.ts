import { z } from "zod";

/**
 * Shared zod fragment for the optional `projectRoot` field used by every tool.
 *
 * Centralized here so description changes (e.g., monorepo guidance) only need
 * to be made in one place.
 */
export const projectRootSchema = z
  .string()
  .optional()
  .describe(
    "Absolute path to the Next.js project root. Defaults to UI_TO_HIERARCH_ROOT env var, then process.cwd().",
  );
