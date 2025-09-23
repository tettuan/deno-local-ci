/**
 * # Deno Local CI - Logger Service
 *
 * Comprehensive logging infrastructure with multiple output modes and BreakdownLogger integration.
 * Provides structured, contextual logging for all CI pipeline stages and operations.
 *
 * ## Features
 * - **Multiple Log Modes**: Normal, silent, debug, and error-files-only modes
 * - **BreakdownLogger Integration**: Enhanced debug logging with timestamps and structured output
 * - **Stage-Aware Logging**: Specialized logging for CI pipeline stages
 * - **Error Classification**: Structured error reporting with context
 * - **Performance Tracking**: Duration tracking and performance metrics
 * - **Fallback Support**: Graceful degradation when external loggers are unavailable
 *
 * @module
 */

import { BreakdownLogger } from "@tettuan/breakdownlogger";
import {
  BreakdownLoggerEnvConfig,
  CIStage,
  CISummaryStats,
  createError,
  EnhancedProgressIndicator,
  LogMode,
  ProgressIndicator,
  Result,
  StageResult,
  ValidationError,
} from "./types.ts";

/**
 * Factory for creating LogMode instances with type safety.
 *
 * Provides convenient methods for creating different log modes
 * according to the architecture design.
 */
export class LogModeFactory {
  private constructor() {}

  /**
   * Create normal log mode with section display.
   */
  static normal(): LogMode {
    return {
      kind: "normal",
      showSections: true,
    };
  }

  /**
   * Create silent log mode (errors only).
   */
  static silent(): LogMode {
    return {
      kind: "silent",
      errorsOnly: true,
    };
  }

  /**
   * Create debug log mode with BreakdownLogger configuration.
   */
  static debug(
    verboseLevel: "high" = "high",
    logLength: "W" | "M" | "L" = "M",
    logKey: string = "CI_DEBUG",
  ): LogMode {
    const breakdownResult = BreakdownLoggerEnvConfig.create(logLength, logKey);
    if (!breakdownResult.ok) {
      // Fallback to normal mode if config creation fails
      return LogModeFactory.normal();
    }

    return {
      kind: "debug",
      verboseLevel,
      breakdownLoggerEnv: breakdownResult.data,
    };
  }

  /**
   * Create error-files-only mode.
   */
  static errorFilesOnly(): LogMode {
    return {
      kind: "error-files-only",
      implicitSilent: true,
    };
  }
}

/**
 * CI-specialized logger with multiple output modes and BreakdownLogger integration.
 *
 * Provides comprehensive logging capabilities for CI pipeline execution,
 * including stage tracking, error reporting, and performance metrics.
 *
 * @example
 * ```typescript
 * import { CILogger, LogModeFactory } from "@aidevtool/ci";
 *
 * // Create logger with debug mode
 * const mode = LogModeFactory.debug("high", "M", "CI_DEBUG");
 * const loggerResult = CILogger.create(mode);
 *
 * if (loggerResult.ok) {
 *   const logger = loggerResult.data;
 *   logger.logInfo("Starting CI process");
 *   logger.logStageStart({
 *     kind: "type-check",
 *     files: ["src/main.ts"],
 *     optimized: true,
 *     hierarchy: null
 *   });
 * }
 * ```
 */
export class CILogger {
  private readonly breakdownLogger?: BreakdownLogger;

  private constructor(
    private readonly mode: LogMode,
  ) {
    // Create BreakdownLogger instance for debug mode
    if (mode.kind === "debug") {
      this.breakdownLogger = new BreakdownLogger();
    }
  }

