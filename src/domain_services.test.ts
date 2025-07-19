/**
 * Deno Local CI - Domain Services Test
 *
 * ドメインサービスの動作検証
 * 実行戦略決定、フォールバック処理、エラー分類のテスト
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CIPipelineOrchestrator,
  ErrorClassificationService,
  ExecutionStrategyService,
  FileClassificationService,
  StageInternalFallbackService,
} from "./domain_services.ts";

import {
  type CIConfig,
  type CIError,
  type CIStage,
  ExecutionStrategy,
  type ProcessResult,
} from "./types.ts";

Deno.test("ExecutionStrategyService - determine default strategy", () => {
  const config: CIConfig = {};
  const result = ExecutionStrategyService.determineStrategy(config);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mode.kind, "all");
    assertEquals(result.data.fallbackEnabled, true);
  }
});

Deno.test("ExecutionStrategyService - determine batch strategy", () => {
  const config: CIConfig = {
    mode: { kind: "batch", batchSize: 10, failedBatchOnly: false, hierarchy: null },
    fallbackEnabled: false,
  };
  const result = ExecutionStrategyService.determineStrategy(config);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mode.kind, "batch");
    assertEquals(result.data.fallbackEnabled, false);
  }
});

Deno.test("ExecutionStrategyService - should fallback on TestFailure", () => {
  const strategy = ExecutionStrategy.create(
    { kind: "all", projectDirectories: ["."], hierarchy: null },
    true,
  );

  if (strategy.ok) {
    const error: CIError = {
      kind: "TestFailure",
      files: ["test1.ts", "test2.ts"],
      errors: ["Test failed"],
    };

    const shouldFallback = ExecutionStrategyService.shouldFallback(strategy.data, error);
    assertEquals(shouldFallback, true);
  }
});

Deno.test("ExecutionStrategyService - should not fallback on TypeCheckError", () => {
  const strategy = ExecutionStrategy.create(
    { kind: "batch", batchSize: 25, failedBatchOnly: false, hierarchy: null },
    true,
  );

  if (strategy.ok) {
    const error: CIError = {
      kind: "TypeCheckError",
      files: ["src/main.ts"],
      details: ["Type error: ..."],
    };

    const shouldFallback = ExecutionStrategyService.shouldFallback(strategy.data, error);
    assertEquals(shouldFallback, false);
  }
});

Deno.test("StageInternalFallbackService - create fallback from all to batch", () => {
  const currentStrategy = ExecutionStrategy.create(
    { kind: "all", projectDirectories: ["."], hierarchy: null },
    true,
  );

  if (currentStrategy.ok) {
    const fallbackResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy.data,
    );

    assertEquals(fallbackResult.ok, true);
    if (fallbackResult.ok) {
      assertEquals(fallbackResult.data.mode.kind, "batch");
    }
  }
});

Deno.test("StageInternalFallbackService - create fallback from batch to single-file", () => {
  const currentStrategy = ExecutionStrategy.create(
    { kind: "batch", batchSize: 10, failedBatchOnly: false, hierarchy: null },
    true,
  );

  if (currentStrategy.ok) {
    const fallbackResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy.data,
    );

    assertEquals(fallbackResult.ok, true);
    if (fallbackResult.ok) {
      assertEquals(fallbackResult.data.mode.kind, "single-file");
    }
  }
});

Deno.test("StageInternalFallbackService - no fallback from single-file", () => {
  const currentStrategy = ExecutionStrategy.create(
    { kind: "single-file", stopOnFirstError: true, hierarchy: null },
    true,
  );

  if (currentStrategy.ok) {
    const fallbackResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy.data,
    );

    assertEquals(fallbackResult.ok, false);
    if (!fallbackResult.ok) {
      assertEquals(fallbackResult.error.kind, "EmptyInput");
    }
  }
});

Deno.test("StageInternalFallbackService - should retry with fallback for TestFailure", () => {
  const error: CIError = { kind: "TestFailure", files: [], errors: [] };
  const strategyResult = ExecutionStrategy.create({
    kind: "batch",
    batchSize: 10,
    failedBatchOnly: false,
    hierarchy: null,
  }, true);

  if (strategyResult.ok) {
    const stage: CIStage = {
      kind: "test-execution",
      strategy: strategyResult.data,
      files: ["test1.test.ts", "test2.test.ts"],
      hierarchy: null,
    };

    const shouldRetry = StageInternalFallbackService.shouldRetryWithFallback(error, stage);
    assertEquals(shouldRetry, true);
  }
});

Deno.test("ErrorClassificationService - classify type check error", () => {
  const processResult: ProcessResult = {
    success: false,
    code: 1,
    stdout: "",
    stderr: "Type error in file.ts: Cannot find name 'unknown'",
    duration: 100,
  };

  const error = ErrorClassificationService.classifyError(processResult);
  assertEquals(error.kind, "TypeCheckError");
});

Deno.test("ErrorClassificationService - classify test failure", () => {
  const processResult: ProcessResult = {
    success: false,
    code: 1,
    stdout: "",
    stderr: "Test failed: assertion error",
    duration: 200,
  };

  const error = ErrorClassificationService.classifyError(processResult);
  assertEquals(error.kind, "TestFailure");
});

Deno.test("ErrorClassificationService - classify JSR error", () => {
  const processResult: ProcessResult = {
    success: false,
    code: 1,
    stdout: "",
    stderr: "JSR publish failed: invalid package structure",
    duration: 150,
  };

  const error = ErrorClassificationService.classifyError(processResult);
  assertEquals(error.kind, "JSRError");
});

// TODO: Implement STAGE_ORDER and getNextStage in CIPipelineOrchestrator
/*
Deno.test("CIPipelineOrchestrator - stage order", () => {
  const expectedOrder = [
    "type-check",
    "jsr-check",
    "test-execution",
    "lint-check",
    "format-check",
  ];

  assertEquals(CIPipelineOrchestrator.STAGE_ORDER, expectedOrder);
});

Deno.test("CIPipelineOrchestrator - get next stage", () => {
  assertEquals(CIPipelineOrchestrator.getNextStage("type-check"), "jsr-check");
  assertEquals(CIPipelineOrchestrator.getNextStage("jsr-check"), "test-execution");
  assertEquals(CIPipelineOrchestrator.getNextStage("test-execution"), "lint-check");
  assertEquals(CIPipelineOrchestrator.getNextStage("lint-check"), "format-check");
  assertEquals(CIPipelineOrchestrator.getNextStage("format-check"), null);
});
*/

