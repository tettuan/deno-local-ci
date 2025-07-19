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
  CIError,
  CIStage,
  CISummaryStats,
  createError,
  LogMode,
  Result,
  StageResult,
  ValidationError,
} from "./types.ts";

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
 * const mode = LogModeFactory.debug();
 * const config = { key: "CI_DEBUG", length: "M" };
 * const loggerResult = CILogger.create(mode, config);
 *
 * if (loggerResult.ok) {
 *   const logger = loggerResult.data;
 *   logger.logInfo("Starting CI process");
 *   logger.logStageStart({
 *     kind: "type-check",
 *     files: ["src/main.ts"],
 *     optimized: true
 *   });
 * }
 * ```
 */
export class CILogger {
  private readonly breakdownLogger?: BreakdownLogger;

  private constructor(
    private readonly mode: LogMode,
    private readonly breakdownConfig?: BreakdownLoggerEnvConfig,
  ) {
    // DebugモードでBreakdownLoggerインスタンスを作成
    if (mode.kind === "debug" && breakdownConfig) {
      this.breakdownLogger = new BreakdownLogger();
    }
  }

  static create(
    mode: LogMode,
    breakdownConfig?: BreakdownLoggerEnvConfig,
  ): Result<CILogger, ValidationError & { message: string }> {
    // DebugモードでBreakdownLoggerが必要な場合の検証
    if (mode.kind === "debug" && !breakdownConfig) {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "BreakdownLoggerEnvConfig is required for debug mode"),
      };
    }

    return { ok: true, data: new CILogger(mode, breakdownConfig) };
  }

  /**
   * BreakdownLogger環境変数設定
   */
  setupBreakdownLogger(): void {
    if (this.mode.kind === "debug" && this.breakdownConfig) {
      this.breakdownConfig.setEnvironmentVariables();

      // BreakdownLogger v1.0.x では環境変数でログレベルを制御
      // setLogLevel メソッドは削除されました
    }
  }

  /**
   * CI段階開始ログ
   */
  logStageStart(stage: CIStage): void {
    if (this.mode.kind === "silent") return;

    const stageName = this.getStageName(stage);
    const commandInfo = this.getCommandInfo(stage);

    switch (this.mode.kind) {
      case "normal":
        console.log(`\nStarting ${stageName}...`);
        if (commandInfo) {
          console.log(`└─ ${commandInfo}`);
        }
        break;
      case "debug":
        console.log(`\n[DEBUG] Starting ${stageName}...`);
        if (commandInfo) {
          console.log(`└─ ${commandInfo}`);
        }
        this.logStageDetails(stage);
        break;
      case "error-files-only":
        // 開始ログは表示しない
        break;
    }
  }

  /**
   * CI段階結果ログ
   */
  logStageResult(result: StageResult): void {
    const stageName = this.getStageName(result.stage);

    switch (result.kind) {
      case "success":
        this.logSuccess(stageName, result.duration);
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
   * エラーファイル一覧表示
   */
  logErrorFiles(error: CIError): void {
    if (this.mode.kind === "silent") return;

    const files = this.extractErrorFiles(error);
    if (files.length === 0) return;

    if (this.mode.kind === "error-files-only") {
      // エラーファイルのみ表示
      console.log("Error files:");
      files.forEach((file) => console.log(`  - ${file}`));
      return;
    }

    // ファイル数の情報を追加
    const fileCountText = files.length === 1
      ? "1 file with errors"
      : `${files.length} files with errors`;

    console.log(`\n${fileCountText}:`);
    files.forEach((file, index) => {
      const prefix = index === files.length - 1 ? "  └─" : "  ├─";
      console.log(`${prefix} ${file}`);
    });
  }

  /**
   * フォールバック通知ログ
   */
  logFallback(fromMode: string, toMode: string, reason: string): void {
    if (this.mode.kind === "silent" || this.mode.kind === "error-files-only") return;

    console.log(`\nFalling back from ${fromMode} to ${toMode}`);
    console.log(`   Reason: ${reason}`);
  }

  /**
   * 最終サマリーログ（詳細統計版）
   */
  logSummary(
    totalStages: number,
    successStages: number,
    failedStages: number,
    totalDuration: number,
    stats?: CISummaryStats,
  ): void {
    if (this.mode.kind === "error-files-only" || this.mode.kind === "silent") return;

    console.log("\n" + "=".repeat(50));
    console.log("CI Execution Summary");
    console.log("=".repeat(50));
    console.log(`Total stages: ${totalStages}`);
    console.log(`Successful: ${successStages}`);
    console.log(`Failed: ${failedStages}`);
    console.log(`Total duration: ${this.formatDuration(totalDuration)}`);

    if (stats) {
      console.log("\n" + "Files Processed:");
      console.log(`📁 Total files checked: ${stats.files.totalChecked}`);
      if (stats.files.typeCheckFiles > 0) {
        console.log(`📝 TypeScript files: ${stats.files.typeCheckFiles}`);
      }
      if (stats.files.testFiles > 0) {
        console.log(`🧪 Test files: ${stats.files.testFiles}`);
      }
      if (stats.files.lintFiles > 0) {
        console.log(`🔍 Lint checked files: ${stats.files.lintFiles}`);
      }

      if (stats.tests.totalTests > 0) {
        console.log("\n" + "Test Results:");
        console.log(`🏃 Total tests run: ${stats.tests.totalTests}`);
        console.log(`✅ Passed: ${stats.tests.passedTests}`);
        if (stats.tests.failedTests > 0) {
          console.log(`❌ Failed: ${stats.tests.failedTests}`);
        }
        if (stats.tests.skippedTests > 0) {
          console.log(`⏭️ Skipped: ${stats.tests.skippedTests}`);
        }
      }

      if (stats.timing.longestStage) {
        console.log("\n" + "Performance:");
        console.log(`⏱️ Average stage time: ${this.formatDuration(stats.timing.averageStageTime)}`);
        console.log(
          `🐌 Longest stage: ${stats.timing.longestStage} (${
            this.formatDuration(stats.timing.longestStageDuration)
          })`,
        );
      }
    }

    if (failedStages === 0) {
      console.log("\n✅ All CI stages completed successfully!");
    } else {
      console.log(`\n❌ CI failed with ${failedStages} error(s)`);
    }
  }

  /**
   * デバッグ情報ログ
   */
  logDebug(message: string, data?: unknown): void {
    if (this.mode.kind !== "debug") return;

    if (this.breakdownLogger) {
      // BreakdownLoggerを使用したデバッグログ
      this.breakdownLogger.debug(message);
      if (data) {
        this.breakdownLogger.debug(JSON.stringify(data, null, 2));
      }
    } else {
      // フォールバック: 標準コンソール出力
      console.log(`[DEBUG] ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  /**
   * 警告ログ
   */
  logWarning(message: string): void {
    if (this.mode.kind === "error-files-only") return;

    if (this.breakdownLogger) {
      this.breakdownLogger.warn(message);
    } else {
      console.log(`WARNING: ${message}`);
    }
  }

  /**
   * エラーログ（silent モードでも出力）
   */
  logError(message: string, error?: unknown): void {
    if (this.breakdownLogger) {
      this.breakdownLogger.error(message);
      if (error && this.mode.kind === "debug") {
        this.breakdownLogger.error(String(error));
      }
    } else {
      console.error(`ERROR: ${message}`);
      if (error && this.mode.kind === "debug") {
        console.error(error);
      }
    }
  }

  /**
   * 情報ログ（silent モードでは出力しない）
   */
  logInfo(message: string): void {
    if (this.mode.kind === "silent") return;

    if (this.breakdownLogger) {
      this.breakdownLogger.info(message);
    } else {
      console.log(message);
    }
  }

  // === プライベートメソッド ===

  private getStageName(stage: CIStage): string {
    switch (stage.kind) {
      case "lockfile-init":
        return "Lockfile Initialization";
      case "type-check":
        return "Type Check";
      case "jsr-check":
        return "JSR Compatibility Check";
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
        return "deno cache --reload mod.ts";
      case "type-check": {
        if (stage.hierarchy) {
          return `deno check ${stage.hierarchy}`;
        }
        return stage.files.length > 0 ? `deno check <${stage.files.length} files>` : "deno check .";
      }
      case "jsr-check": {
        if (stage.hierarchy) {
          return null; // JSR check is skipped when hierarchy is specified
        }
        const jsrArgs = ["deno publish"];
        if (stage.dryRun) jsrArgs.push("--dry-run");
        if (stage.allowDirty) jsrArgs.push("--allow-dirty");
        return jsrArgs.join(" ");
      }
      case "test-execution": {
        const testArgs = ["deno test"];
        // Default permissions
        testArgs.push("--allow-read", "--allow-write", "--allow-run", "--allow-env");
        if (stage.hierarchy) {
          testArgs.push(stage.hierarchy);
        } else if (stage.files && stage.files.length > 0) {
          // 実際のテストファイルを表示
          testArgs.push(...stage.files);
        } else {
          testArgs.push("**/*test.ts");
        }
        return testArgs.join(" ");
      }
      case "lint-check": {
        if (stage.hierarchy) {
          return `deno lint ${stage.hierarchy}`;
        }
        return stage.files.length > 0 ? `deno lint <${stage.files.length} files>` : "deno lint .";
      }
      case "format-check": {
        const formatArgs = ["deno fmt"];
        if (stage.checkOnly) formatArgs.push("--check");
        if (stage.hierarchy) {
          formatArgs.push(stage.hierarchy);
        } else {
          formatArgs.push("<files>");
        }
        return formatArgs.join(" ");
      }
      default:
        return null;
    }
  }

  private logStageDetails(stage: CIStage): void {
    switch (stage.kind) {
      case "type-check":
        console.log(`   Files: ${stage.files.length}`);
        console.log(`   Optimized: ${stage.optimized}`);
        break;
      case "test-execution":
        console.log(`   Strategy: ${stage.strategy.mode.kind}`);
        console.log(`   Fallback: ${stage.strategy.fallbackEnabled}`);
        if (stage.files && stage.files.length > 0) {
          console.log(`   Test files: ${stage.files.length}`);
          stage.files.forEach((file) => console.log(`     - ${file}`));
        }
        break;
      case "jsr-check":
        console.log(`   Dry run: ${stage.dryRun}`);
        console.log(`   Allow dirty: ${stage.allowDirty}`);
        break;
      case "lint-check":
        console.log(`   Files: ${stage.files.length}`);
        break;
      case "format-check":
        console.log(`   Check only: ${stage.checkOnly}`);
        break;
      case "lockfile-init":
        console.log(`   Action: ${stage.action}`);
        break;
    }
  }

  private logSuccess(stageName: string, duration: number): void {
    if (this.mode.kind === "silent" || this.mode.kind === "error-files-only") return;

    const durationStr = this.formatDuration(duration);
    console.log(`${stageName} completed successfully (${durationStr})`);
  }

  private logFailure(stageName: string, error: string): void {
    console.log(`${stageName} failed`);

    if (this.mode.kind !== "error-files-only") {
      console.log(`   Error: ${error}`);
    }
  }

  private logSkipped(stageName: string, reason: string): void {
    if (this.mode.kind === "silent" || this.mode.kind === "error-files-only") return;

    console.log(`⏭️  ${stageName} skipped: ${reason}`);
  }

  private extractErrorFiles(error: CIError): string[] {
    let files: string[] = [];

    switch (error.kind) {
      case "TypeCheckError":
      case "TestFailure":
      case "FormatError":
      case "LintError":
        files = error.files;
        break;
      case "JSRError":
      case "ConfigurationError":
      case "FileSystemError":
        return [];
    }

    // 重複を排除してソートする
    return [...new Set(files)].sort();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
}

/**
 * 段階的ログモード作成ヘルパー
 */
export class LogModeFactory {
  static normal(): LogMode {
    return { kind: "normal", showSections: true };
  }

  static silent(): LogMode {
    return { kind: "silent", errorsOnly: true };
  }

  static errorFilesOnly(): LogMode {
    return { kind: "error-files-only", implicitSilent: true };
  }

  static debug(
    breakdownConfig: BreakdownLoggerEnvConfig,
  ): LogMode {
    return {
      kind: "debug",
      verboseLevel: "high",
      breakdownLoggerEnv: breakdownConfig,
    };
  }
}
