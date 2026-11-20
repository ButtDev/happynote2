/**
 * Platform detection and desktop-only Node.js lazy-loading helpers.
 * Keeps mobile (Android/iOS Capacitor WebView) 100% crash-free by ensuring
 * Node.js built-in modules are never evaluated on mobile, while preserving
 * identical runtime behavior on Obsidian Desktop and Node test runners.
 */

let cachedMobileOverride: boolean | null = null;

/**
 * Allows unit tests to simulate mobile or desktop mode deterministically.
 */
export function setPlatformMobileOverrideForTest(isMobile: boolean | null): void {
  cachedMobileOverride = isMobile;
}

/**
 * Returns true when running inside Obsidian Mobile (Android/iOS).
 * Safely returns false in Node.js CLI/test environments where `obsidian` runtime is absent.
 */
export function isMobileApp(): boolean {
  if (cachedMobileOverride !== null) {
    return cachedMobileOverride;
  }

  try {
    const obsidianReq = getOptionalObsidianPlatform();
    if (obsidianReq && typeof obsidianReq.isMobile === "boolean") {
      return obsidianReq.isMobile;
    }
  } catch {
    // Ignore when `obsidian` runtime is not available (e.g., Node test runner)
  }

  if (typeof document !== "undefined" && document.body?.classList) {
    return document.body.classList.contains("is-mobile");
  }

  return false;
}

/**
 * Returns true when running on Obsidian Desktop or a Node.js environment.
 */
export function isDesktopApp(): boolean {
  return !isMobileApp();
}

function getOptionalObsidianPlatform(): { isMobile?: boolean } | null {
  try {
    // Use dynamic lookup so Node.js ESM test runner doesn't fail at module parse time
    const globalReq =
      typeof (globalThis as Record<string, unknown>).require === "function"
        ? ((globalThis as Record<string, unknown>).require as (id: string) => any)
        : typeof require === "function"
          ? require
          : null;
    if (globalReq) {
      const obs = globalReq("obsidian");
      return obs?.Platform ?? null;
    }
  } catch {
    // Ignore in ESM / non-Obsidian environments
  }
  return null;
}

/**
 * Lazily loads a Node.js built-in module ONLY on desktop/Node environments.
 * Never evaluates `require("child_process")` etc. at module top-level so
 * Obsidian Mobile WebView can load `main.js` cleanly without module errors.
 */
export function requireDesktopModule<T = any>(moduleId: string): T {
  if (isMobileApp()) {
    throw new Error(`Desktop Node module '${moduleId}' is not available on mobile.`);
  }

  // 1. Electron / Obsidian Desktop renderer `window.require` or CJS `require`
  const win = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
  if (win && typeof win.require === "function") {
    return (win.require as (id: string) => T)(moduleId);
  }

  if (typeof require === "function") {
    return require(moduleId) as T;
  }

  // 2. Node.js ESM test runner (`node --experimental-strip-types` on Node 22+)
  const proc = typeof process !== "undefined" ? (process as unknown as Record<string, unknown>) : null;
  if (proc && typeof proc.getBuiltinModule === "function") {
    const mod = (proc.getBuiltinModule as (id: string) => T | undefined)(moduleId);
    if (mod) return mod;
  }

  throw new Error(`Unable to load desktop Node module: ${moduleId}`);
}
