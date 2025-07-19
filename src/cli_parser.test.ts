/**
 * Deno Local CI - CLI Parser Test
 *
 * Command line argument parsing tests
 * Option parsing and error handling verification
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { type CLIOptions, CLIParser } from "./cli_parser.ts";

Deno.test("CLIParser - parse basic options", () => {
  const args = ["--mode", "batch", "--batch-size", "50", "--log-mode", "debug"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mode, "batch");
    assertEquals(result.data.batchSize, 50);
    assertEquals(result.data.logMode, "debug");
  }
});

Deno.test("CLIParser - parse fallback options", () => {
  const args = ["--no-fallback", "--stop-on-first-error"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.fallbackEnabled, false);
    assertEquals(result.data.stopOnFirstError, true);
  }
});

Deno.test("CLIParser - parse breakdown logger options", () => {
  const args = ["--log-length", "M", "--log-key", "CI_TEST"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.logLength, "M");
    assertEquals(result.data.logKey, "CI_TEST");
  }
});

Deno.test("CLIParser - parse help and version", () => {
  const helpResult = CLIParser.parseArgs(["--help"]);
  assertEquals(helpResult.ok, true);
  if (helpResult.ok) {
    assertEquals(helpResult.data.help, true);
  }

  const versionResult = CLIParser.parseArgs(["--version"]);
  assertEquals(versionResult.ok, true);
  if (versionResult.ok) {
    assertEquals(versionResult.data.version, true);
  }
});

Deno.test("CLIParser - parse working directory", () => {
  const args = ["--cwd", "/tmp/project"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.workingDirectory, "/tmp/project");
  }
});

Deno.test("CLIParser - invalid mode", () => {
  const args = ["--mode", "invalid"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "PatternMismatch");
  }
});

Deno.test("CLIParser - invalid batch size (too small)", () => {
  const args = ["--batch-size", "0"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "OutOfRange");
  }
});

Deno.test("CLIParser - invalid batch size (too large)", () => {
  const args = ["--batch-size", "101"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "OutOfRange");
  }
});

Deno.test("CLIParser - invalid log mode", () => {
  const args = ["--log-mode", "invalid"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "PatternMismatch");
  }
});

Deno.test("CLIParser - invalid log length", () => {
  const args = ["--log-length", "X"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "PatternMismatch");
  }
});

Deno.test("CLIParser - unknown option", () => {
  const args = ["--unknown-option", "value"];
  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "PatternMismatch");
  }
});

Deno.test("CLIParser - build CI config from options", () => {
  const options: CLIOptions = {
    mode: "batch",
    batchSize: 25,
    fallbackEnabled: true,
    logMode: "normal",
    stopOnFirstError: false,
    allowDirty: true,
  };

  const result = CLIParser.buildCIConfig(options);

  assertEquals(result.ok, true);
  if (result.ok) {
    const config = result.data;
    assertExists(config.mode);
    assertEquals(config.mode.kind, "batch");
    assertEquals(config.fallbackEnabled, true);
    assertEquals(config.batchSize, 25);
    assertEquals(config.stopOnFirstError, false);
    assertEquals(config.allowDirty, true);
  }
});

Deno.test("CLIParser - build CI config with debug mode", () => {
  const options: CLIOptions = {
    logMode: "debug",
    logLength: "L",
    logKey: "CI_DEBUG",
  };

  const result = CLIParser.buildCIConfig(options);

  assertEquals(result.ok, true);
  if (result.ok) {
    const config = result.data;
    assertExists(config.logMode);
    assertEquals(config.logMode.kind, "debug");
    assertExists(config.breakdownLoggerConfig);
  }
});

Deno.test("CLIParser - build CI config with invalid debug options", () => {
  // Cannot set invalid values directly,
  // so instead test incomplete debug mode configuration
  const options: CLIOptions = {
    logMode: "debug",
    logLength: "L", // When logKey is missing
    // logKey: undefined  // Simulate unset state with comment out
  };

  const result = CLIParser.buildCIConfig(options);

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("CLIParser - complex argument parsing", () => {
  const args = [
    "--mode",
    "single-file",
    "--no-fallback",
    "--log-mode",
    "debug",
    "--log-length",
    "W",
    "--log-key",
    "COMPLEX_TEST",
    "--stop-on-first-error",
    "--allow-dirty",
    "--filter",
    "*integration*",
    "--cwd",
    "/workspace",
  ];

  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    const options = result.data;
    assertEquals(options.mode, "single-file");
    assertEquals(options.fallbackEnabled, false);
    assertEquals(options.logMode, "debug");
    assertEquals(options.logLength, "W");
    assertEquals(options.logKey, "COMPLEX_TEST");
    assertEquals(options.stopOnFirstError, true);
    assertEquals(options.allowDirty, true);
    assertEquals(options.filter, "*integration*");
    assertEquals(options.workingDirectory, "/workspace");
  }
});

Deno.test("CLIParser - empty arguments", () => {
  const result = CLIParser.parseArgs([]);

  assertEquals(result.ok, true);
  if (result.ok) {
    // Test default values
    assertEquals(result.data.mode, undefined);
    assertEquals(result.data.help, undefined);
    assertEquals(result.data.version, undefined);
  }
});

Deno.test("CLIParser - mixed valid and edge case arguments", () => {
  const args = [
    "--mode",
    "all",
    "--fallback", // enable fallback explicitly
    "--log-mode",
    "error-files-only",
    "--continue-on-error", // opposite of --stop-on-first-error
  ];

  const result = CLIParser.parseArgs(args);

  assertEquals(result.ok, true);
  if (result.ok) {
    const options = result.data;
    assertEquals(options.mode, "all");
    assertEquals(options.fallbackEnabled, true);
    assertEquals(options.logMode, "error-files-only");
    assertEquals(options.stopOnFirstError, false);
  }
});