  /**
   * Create CILogger instance with the specified mode.
   *
   * @param mode - Log mode configuration
   * @returns Result containing CILogger instance or validation error
   */
  static create(
    mode: LogMode,
  ): Result<CILogger, ValidationError & { message: string }> {
    // Validate debug mode configuration
    if (mode.kind === "debug" && !mode.breakdownLoggerEnv) {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "BreakdownLoggerEnv configuration is required for debug mode"),
      };
    }

    return { ok: true, data: new CILogger(mode) };
  }

  /**
   * Setup BreakdownLogger environment variables for debug mode.
   */
  setupBreakdownLogger(): void {
    if (this.mode.kind === "debug" && this.mode.breakdownLoggerEnv) {
      this.mode.breakdownLoggerEnv.setEnvironmentVariables();
    }
  }

  // === Core Logging Methods per Architecture Design ===

  /**
   * Log general information message.
   */
  logInfo(message: string): void {
    if (this.mode.kind === "silent" || this.mode.kind === "error-files-only") {
      return;
    }

    switch (this.mode.kind) {
      case "normal":
        console.log(message);
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.info(message);
        } else {
          console.log(`[INFO] ${message}`);
        }
        break;
    }
  }

  /**
   * Log debug information for detailed tracing.
   */
  logDebug(message: string, details?: Record<string, unknown>): void {
    if (this.mode.kind !== "debug") return;

    if (this.breakdownLogger) {
      this.breakdownLogger.debug(message, details);
    } else {
      console.log(`[DEBUG] ${message}`);
      if (details) {
        console.log(JSON.stringify(details, null, 2));
      }
    }
  }

  /**
   * Log error information.
   */
  logError(message: string, error?: unknown): void {
    const errorStr = error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);

    switch (this.mode.kind) {
      case "normal":
      case "silent":
        console.error(`❌ ${message}`);
        if (errorStr) {
          console.error(`   ${errorStr}`);
        }
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.error(`${message}: ${errorStr}`);
        } else {
          console.error(`[ERROR] ${message}: ${errorStr}`);
        }
        break;
      case "error-files-only":
        console.error(`${message}: ${errorStr}`);
        break;
    }
  }

  /**
   * Log CI stage start per architecture design.
   */
  logStageStart(stage: CIStage): void {
    if (this.mode.kind === "silent" || this.mode.kind === "error-files-only") {
      return;
    }

    const stageName = this.getStageName(stage);
    const commandInfo = this.getCommandInfo(stage);

    switch (this.mode.kind) {
      case "normal":
        console.log(`\n🔄 Starting ${stageName}...`);
        if (commandInfo) {
          console.log(`   └─ ${commandInfo}`);
        }
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.info(`Starting ${stageName}`);
          if (commandInfo) {
            this.breakdownLogger.debug(`Command: ${commandInfo}`);
          }
        } else {
          console.log(`\n[DEBUG] Starting ${stageName}...`);
          if (commandInfo) {
            console.log(`   └─ ${commandInfo}`);
          }
        }
        this.logStageDetails(stage);
        break;
    }
  }

  /**
   * Log CI stage completion per architecture design.
   */
  logStageComplete(result: StageResult): void {
    const stageName = this.getStageName(result.stage);

    switch (result.kind) {
      case "success":
        this.logSuccess(stageName, result.duration, result.testSummary);
        break;
      case "failure":
        this.logFailure(stageName, result.error);
        break;
      case "skipped":
        this.logSkipped(stageName, result.reason);
        break;
    }
  }

  /**
   * Log progress indicator per architecture design.
   */
  logProgress(indicator: ProgressIndicator | EnhancedProgressIndicator): void {
    if (this.mode.kind === "silent") {
      return;
    }

    // Check if it's the enhanced indicator
    const isEnhanced = "stageNumber" in indicator && "totalStages" in indicator;

    let progressMsg: string;

    if (isEnhanced) {
      const enhanced = indicator as EnhancedProgressIndicator;

      // Enhanced format: Stage X/Y: Stage Name | Files: N/M (P%) | Duration: Xs | Errors: E
      const stageInfo =
        `Stage ${enhanced.stageNumber}/${enhanced.totalStages}: ${enhanced.currentStage}`;

      let progressDetails = "";
      if (enhanced.totalStageFiles > 0) {
        const percentage = enhanced.totalStageFiles > 0
          ? Math.round((enhanced.currentStageFiles / enhanced.totalStageFiles) * 100)
          : 0;
        progressDetails =
          ` | Files: ${enhanced.currentStageFiles}/${enhanced.totalStageFiles} (${percentage}%)`;
      }

      let durationInfo = "";
      if (enhanced.stageDuration) {
        durationInfo = ` | Duration: ${(enhanced.stageDuration / 1000).toFixed(2)}s`;
      }

      let errorInfo = "";
      if (enhanced.errorFiles > 0) {
        errorInfo = ` | Errors: ${enhanced.errorFiles}`;
      }

      let fallbackInfo = "";
      if (enhanced.isFallback && enhanced.fallbackMessage) {
        fallbackInfo = ` (${enhanced.fallbackMessage})`;
      }

      progressMsg = `📊 ${stageInfo}${fallbackInfo}${progressDetails}${durationInfo}${errorInfo}`;
    } else {
      // Legacy format for backward compatibility
      const legacy = indicator as ProgressIndicator;
      const percentage = legacy.totalFiles > 0
        ? Math.round((legacy.processedFiles / legacy.totalFiles) * 100)
        : 0;

      progressMsg =
        `📊 Progress: ${legacy.processedFiles}/${legacy.totalFiles} files (${percentage}%) | ` +
        `Stage: ${legacy.currentStage} | Errors: ${legacy.errorFiles}`;
    }

    if (indicator.isFallback && indicator.fallbackMessage && !isEnhanced) {
      const fallbackMsg = `🔄 ${indicator.fallbackMessage}`;
      this.logInfo(fallbackMsg);
    }

    switch (this.mode.kind) {
      case "normal":
        console.log(progressMsg);
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.info(progressMsg);
        } else {
          console.log(`[PROGRESS] ${progressMsg}`);
        }
        break;
      case "error-files-only":
        if (indicator.errorFiles > 0) {
          const totalFiles = isEnhanced
            ? (indicator as EnhancedProgressIndicator).totalStageFiles
            : (indicator as ProgressIndicator).totalFiles;
          console.log(`Errors: ${indicator.errorFiles}/${totalFiles} files`);
        }
        break;
    }
  }

  /**
   * Print summary statistics per architecture design.
   */
  printSummary(stats: CISummaryStats): void {
    if (this.mode.kind === "error-files-only") {
      // Only show error file information
      if (stats.files.fileInfoLines.length > 0) {
        console.log("\n❌ Files with errors:");
        stats.files.fileInfoLines.forEach((line) => console.log(`   ${line}`));
      }
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("📋 CI EXECUTION SUMMARY");
    console.log("=".repeat(60));

    // Stages summary
    console.log(`📊 Stages: ${stats.stages.successful}/${stats.stages.total} successful`);
    if (stats.stages.failed > 0) {
      console.log(`❌ Failed stages: ${stats.stages.failed}`);
    }
    if (stats.stages.skipped > 0) {
      console.log(`⏭️  Skipped stages: ${stats.stages.skipped}`);
    }

    // Files summary
    console.log(`📁 Files processed: ${stats.files.totalChecked}`);
    console.log(`   ├─ Test files: ${stats.files.testFiles}`);
    console.log(`   ├─ Type check files: ${stats.files.typeCheckFiles}`);
    console.log(`   ├─ Lint files: ${stats.files.lintFiles}`);
    console.log(`   └─ Format files: ${stats.files.formatFiles}`);

    // Tests summary
    if (stats.tests.totalTests > 0) {
      console.log(`🧪 Tests: ${stats.tests.passedTests}/${stats.tests.totalTests} passed`);
      if (stats.tests.failedTests > 0) {
        console.log(`❌ Failed tests: ${stats.tests.failedTests}`);
      }
      if (stats.tests.skippedTests > 0) {
        console.log(`⏭️  Skipped tests: ${stats.tests.skippedTests}`);
      }
    }

    // Timing summary
    console.log(`⏱️  Total time: ${(stats.timing.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   ├─ Average stage time: ${(stats.timing.averageStageTime / 1000).toFixed(2)}s`);
    console.log(
      `   └─ Longest stage: ${stats.timing.longestStage} (${
        (stats.timing.longestStageDuration / 1000).toFixed(2)
      }s)`,
    );

    console.log("=".repeat(60));
  }

  /**
   * Legacy compatibility method for existing code.
   */
  logSummary(
    totalStages: number,
    successStages: number,
    _failedStages: number,
    totalDuration: number,
    stats?: CISummaryStats,
  ): void {
    if (stats) {
      this.printSummary(stats);
    } else {
      // Simple summary for legacy calls
      console.log("\n" + "=".repeat(40));
      console.log("CI Summary");
      console.log("=".repeat(40));
      console.log(`Stages: ${successStages}/${totalStages} successful`);
      console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
      console.log("=".repeat(40));
    }
  }

  // === Private Helper Methods ===

  private getStageName(stage: CIStage): string {
    switch (stage.kind) {
      case "lockfile-init":
        return "Lockfile Initialization";
      case "type-check":
        return "Type Check";
      case "jsr-check":
        return "JSR Check";
      case "test-execution":
        return "Test Execution";
      case "lint-check":
        return "Lint Check";
      case "format-check":
        return "Format Check";
    }
  }

  private getCommandInfo(stage: CIStage): string | null {
    switch (stage.kind) {
      case "lockfile-init":
        return "deno cache deps.ts";
      case "type-check":
        return stage.hierarchy ? `deno check ${stage.hierarchy}` : "deno check";
      case "jsr-check":
        return "deno publish --dry-run";
      case "test-execution":
        return stage.hierarchy ? `deno test ${stage.hierarchy}` : "deno test";
      case "lint-check":
        return stage.hierarchy ? `deno lint ${stage.hierarchy}` : "deno lint";
      case "format-check":
        return stage.hierarchy ? `deno fmt --check ${stage.hierarchy}` : "deno fmt --check";
    }
  }

  private logStageDetails(stage: CIStage): void {
    if (this.mode.kind !== "debug") return;

    const details: Record<string, unknown> = {
      stage: stage.kind,
    };

    // Add hierarchy for stages that have it
    if ("hierarchy" in stage) {
      details.hierarchy = stage.hierarchy;
    }

    // Add files for stages that have them
    if ("files" in stage && Array.isArray(stage.files) && stage.files.length > 0) {
      details.files = stage.files.slice(0, 5); // Show first 5 files
      if (stage.files.length > 5) {
        details.additionalFiles = stage.files.length - 5;
      }
    }

    this.logDebug("Stage details", details);
  }

  private logSuccess(stageName: string, duration?: number, testSummary?: string): void {
    const durationStr = duration ? ` (${(duration / 1000).toFixed(2)}s)` : "";

    switch (this.mode.kind) {
      case "normal":
        console.log(`✅ ${stageName} completed${durationStr}`);
        if (testSummary) {
          console.log(`   ${testSummary}`);
        }
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.info(`${stageName} completed${durationStr}`);
          if (testSummary) {
            this.breakdownLogger.info(`Test summary: ${testSummary}`);
          }
        }
        break;
      case "silent":
      case "error-files-only":
        // Don't log success in silent modes
        break;
    }
  }

  private logFailure(stageName: string, error: string): void {
    switch (this.mode.kind) {
      case "normal":
      case "silent":
        console.error(`❌ ${stageName} failed`);
        console.error(`   ${error}`);
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.error(`${stageName} failed: ${error}`);
        }
        break;
      case "error-files-only":
        console.error(`${stageName}: ${error}`);
        break;
    }
  }

  private logSkipped(stageName: string, reason: string): void {
    switch (this.mode.kind) {
      case "normal":
        console.log(`⏭️  ${stageName} skipped: ${reason}`);
        break;
      case "debug":
        if (this.breakdownLogger) {
          this.breakdownLogger.info(`${stageName} skipped: ${reason}`);
        }
        break;
      case "silent":
      case "error-files-only":
        // Don't log skipped in silent modes
        break;
    }
  }
}
