/**
 * Deno Local CI - Logger Test
 *
 * Testing log output functionality
 * Verification of each log mode and BreakdownLogger integration
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { CILogger, LogModeFactory } from "./logger.ts";

import { BreakdownLoggerEnvConfig, type CIError, type CIStage, type StageResult } from "./types.ts";

Deno.test("LogModeFactory - create normal mode", () => {
  const mode = LogModeFactory.normal();
  assertEquals(mode.kind, "normal");
  if (mode.kind === "normal") {
    assertEquals(mode.showSections, true);
  }
});

Deno.test("LogModeFactory - create silent mode", () => {
  const mode = LogModeFactory.silent();
  assertEquals(mode.kind, "silent");
  if (mode.kind === "silent") {
    assertEquals(mode.errorsOnly, true);
  }
});

Deno.test("LogModeFactory - create error files only mode", () => {
  const mode = LogModeFactory.errorFilesOnly();
  assertEquals(mode.kind, "error-files-only");
  if (mode.kind === "error-files-only") {
    assertEquals(mode.implicitSilent, true);
  }
});

Deno.test("LogModeFactory - create debug mode", () => {
  const breakdownConfig = BreakdownLoggerEnvConfig.create("M", "TEST_KEY");

  if (breakdownConfig.ok) {
    const mode = LogModeFactory.debug(breakdownConfig.data);
    assertEquals(mode.kind, "debug");
    if (mode.kind === "debug") {
      assertEquals(mode.verboseLevel, "high");
      assertExists(mode.breakdownLoggerEnv);
    }
  }
});

Deno.test("CILogger - create with normal mode", () => {
  const mode = LogModeFactory.normal();
  const result = CILogger.create(mode);

  assertEquals(result.ok, true);
});

Deno.test("CILogger - create with debug mode requires breakdown config", () => {
  const breakdownResult = BreakdownLoggerEnvConfig.create("L", "DEBUG_KEY");

  if (breakdownResult.ok) {
    const mode = LogModeFactory.debug(breakdownResult.data);
    const result = CILogger.create(mode, breakdownResult.data);

    assertEquals(result.ok, true);
  }
});

Deno.test("CILogger - create debug mode without breakdown config fails", () => {
  // LogMode debug mode always requires breakdownLoggerEnv
  const breakdownResult = BreakdownLoggerEnvConfig.create("L", "TEST");

  if (breakdownResult.ok) {
    const mode = LogModeFactory.debug(breakdownResult.data);

    // Test creating CILogger without breakdownConfig for error testing
    const result = CILogger.create(mode, undefined);

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.error.kind, "EmptyInput");
    }
  }
});

Deno.test("CILogger - log stage start and result (normal mode)", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Test CI stages
    const stage: CIStage = {
      kind: "type-check",
      files: ["src/main.ts", "src/utils.ts"],
      optimized: true,
      hierarchy: null,
    };

    // Log output test (actual output for visual verification)
    logger.logStageStart(stage);

    const successResult: StageResult = {
      kind: "success",
      stage,
      duration: 1500,
    };

    logger.logStageResult(successResult);

    const failureResult: StageResult = {
      kind: "failure",
      stage,
      error: "Type check failed",
      shouldStop: true,
    };

    logger.logStageResult(failureResult);
  }
});

Deno.test("CILogger - log error files", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    const error: CIError = {
      kind: "TestFailure",
      files: ["tests/main_test.ts", "tests/utils_test.ts"],
      errors: ["Assertion failed", "Timeout error"],
    };

    // Error file display test
    logger.logErrorFiles(error);
  }
});

Deno.test("CILogger - log fallback", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Fallback notification test
    logger.logFallback("all", "batch", "All mode failed due to test errors");
  }
});

Deno.test("CILogger - log summary", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Summary display test (basic version)
    logger.logSummary(5, 3, 2, 45000);

    // Summary display test (detailed statistics version)
    const detailedStats = {
      stages: { total: 5, successful: 3, failed: 2, skipped: 0 },
      files: {
        totalChecked: 25,
        testFiles: 10,
        typeCheckFiles: 15,
        lintFiles: 15,
        formatFiles: 15,
        fileInfoLines: ["src/file1.ts", "src/file2.ts", "src/file3.ts"],
      },
      tests: { totalTests: 50, passedTests: 35, failedTests: 15, skippedTests: 0 },
      timing: {
        totalDuration: 45000,
        averageStageTime: 9000,
        longestStage: "Test Execution",
        longestStageDuration: 15000,
      },
    };
    logger.logSummary(5, 3, 2, 45000, detailedStats);
  }
});

Deno.test("CILogger - silent mode suppresses most logs", () => {
  const mode = LogModeFactory.silent();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    const stage: CIStage = {
      kind: "lint-check",
      files: ["src/main.ts"],
      hierarchy: null,
    };

    // In silent mode, start logs are not output
    logger.logStageStart(stage);

    // Error logs are output
    logger.logError("Test error message");
  }
});

Deno.test("CILogger - error files only mode", () => {
  const mode = LogModeFactory.errorFilesOnly();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    const error: CIError = {
      kind: "LintError",
      files: ["src/problematic.ts", "src/another.ts"],
      details: ["Lint rule violation", "Style issue"],
    };

    // In error-files-only mode, only file list is displayed
    logger.logErrorFiles(error);
  }
});

Deno.test("CILogger - debug mode with breakdown logger", () => {
  const breakdownConfigResult = BreakdownLoggerEnvConfig.create("W", "CI_DEBUG");

  if (breakdownConfigResult.ok) {
    const mode = LogModeFactory.debug(breakdownConfigResult.data);
    const loggerResult = CILogger.create(mode, breakdownConfigResult.data);

    if (loggerResult.ok) {
      const logger = loggerResult.data;

      // Save environment variables before setting
      const originalLogLength = Deno.env.get("LOG_LENGTH");
      const originalLogKey = Deno.env.get("LOG_KEY");

      // BreakdownLogger environment variable setting
      logger.setupBreakdownLogger();

      // Verify configuration
      assertEquals(Deno.env.get("LOG_LENGTH"), "W");
      assertEquals(Deno.env.get("LOG_KEY"), "CI_DEBUG");

      // Debug log test
      logger.logDebug("Debug information", { test: "data" });

      // Restore environment variables
      if (originalLogLength) {
        Deno.env.set("LOG_LENGTH", originalLogLength);
      } else {
        Deno.env.delete("LOG_LENGTH");
      }

      if (originalLogKey) {
        Deno.env.set("LOG_KEY", originalLogKey);
      } else {
        Deno.env.delete("LOG_KEY");
      }
    }
  }
});

Deno.test("CILogger - log warning and error", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Warning log test
    logger.logWarning("This is a warning message");

    // Error log test
    logger.logError("This is an error message");

    // Error log test with debug information
    logger.logError("Error with details", new Error("Detailed error info"));
  }
});

Deno.test("CILogger - BreakdownLogger integration", () => {
  const breakdownConfigResult = BreakdownLoggerEnvConfig.create("L", "CI_BREAKDOWN_TEST");

  if (breakdownConfigResult.ok) {
    const mode = LogModeFactory.debug(breakdownConfigResult.data);
    const loggerResult = CILogger.create(mode, breakdownConfigResult.data);

    if (loggerResult.ok) {
      const logger = loggerResult.data;

      // Save environment variables before setting
      const originalLogLength = Deno.env.get("LOG_LENGTH");
      const originalLogKey = Deno.env.get("LOG_KEY");

      try {
        // BreakdownLogger environment variable setting
        logger.setupBreakdownLogger();

        // Verify configuration
        assertEquals(Deno.env.get("LOG_LENGTH"), "L");
        assertEquals(Deno.env.get("LOG_KEY"), "CI_BREAKDOWN_TEST");

        // Log tests using BreakdownLogger
        // Output will be displayed with timestamps by BreakdownLogger
        logger.logDebug("BreakdownLogger integration test");
        logger.logWarning("BreakdownLogger warning test");
        logger.logError("BreakdownLogger error test");
      } finally {
        // Cleanup (restore to original state)
        if (originalLogLength) {
          Deno.env.set("LOG_LENGTH", originalLogLength);
        } else {
          Deno.env.delete("LOG_LENGTH");
        }

        if (originalLogKey) {
          Deno.env.set("LOG_KEY", originalLogKey);
        } else {
          Deno.env.delete("LOG_KEY");
        }
      }
    }
  }
});
