import type { FrameworkAdapter } from "./FrameworkAdapter.js";
import type { ToolResponse } from "../mcp/errors.js";
import { NextJsAdapter } from "./next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "./expo/ExpoRouterAdapter.js";
import { detectNextJs } from "./next/detect.js";
import { detectExpoRouter } from "./expo/detect.js";

export const VALID_FRAMEWORKS = ["nextjs", "expo-router"] as const;
export type FrameworkName = typeof VALID_FRAMEWORKS[number];

export async function selectAdapter(
  projectRoot: string,
  override?: string,
): Promise<FrameworkAdapter | ToolResponse> {
  // Override skips all filesystem probes
  if (override === "nextjs") return NextJsAdapter;
  if (override === "expo-router") return new ExpoRouterAdapter();

  // Run both probes in parallel (ADAPT-03 — must be concurrent)
  // Use allSettled so a single probe failure degrades gracefully instead of
  // rejecting the entire selectAdapter call (CR-02).
  const [nextSettled, expoSettled] = await Promise.allSettled([
    detectNextJs(projectRoot),
    detectExpoRouter(projectRoot),
  ]);
  const nextResult = nextSettled.status === "fulfilled"
    ? nextSettled.value
    : { detected: false, signals: [] as string[] };
  const expoResult = expoSettled.status === "fulfilled"
    ? expoSettled.value
    : { detected: false, signals: [] as string[] };

  if (nextResult.detected && expoResult.detected) {
    // Conflict
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Detected Next.js (${nextResult.signals.join(", ")}) AND Expo Router (${expoResult.signals.join(", ")}). Use --framework to disambiguate.`,
        },
      ],
    };
  }

  if (!nextResult.detected && !expoResult.detected) {
    // Zero-match
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `No framework detected at ${projectRoot}. Use --framework nextjs|expo-router to specify.`,
        },
      ],
    };
  }

  if (nextResult.detected) return NextJsAdapter;
  return new ExpoRouterAdapter();
}
