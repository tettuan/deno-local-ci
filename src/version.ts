/**
 * Version information for @aidevtool/ci
 *
 * This file contains the current version of the package.
 * The version should be kept in sync with deno.json.
 */

/** Current version of @aidevtool/ci */
export const VERSION = "0.1.6";

/**
 * Get version information for display
 * @returns Version string
 */
export function getVersion(): string {
  return VERSION;
}

/**
 * Get full version information including package name
 * @returns Full version string
 */
export function getFullVersion(): string {
  return `@aidevtool/ci v${VERSION}`;
}
