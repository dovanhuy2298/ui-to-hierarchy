/**
 * Expo Router URL builder and layout chain composer (Phase 12, ROUTE-04/05).
 *
 * Simpler than Next.js route-map.ts: linear scan (no tree structure),
 * no parallel slots in v1 — Expo has <Slot> but no @parallel folders.
 *
 * D-12 no-throw: invalid route, missing app root, or unmatched path →
 * returns { matched: false, entries: [], params: {}, slots: {} }.
 *
 * Groups (tabs)/ are transparent in URL building — they appear in layout
 * chains but not in route strings.
 */

import { access } from "node:fs/promises";
import { sep } from "node:path";
import { glob } from "tinyglobby";
import { toForwardSlash } from "../../core/paths.js";
import type { RouteMatch } from "../types.js";
import { resolveExpoRoot } from "./discover.js";
import { parseSegment } from "./segments.js";

/** D-12 no-throw fallback. */
function cloneEmpty(): RouteMatch {
  return { matched: false, entries: [], params: {}, slots: {} };
}

const GLOB_PATTERN = ["**/*.{tsx,jsx,ts,js}"];
const GLOB_IGNORE = [
  "**/components/**",
  "**/hooks/**",
  "**/utils/**",
  "**/node_modules/**",
];

const LAYOUT_EXTS = ["tsx", "jsx", "ts", "js"] as const;

/**
 * Compute the URL route string for a given entry file relative to appRoot.
 * Returns null when the entry should not produce a URL route
 * (special files like +not-found, layout files).
 */
function entryToRoute(fwdFile: string, fwdAppRoot: string): string | null {
  const prefix = fwdAppRoot.endsWith("/") ? fwdAppRoot : `${fwdAppRoot}/`;
  if (!fwdFile.startsWith(prefix)) return null;
  const rel = fwdFile.slice(prefix.length);
  const parts = rel.split("/");
  if (parts.length === 0) return null;

  const filename = parts[parts.length - 1]!;
  const dirParts = parts.slice(0, -1);

  // Strip extension from filename and classify
  const fileSegment = parseSegment(filename);

  // _layout files are not pages
  if (filename.replace(/\.(tsx|jsx|ts|js)$/, "") === "_layout") return null;
  // special files (+not-found etc.) are not routes
  if (fileSegment.kind === "special") return null;

  const routeSegments: string[] = [];
  let skip = false;

  for (const part of dirParts) {
    const seg = parseSegment(part);
    if (seg.kind === "group") continue;        // groups transparent in URL
    if (seg.kind === "special") { skip = true; break; }
    if (seg.kind === "index") continue;
    if (seg.kind === "static") routeSegments.push(seg.name);
    else if (seg.kind === "dynamic") routeSegments.push(`[${seg.name}]`);
    else if (seg.kind === "catch-all") routeSegments.push(`[...${seg.name}]`);
    else if (seg.kind === "optional-catch-all") routeSegments.push(`[[...${seg.name}]]`);
  }

  if (skip) return null;

  // Handle the filename segment
  if (fileSegment.kind === "index") {
    // index collapses to parent URL (no extra segment)
  } else if (fileSegment.kind === "static") {
    routeSegments.push(fileSegment.name);
  } else if (fileSegment.kind === "dynamic") {
    routeSegments.push(`[${fileSegment.name}]`);
  } else if (fileSegment.kind === "catch-all") {
    routeSegments.push(`[...${fileSegment.name}]`);
  } else if (fileSegment.kind === "optional-catch-all") {
    routeSegments.push(`[[...${fileSegment.name}]]`);
  } else if (fileSegment.kind === "group") {
    // group as filename is unusual — skip
    return null;
  }

  return "/" + routeSegments.join("/");
}

/** Convert a forward-slash path string to the OS native path for fs.access. */
function toNativePath(fwdPath: string): string {
  return fwdPath.split("/").join(sep);
}

/**
 * Build the layout chain from app root down to the page file's directory.
 * At each directory level (including transparent group directories),
 * check if a _layout file exists and include it.
 * Returns entries in root→leaf order (page is NOT included here).
 */
