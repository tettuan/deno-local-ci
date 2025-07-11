/**
 * Deno Local CI - Logger Test
 *
 * ログ出力機能のテスト
 * 各ログモードとBreakdownLogger統合の検証
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
  // LogModeのdebugモードでは常にbreakdownLoggerEnvが必要
  const breakdownResult = BreakdownLoggerEnvConfig.create("L", "TEST");

  if (breakdownResult.ok) {
    const mode = LogModeFactory.debug(breakdownResult.data);

    // breakdownConfig無しでCILoggerを作成してエラーテスト
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

    // テスト用のCI段階
    const stage: CIStage = {
      kind: "type-check",
      files: ["src/main.ts", "src/utils.ts"],
      optimized: true,
      hierarchy: null,
    };

    // ログ出力テスト（実際の出力は目視確認用）
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

    // エラーファイル表示テスト
    logger.logErrorFiles(error);
  }
});

Deno.test("CILogger - log fallback", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // フォールバック通知テスト
    logger.logFallback("all", "batch", "All mode failed due to test errors");
  }
});

Deno.test("CILogger - log summary", () => {
  const mode = LogModeFactory.normal();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // サマリー表示テスト
    logger.logSummary(5, 3, 2, 45000);
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

    // サイレントモードでは開始ログは出力されない
    logger.logStageStart(stage);

    // エラーログは出力される
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

    // エラーファイルのみモードではファイル一覧のみ表示
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

      // 環境変数設定前の保存
      const originalLogLength = Deno.env.get("LOG_LENGTH");
      const originalLogKey = Deno.env.get("LOG_KEY");

      // BreakdownLogger環境変数設定
      logger.setupBreakdownLogger();

      // 設定確認
      assertEquals(Deno.env.get("LOG_LENGTH"), "W");
      assertEquals(Deno.env.get("LOG_KEY"), "CI_DEBUG");

      // デバッグログテスト
      logger.logDebug("Debug information", { test: "data" });

      // 環境変数復元
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

    // 警告ログテスト
    logger.logWarning("This is a warning message");

    // エラーログテスト
    logger.logError("This is an error message");

    // デバッグ付きエラーログテスト
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

      // 環境変数設定前の保存
      const originalLogLength = Deno.env.get("LOG_LENGTH");
      const originalLogKey = Deno.env.get("LOG_KEY");

      try {
        // BreakdownLogger環境変数設定
        logger.setupBreakdownLogger();

        // 設定確認
        assertEquals(Deno.env.get("LOG_LENGTH"), "L");
        assertEquals(Deno.env.get("LOG_KEY"), "CI_BREAKDOWN_TEST");

        // BreakdownLoggerを使用したログテスト
        // 出力は実際にBreakdownLoggerによってタイムスタンプ付きで表示される
        logger.logDebug("BreakdownLogger integration test");
        logger.logWarning("BreakdownLogger warning test");
        logger.logError("BreakdownLogger error test");
      } finally {
        // クリーンアップ（元の状態に復元）
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
