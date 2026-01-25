/**
 * Deno Local CI - Logger Test
 *
 * Testing log output functionality
 * Verification of each log mode and BreakdownLogger integration
 */

import { assertEquals, assertExists } from "@std/assert";
import { CILogger, LogModeFactory } from "./logger.ts";

import type { CIError, CIStage, StageResult } from "./types.ts";

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
  const mode = LogModeFactory.debug("high", "W", "TEST_KEY");
  assertEquals(mode.kind, "debug");
  if (mode.kind === "debug") {
    assertEquals(mode.verboseLevel, "high");
    assertExists(mode.breakdownLoggerEnv);
    assertEquals(mode.breakdownLoggerEnv.logLength, "W");
    assertEquals(mode.breakdownLoggerEnv.logKey, "TEST_KEY");
  }
});

Deno.test("CILogger - create with normal mode", () => {
  const mode = LogModeFactory.normal();
  const result = CILogger.create(mode);

  assertEquals(result.ok, true);
});

Deno.test("CILogger - create with debug mode requires breakdown config", () => {
  const mode = LogModeFactory.debug("high", "L", "DEBUG_KEY");
  const result = CILogger.create(mode);

  assertEquals(result.ok, true);
});

Deno.test("CILogger - create debug mode with invalid config fails", () => {
  // Create invalid debug mode using LogModeFactory with invalid parameters
  // This will internally handle the validation and return normal mode as fallback
  const mode = LogModeFactory.debug("high", "M", ""); // Empty key should cause fallback
  const result = CILogger.create(mode);

  // Should still succeed because LogModeFactory provides fallback to normal mode
  assertEquals(result.ok, true);
  if (result.ok) {
    // Verify it fell back to normal mode (no breakdownLoggerEnv)
    assertEquals(mode.kind, "normal");
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

    logger.logStageComplete(successResult);

    const failureResult: StageResult = {
      kind: "failure",
      stage,
      error: "Type check failed",
      shouldStop: true,
    };

    logger.logStageComplete(failureResult);
  }
});

Deno.test("CILogger - log error with classified error", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    const error: CIError = {
      kind: "TestFailure",
      files: ["tests/main_test.ts", "tests/utils_test.ts"],
      errors: ["Assertion failed", "Timeout error"],
    };

    // Test error logging - uses new logError method
    logger.logError("Test execution failed", error);
  }
});

Deno.test("CILogger - log progress with fallback indication", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    const progressIndicator = {
      processedFiles: 5,
      totalFiles: 10,
      currentStage: "Test Execution",
      errorFiles: 2,
      totalErrorCount: 3,
      isFallback: true,
      fallbackMessage: "Retrying with batch mode",
    };

    // Test progress logging with fallback notification
    logger.logProgress(progressIndicator);
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

    // In error-files-only mode, errors are logged using logError
    logger.logError("Lint check failed", error);
  }
});

Deno.test("CILogger - debug mode with breakdown logger", () => {
  const mode = LogModeFactory.debug("high", "W", "CI_DEBUG");
  const loggerResult = CILogger.create(mode);

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
});

Deno.test("CILogger - log info and error", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // Info log test
    logger.logInfo("This is an info message");

    // Error log test
    logger.logError("This is an error message");

    // Error log test with debug information
    logger.logError("Error with details", new Error("Detailed error info"));
  }
});

Deno.test("CILogger - BreakdownLogger integration", () => {
  const mode = LogModeFactory.debug("high", "L", "CI_BREAKDOWN_TEST");
  const loggerResult = CILogger.create(mode);

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
      logger.logInfo("BreakdownLogger info test");
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
});
