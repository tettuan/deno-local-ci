/**
 * Deno Local CI - Process Runner Test
 *
 * Process execution utilities test
 */

import { assertEquals } from "@std/assert";
import { bundleErrorsByDirectory, extractTestSummaryLine } from "./process_runner.ts";

Deno.test("extractTestSummaryLine - extracts ok summary line", () => {
  const output =
    "running 5 tests\ntest foo ... ok\ntest bar ... ok\nok | 5 passed | 0 failed (1.2s)";
  const result = extractTestSummaryLine(output);
  assertEquals(result, "ok | 5 passed | 0 failed (1.2s)");
});

Deno.test("extractTestSummaryLine - extracts FAILED summary line", () => {
  const output = "test foo ... FAILED\nFAILED | 2 passed | 1 failed (0.5s)";
  const result = extractTestSummaryLine(output);
  assertEquals(result, "FAILED | 2 passed | 1 failed (0.5s)");
});

Deno.test("extractTestSummaryLine - returns undefined for no summary", () => {
  const output = "some random output\nno summary here";
  const result = extractTestSummaryLine(output);
  assertEquals(result, undefined);
});

Deno.test("bundleErrorsByDirectory - groups errors by directory", () => {
  const cwd = "/project";
  // Use colon:line format matching the regex: /path/file.ts:line ... TS code
  const errorOutput = [
    "/project/src/foo.ts:10 error TS2345: something",
    "/project/src/bar.ts:20 error TS2345: something else",
    "/project/tests/baz.ts:5 error TS1234: another",
  ].join("\n");
  const result = bundleErrorsByDirectory(errorOutput, cwd);
  // Result should contain directory-grouped output with "dir/: file(Lline)" format
  assertEquals(result.includes("src/"), true);
  assertEquals(result.includes("tests/"), true);
  // Verify line number formatting
  assertEquals(result.includes("foo.ts(L10)"), true);
  assertEquals(result.includes("bar.ts(L20)"), true);
  assertEquals(result.includes("baz.ts(L5)"), true);
  // Verify error code summary
  assertEquals(result.includes("TS2345 x2"), true);
  assertEquals(result.includes("TS1234 x1"), true);
});

Deno.test("bundleErrorsByDirectory - handles empty input", () => {
  const result = bundleErrorsByDirectory("", "/project");
  assertEquals(result, "");
});

Deno.test("bundleErrorsByDirectory - returns trimmed input when no patterns match", () => {
  const input = "  some unrecognized error output  ";
  const result = bundleErrorsByDirectory(input, "/project");
  assertEquals(result, "some unrecognized error output");
});
