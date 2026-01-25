/**
 * Deno Local CI - Domain Services Test
 *
 * Domain service behavior verification
 * Testing execution strategy determination, fallback processing, and error classification
 */

import { assertEquals } from "@std/assert";
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
  type StageResult,
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

Deno.test("ExecutionStrategyService - should fallback on TypeCheckError (updated logic)", () => {
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

    // TypeCheckError is now fallbackable per updated architecture
    const shouldFallback = ExecutionStrategyService.shouldFallback(strategy.data, error);
    assertEquals(shouldFallback, true);
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

// TODO(@tettuan): Implement STAGE_ORDER and getNextStage in CIPipelineOrchestrator
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

Deno.test("CIPipelineOrchestrator - should stop execution on failure", () => {
  const config: CIConfig = { stopOnFirstError: true };

  // Test failure stage result
  const failureResult: StageResult = {
    kind: "failure",
    stage: { kind: "type-check", files: [], optimized: true, hierarchy: null },
    error: "Type check failed",
    shouldStop: true,
  };

  assertEquals(CIPipelineOrchestrator.shouldStopExecution(failureResult, config), true);

  // Test success stage result
  const successResult: StageResult = {
    kind: "success",
    stage: { kind: "type-check", files: [], optimized: true, hierarchy: null },
    duration: 1000,
  };

  assertEquals(CIPipelineOrchestrator.shouldStopExecution(successResult, config), false);
});

Deno.test("CIPipelineOrchestrator - get stages with file info", () => {
  const fileInfo = {
    testFiles: ["test1.test.ts", "test2.test.ts"],
    typeCheckFiles: ["src/main.ts", "src/utils.ts"],
    allFiles: ["src/main.ts", "src/utils.ts", "test1.test.ts", "test2.test.ts"],
    projectRoot: "/project",
    hierarchy: null,
  };

  const config: CIConfig = {
    allowDirty: true,
    hierarchy: null,
  };

  const stages = CIPipelineOrchestrator.getStages(config, fileInfo);

  // Should include lockfile-init, type-check, jsr-check, test-execution, lint-check, format-check
  assertEquals(stages.length, 6);

  // Check lockfile stage
  assertEquals(stages[0].kind, "lockfile-init");

  // Check type-check stage
  assertEquals(stages[1].kind, "type-check");
  if (stages[1].kind === "type-check") {
    assertEquals(stages[1].files, fileInfo.typeCheckFiles);
  }

  // Check JSR stage (should be included when hierarchy is null)
  assertEquals(stages[2].kind, "jsr-check");

  // Check test-execution stage
  assertEquals(stages[3].kind, "test-execution");

  // Check lint stage
  assertEquals(stages[4].kind, "lint-check");

  // Check format stage
  assertEquals(stages[5].kind, "format-check");
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
