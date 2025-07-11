/**
 * Deno Local CI - Types Test
 *
 * 型定義とSmart Constructorのテスト
 * 全域性原則に基づく型安全性の検証
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  BreakdownLoggerEnvConfig,
  createError,
  type ExecutionMode,
  ExecutionStrategy,
  type ValidationError,
} from "./types.ts";

Deno.test("ExecutionStrategy - valid batch mode creation", () => {
  const mode: ExecutionMode = {
    kind: "batch",
    batchSize: 25,
    failedBatchOnly: false,
    hierarchy: null,
  };
  const result = ExecutionStrategy.create(mode, true);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mode.kind, "batch");
    assertEquals(result.data.fallbackEnabled, true);
  }
});

Deno.test("ExecutionStrategy - invalid batch size (too small)", () => {
  const mode: ExecutionMode = {
    kind: "batch",
    batchSize: 0,
    failedBatchOnly: false,
    hierarchy: null,
  };
  const result = ExecutionStrategy.create(mode, true);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.kind === "OutOfRange") {
    assertEquals(result.error.kind, "OutOfRange");
    assertEquals(result.error.value, 0);
  }
});

Deno.test("ExecutionStrategy - invalid batch size (too large)", () => {
  const mode: ExecutionMode = {
    kind: "batch",
    batchSize: 101,
    failedBatchOnly: false,
    hierarchy: null,
  };
  const result = ExecutionStrategy.create(mode, true);

  assertEquals(result.ok, false);
  if (!result.ok && result.error.kind === "OutOfRange") {
    assertEquals(result.error.kind, "OutOfRange");
    assertEquals(result.error.value, 101);
  }
});

Deno.test("ExecutionStrategy - fallback mode progression", () => {
  // All → Batch
  const allMode: ExecutionMode = { kind: "all", projectDirectories: ["."], hierarchy: null };
  const allStrategy = ExecutionStrategy.create(allMode, true);

  if (allStrategy.ok) {
    const nextMode = allStrategy.data.getNextFallbackMode();
    assertExists(nextMode);
    assertEquals(nextMode!.kind, "batch");
    if (nextMode!.kind === "batch") {
      assertEquals(nextMode.batchSize, 25);
    }
  }

  // Batch → Single-file
  const batchMode: ExecutionMode = {
    kind: "batch",
    batchSize: 10,
    failedBatchOnly: false,
    hierarchy: null,
  };
  const batchStrategy = ExecutionStrategy.create(batchMode, true);

  if (batchStrategy.ok) {
    const nextMode = batchStrategy.data.getNextFallbackMode();
    assertExists(nextMode);
    assertEquals(nextMode!.kind, "single-file");
    if (nextMode!.kind === "single-file") {
      assertEquals(nextMode.stopOnFirstError, true);
    }
  }

  // Single-file → null (no more fallback)
  const singleMode: ExecutionMode = {
    kind: "single-file",
    stopOnFirstError: true,
    hierarchy: null,
  };
  const singleStrategy = ExecutionStrategy.create(singleMode, true);

  if (singleStrategy.ok) {
    const nextMode = singleStrategy.data.getNextFallbackMode();
    assertEquals(nextMode, null);
  }
});

Deno.test("BreakdownLoggerEnvConfig - valid configuration", () => {
  const result = BreakdownLoggerEnvConfig.create("M", "CI_TEST");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.logLength, "M");
    assertEquals(result.data.logKey, "CI_TEST");
  }
});

Deno.test("BreakdownLoggerEnvConfig - invalid log length", () => {
  const result = BreakdownLoggerEnvConfig.create("X", "CI_TEST");

  assertEquals(result.ok, false);
  if (!result.ok && result.error.kind === "PatternMismatch") {
    assertEquals(result.error.kind, "PatternMismatch");
    assertEquals(result.error.value, "X");
  }
});

Deno.test("BreakdownLoggerEnvConfig - empty log key", () => {
  const result = BreakdownLoggerEnvConfig.create("L", "");

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error.kind, "EmptyInput");
  }
});

Deno.test("BreakdownLoggerEnvConfig - environment variable setting", () => {
  const result = BreakdownLoggerEnvConfig.create("W", "TEST_KEY");

  assertEquals(result.ok, true);
  if (result.ok) {
    // 環境変数設定前の状態確認
    const beforeLogLength = Deno.env.get("LOG_LENGTH");
    const beforeLogKey = Deno.env.get("LOG_KEY");

    // 環境変数設定
    result.data.setEnvironmentVariables();

    // 設定後の確認
    assertEquals(Deno.env.get("LOG_LENGTH"), "W");
    assertEquals(Deno.env.get("LOG_KEY"), "TEST_KEY");

    // クリーンアップ（元の状態に復元）
    if (beforeLogLength) {
      Deno.env.set("LOG_LENGTH", beforeLogLength);
    } else {
      Deno.env.delete("LOG_LENGTH");
    }

    if (beforeLogKey) {
      Deno.env.set("LOG_KEY", beforeLogKey);
    } else {
      Deno.env.delete("LOG_KEY");
    }
  }
});

Deno.test("createError - default message generation", () => {
  const error: ValidationError = { kind: "OutOfRange", value: 150, min: 1, max: 100 };
  const errorWithMessage = createError(error);

  assertEquals(errorWithMessage.kind, "OutOfRange");
  if (errorWithMessage.kind === "OutOfRange") {
    assertEquals(errorWithMessage.value, 150);
  }
  assertExists(errorWithMessage.message);
  assertEquals(errorWithMessage.message, "Value 150 is out of range 1-100");
});

Deno.test("createError - custom message", () => {
  const error: ValidationError = { kind: "EmptyInput" };
  const customMessage = "Custom validation error occurred";
  const errorWithMessage = createError(error, customMessage);

  assertEquals(errorWithMessage.kind, "EmptyInput");
  assertEquals(errorWithMessage.message, customMessage);
});

Deno.test("Discriminated Union - type safety", () => {
  const modes: ExecutionMode[] = [
    { kind: "all", projectDirectories: ["."], hierarchy: null },
    { kind: "batch", batchSize: 50, failedBatchOnly: true, hierarchy: null },
    { kind: "single-file", stopOnFirstError: false, hierarchy: null },
  ];

  for (const mode of modes) {
    switch (mode.kind) {
      case "all":
        assertExists(mode.projectDirectories);
        assertEquals(Array.isArray(mode.projectDirectories), true);
        break;
      case "batch":
        assertExists(mode.batchSize);
        assertEquals(typeof mode.batchSize, "number");
        assertExists(mode.failedBatchOnly);
        assertEquals(typeof mode.failedBatchOnly, "boolean");
        break;
      case "single-file":
        assertExists(mode.stopOnFirstError);
        assertEquals(typeof mode.stopOnFirstError, "boolean");
        break;
        // defaultケースが不要であることを型システムが保証
    }
  }
});
