/**
 * Deno Local CI - Logger Service
 *
 * ログ出力とBreakdownLogger統合の責務
 * 段階的ログレベルとエラーファイル表示
 */

import { BreakdownLogger, LogLevel } from "@tettuan/breakdownlogger";
import {
  BreakdownLoggerEnvConfig,
  CIError,
  CIStage,
  createError,
  LogMode,
  Result,
  StageResult,
  ValidationError,
} from "./types.ts";

/**
 * CI専用ロガー
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

      // BreakdownLoggerのログレベルを設定
      if (this.breakdownLogger) {
        this.breakdownLogger.setLogLevel(LogLevel.DEBUG);
      }
    }
  }

  /**
   * CI段階開始ログ
   */
  logStageStart(stage: CIStage): void {
    if (this.mode.kind === "silent") return;

    const stageName = this.getStageName(stage);

    switch (this.mode.kind) {
      case "normal":
        console.log(`\nStarting ${stageName}...`);
        break;
      case "debug":
        console.log(`\n[DEBUG] Starting ${stageName}...`);
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

    console.log("\nFiles with errors:");
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
   * 最終サマリーログ
   */
  logSummary(
    totalStages: number,
    successStages: number,
    failedStages: number,
    totalDuration: number,
  ): void {
    if (this.mode.kind === "error-files-only") return;

    console.log("\n" + "=".repeat(50));
    console.log("CI Execution Summary");
    console.log("=".repeat(50));
    console.log(`Total stages: ${totalStages}`);
    console.log(`Successful: ${successStages}`);
    console.log(`Failed: ${failedStages}`);
    console.log(`Total duration: ${this.formatDuration(totalDuration)}`);

    if (failedStages === 0) {
      console.log("\nAll CI stages completed successfully!");
    } else {
      console.log(`\nCI failed with ${failedStages} error(s)`);
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
   * エラーログ
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

  private logStageDetails(stage: CIStage): void {
    switch (stage.kind) {
      case "type-check":
        console.log(`   Files: ${stage.files.length}`);
        console.log(`   Optimized: ${stage.optimized}`);
        break;
      case "test-execution":
        console.log(`   Strategy: ${stage.strategy.mode.kind}`);
        console.log(`   Fallback: ${stage.strategy.fallbackEnabled}`);
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
    switch (error.kind) {
      case "TypeCheckError":
      case "TestFailure":
      case "FormatError":
      case "LintError":
        return error.files;
      case "JSRError":
      case "ConfigurationError":
      case "FileSystemError":
        return [];
    }
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
