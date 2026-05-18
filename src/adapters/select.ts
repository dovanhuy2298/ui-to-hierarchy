import type { FrameworkAdapter } from "./FrameworkAdapter.js";
import type { ToolResponse } from "../mcp/errors.js";
import { NextJsAdapter } from "./next/NextJsAdapter.js";
import { ExpoRouterAdapter } from "./expo/ExpoRouterAdapter.js";
import { detectNextJs } from "./next/detect.js";
import { detectExpoRouter } from "./expo/detect.js";

let _frameworkOverride: string | undefined;

export function setFrameworkOverride(v: string): void {
  _frameworkOverride = v;
}

export async function selectAdapter(
  projectRoot: string,
  override: string | undefined = _frameworkOverride,
): Promise<FrameworkAdapter | ToolResponse> {
  // Override skips all filesystem probes
  if (override === "nextjs") return NextJsAdapter;
  if (override === "expo-router") return new ExpoRouterAdapter();

  // Run both probes in parallel (ADAPT-03 — must be concurrent)
  const [nextResult, expoResult] = await Promise.all([
    detectNextJs(projectRoot),
    detectExpoRouter(projectRoot),
  ]);

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