Deno.test("CIPipelineOrchestrator - should stop pipeline on any error", () => {
  const errors: CIError[] = [
    { kind: "TypeCheckError", files: [], details: [] },
    { kind: "TestFailure", files: [], errors: [] },
    { kind: "JSRError", output: "", suggestion: "" },
    { kind: "FormatError", files: [], fixCommand: "" },
    { kind: "LintError", files: [], details: [] },
  ];

  for (const error of errors) {
    assertEquals(CIPipelineOrchestrator.shouldStopPipeline(error), true);
  }
});

Deno.test("CIPipelineOrchestrator - create stages", () => {
  const files = ["src/main.ts", "src/utils.ts"];
  const strategy = ExecutionStrategy.create({
    kind: "batch",
    batchSize: 10,
    failedBatchOnly: false,
    hierarchy: null,
  }, true);

  if (strategy.ok) {
    const typeCheckStage = CIPipelineOrchestrator.createStage("type-check", files);
    assertEquals(typeCheckStage.kind, "type-check");
    if (typeCheckStage.kind === "type-check") {
      assertEquals(typeCheckStage.files, files);
    }

    const jsrStage = CIPipelineOrchestrator.createStage("jsr-check");
    assertEquals(jsrStage.kind, "jsr-check");
    if (jsrStage.kind === "jsr-check") {
      assertEquals(jsrStage.dryRun, true);
    }

    const testStage = CIPipelineOrchestrator.createStage("test-execution", [
      "test1.test.ts",
      "test2.test.ts",
    ], strategy.data);
    assertEquals(testStage.kind, "test-execution");
    if (testStage.kind === "test-execution") {
      assertExists(testStage.strategy);
      assertEquals(testStage.files.length, 2);
    }
  }
});

Deno.test("FileClassificationService - classify files correctly", () => {
  const files = [
    "src/main.ts",
    "src/utils.tsx",
    "src/types.d.ts",
    "tests/main_test.ts",
    "tests/utils.test.ts",
    "deno.json",
    "deno.lock",
    "import_map.json",
    "README.md",
  ];

  const result = FileClassificationService.classifyFiles(files);

  assertEquals(result.testFiles, ["tests/main_test.ts", "tests/utils.test.ts"]);
  assertEquals(result.typeCheckFiles, [
    "src/main.ts",
    "src/utils.tsx",
    "src/types.d.ts",
    "tests/main_test.ts",
    "tests/utils.test.ts",
  ]);
  assertEquals(result.configFiles, ["deno.json", "deno.lock", "import_map.json"]);
});
