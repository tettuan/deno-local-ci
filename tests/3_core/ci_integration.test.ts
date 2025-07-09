/**
 * Deno Local CI - Core Integration Test
 *
 * CI全体の統合テスト
 * 実際のCI実行フローの検証
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { CIRunner } from "../../src/ci_runner.ts";
import { CILogger, LogModeFactory } from "../../src/logger.ts";
import { CLIParser } from "../../src/cli_parser.ts";

Deno.test("CI Runner - create and initialize", async () => {
  const mode = LogModeFactory.silent(); // テスト中は静かに
  const loggerResult = CILogger.create(mode);

  assertEquals(loggerResult.ok, true);

  if (loggerResult.ok) {
    const logger = loggerResult.data;

    // 現在のプロジェクトディレクトリでCIRunner作成
    const runnerResult = await CIRunner.create(logger, {}, Deno.cwd());

    assertEquals(runnerResult.ok, true);
    if (runnerResult.ok) {
      assertExists(runnerResult.data);
    }
  }
});

Deno.test("CI Runner - execute with silent mode", async () => {
  const mode = LogModeFactory.silent();
  const loggerResult = CILogger.create(mode);

  if (loggerResult.ok) {
    const logger = loggerResult.data;
    const runnerResult = await CIRunner.create(logger, {
      mode: { kind: "single-file", stopOnFirstError: true },
      fallbackEnabled: false,
    }, Deno.cwd());

    if (runnerResult.ok) {
      const runner = runnerResult.data;

      // CI実行（このプロジェクト自体に対して）
      const result = await runner.run();

      // 結果の基本検証
      assertExists(result);
      assertExists(result.completedStages);
      assertEquals(typeof result.success, "boolean");
      assertEquals(typeof result.totalDuration, "number");

      // 何らかの段階が実行されていることを確認
      assertEquals(result.completedStages.length > 0, true);
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

Deno.test("Full CI Pipeline - end to end", async () => {
  // CLIパース → 設定構築 → ロガー作成 → CI実行
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
          const result = await runner.run();

          // エンドツーエンドテストの検証
          assertExists(result);
          assertEquals(typeof result.success, "boolean");
          assertEquals(Array.isArray(result.completedStages), true);

          // CI段階が順次実行されていることを確認
          if (result.completedStages.length > 0) {
            const stages = result.completedStages.map((s) => s.stage.kind);

            // 最初の段階は type-check であるべき
            assertEquals(stages[0], "type-check");

            // 段階が順序通りであることを確認
            const expectedOrder = [
              "type-check",
              "jsr-check",
              "test-execution",
              "lint-check",
              "format-check",
            ];
            for (let i = 0; i < stages.length - 1; i++) {
              const currentIndex = expectedOrder.indexOf(stages[i]);
              const nextIndex = expectedOrder.indexOf(stages[i + 1]);

              // 次の段階が順序通りであることを確認
              assertEquals(nextIndex > currentIndex, true);
            }
          }
        }
      }
    }
  }
});