async function buildLayoutChain(
  fwdPageFile: string,
  fwdAppRoot: string,
): Promise<string[]> {
  const prefix = fwdAppRoot.endsWith("/") ? fwdAppRoot : `${fwdAppRoot}/`;
  if (!fwdPageFile.startsWith(prefix)) return [];
  const rel = fwdPageFile.slice(prefix.length);
  const parts = rel.split("/");
  parts.pop(); // remove filename

  const chain: string[] = [];

  // Walk from app root down through each directory segment
  let currentFwdPath = fwdAppRoot;
  // Check _layout at the app root level first
  for (const ext of LAYOUT_EXTS) {
    const layoutFwd = `${currentFwdPath}/_layout.${ext}`;
    try {
      await access(toNativePath(layoutFwd));
      chain.push(layoutFwd);
      break;
    } catch {
      // try next extension
    }
  }

  // Now walk into each subdirectory
  for (const part of parts) {
    currentFwdPath = `${currentFwdPath}/${part}`;
    for (const ext of LAYOUT_EXTS) {
      const layoutFwd = `${currentFwdPath}/_layout.${ext}`;
      try {
        await access(toNativePath(layoutFwd));
        chain.push(layoutFwd);
        break;
      } catch {
        // try next extension
      }
    }
  }

  return chain;
}

/**
 * Enumerate all URL routes produced by the Expo app.
 * Groups are transparent, index collapses to parent, +special are excluded.
 * Returns [] when no app root found.
 */
export async function enumerateRoutes(absRoot: string): Promise<string[]> {
  const appRoot = await resolveExpoRoot(absRoot);
  if (!appRoot) return [];
  const fwdAppRoot = toForwardSlash(appRoot);

  const files = await glob(GLOB_PATTERN, {
    cwd: appRoot,
    absolute: true,
    ignore: GLOB_IGNORE,
    dot: false,
  });

  const routes = new Set<string>();
  for (const file of files) {
    const fwdFile = toForwardSlash(file);
    const route = entryToRoute(fwdFile, fwdAppRoot);
    if (route !== null) routes.add(route);
  }

  return [...routes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Map a URL route to the ordered list of layout + page files.
 * Entries are in root→leaf→page order (D-09).
 * Returns { matched: false } for invalid input, missing root, or unmatched route.
 * Never throws (D-12 no-throw contract).
 */
export async function mapRouteToEntry(
  absRoot: string,
  route: string,
): Promise<RouteMatch> {
  // D-12: validate input
  if (typeof route !== "string" || !route.startsWith("/")) return cloneEmpty();

  let appRoot: string | null;
  try {
    appRoot = await resolveExpoRoot(absRoot);
  } catch {
    return cloneEmpty();
  }
  if (!appRoot) return cloneEmpty();
  const fwdAppRoot = toForwardSlash(appRoot);

  let files: string[];
  try {
    files = await glob(GLOB_PATTERN, {
      cwd: appRoot,
      absolute: true,
      ignore: GLOB_IGNORE,
      dot: false,
    });
  } catch {
    return cloneEmpty();
  }

  // Find the page file that maps to the given route.
  // toForwardSlash(file) is applied explicitly here to ensure Windows
  // paths from tinyglobby (which may return mixed separators) are
  // normalized before being used with buildLayoutChain. buildLayoutChain
  // depends on forward-slash paths throughout.
  let pageFile: string | null = null;
  for (const file of files) {
    const fwdFile = toForwardSlash(file);
    const fileRoute = entryToRoute(fwdFile, fwdAppRoot);
    if (fileRoute === route) {
      pageFile = fwdFile;
      break;
    }
  }

  if (!pageFile) return cloneEmpty();

  // Build the layout chain (root→leaf), then append page
  try {
    const layouts = await buildLayoutChain(pageFile, fwdAppRoot);

    // Extract dynamic parameter names from the matched route pattern.
    // Values are "" since this is static analysis — actual values are
    // only known at runtime. Handles [param] and [...param] patterns.
    const params: Record<string, string> = {};
    const paramMatches = route.matchAll(/\[\.\.\.(\w+)\]|\[(\w+)\]/g);
    for (const m of paramMatches) {
      const name = m[1] ?? m[2];
      if (name) params[name] = "";
    }

    return {
      matched: true,
      entries: [...layouts, pageFile],
      params,
      slots: {},
    };
  } catch {
    return cloneEmpty();
  }
}
