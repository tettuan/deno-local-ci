/**
 * Deno Local CI - Core Integration Test
 *
 * CI overall integration test
 * Verification of actual CI execution flow
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { CIRunner } from "../../src/ci_runner.ts";
import { CILogger, LogModeFactory } from "../../src/logger.ts";
import { CLIParser } from "../../src/cli_parser.ts";

Deno.test("CI Runner - create and initialize", async () => {
  const mode = LogModeFactory.silent(); // Stay quiet during tests
  const loggerResult = CILogger.create(mode);

  assertEquals(loggerResult.ok, true);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Create CIRunner in current project directory
    const runnerResult = await CIRunner.create(logger, {}, Deno.cwd());

    assertEquals(runnerResult.ok, true);
    if (runnerResult.ok) {
      assertExists(runnerResult.data);
    }
  }
});

Deno.test("CI Runner - silent mode logging verification", () => {
  const mode = LogModeFactory.silent();
  const loggerResult = CILogger.create(mode);

  assertEquals(loggerResult.ok, true);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Verify log suppression in silent mode
    // Test that normally output logs are suppressed

    // Spy to capture console output
    const originalLog = console.log;
    let logCalled = false;
    console.log = () => {
      logCalled = true;
    };

    try {
      // stage start logs are not output in silent mode
      logger.logStageStart({
        kind: "type-check",
        files: ["test.ts"],
        optimized: true,
        hierarchy: null,
      });

      // Verify that logs were not called
      assertEquals(logCalled, false);
    } finally {
      // Restore original console.log
      console.log = originalLog;
    }
  }
});

Deno.test("CLI Integration - parse args and create CI config", () => {
  const args = [
    "--mode",
    "batch",
    "--batch-size",
    "10",
    "--log-mode",
    "silent",
    "--no-fallback",
  ];

  const parseResult = CLIParser.parseArgs(args);
  assertEquals(parseResult.ok, true);

  if (parseResult.ok) {
    const configResult = CLIParser.buildCIConfig(parseResult.data);
    assertEquals(configResult.ok, true);

    if (configResult.ok) {
      const config = configResult.data;
      assertExists(config.mode);
      assertEquals(config.mode.kind, "batch");
      assertEquals(config.fallbackEnabled, false);
      assertEquals(config.batchSize, 10);
    }
  }
});

Deno.test("Full CI Pipeline - configuration validation", async () => {
  // Verify the flow: CLI parse → config building → logger creation
  const args = ["--mode", "single-file", "--log-mode", "error-files-only"];

  const parseResult = CLIParser.parseArgs(args);
  assertEquals(parseResult.ok, true);

  if (parseResult.ok) {
    const configResult = CLIParser.buildCIConfig(parseResult.data);
    assertEquals(configResult.ok, true);

    if (configResult.ok) {
      const config = configResult.data;
      const logMode = config.logMode || LogModeFactory.normal();

      const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);
      assertEquals(loggerResult.ok, true);

      if (loggerResult.ok) {
        const logger = loggerResult.data;
        const runnerResult = await CIRunner.create(logger, config, Deno.cwd());
        assertEquals(runnerResult.ok, true);

        if (runnerResult.ok) {
          const runner = runnerResult.data;

          // Verify that CI Runner configuration is correctly applied
          // Only validate configuration values without actual execution
          assertExists(runner);
          assertEquals(typeof runner, "object");

          // Verify that configuration is correctly applied
          assertEquals(config.mode?.kind, "single-file");
          assertEquals(config.logMode?.kind, "error-files-only");
        }
      }
    }
  }
});
