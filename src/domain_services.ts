/**
 * Deno Local CI - Domain Services
 *
 * ドメイン駆動設計に基づくサービス層
 * 実行戦略決定、フォールバック処理、エラー分類、CI段階管理
 */

import {
  CIConfig,
  CIError,
  CIStage,
  createError,
  ExecutionMode,
  ExecutionStrategy,
  ProcessResult,
  Result,
  ValidationError,
} from "./types.ts";

/**
 * 実行戦略決定サービス
 */
export class ExecutionStrategyService {
  static determineStrategy(
    config: CIConfig,
  ): Result<ExecutionStrategy, ValidationError & { message: string }> {
    const defaultMode: ExecutionMode = {
      kind: "single-file",
      stopOnFirstError: true,
    };
    return ExecutionStrategy.create(
      config.mode ?? defaultMode,
      config.fallbackEnabled ?? true,
    );
  }

  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean {
    const fatalErrors = [
      "TypeCheckError",
      "JSRError",
      "FormatError",
      "LintError",
      "ConfigurationError",
      "FileSystemError",
    ];
    if (fatalErrors.includes(error.kind)) return false;

    return error.kind === "TestFailure" &&
      strategy.fallbackEnabled &&
      strategy.mode.kind !== "single-file";
  }
}

/**
 * 段階内フォールバック処理サービス
 */
export class StageInternalFallbackService {
  static createFallbackStrategy(
    currentStrategy: ExecutionStrategy,
    _failedBatch?: { startIndex: number; endIndex: number; files: string[] },
  ): Result<ExecutionStrategy, ValidationError & { message: string }> {
    const nextMode = currentStrategy.getNextFallbackMode();
    if (!nextMode) {
      return {
        ok: false,
        error: createError({ kind: "EmptyInput" }, "No more fallback modes available"),
      };
    }

    return ExecutionStrategy.create(nextMode, currentStrategy.fallbackEnabled);
  }

  static shouldRetryWithFallback(error: CIError, _stage: CIStage): boolean {
    // 全ての段階でフォールバックを許可
    const retryableErrors = [
      "TypeCheckError",
      "TestFailure",
      "LintError",
      "FormatError",
    ];
    return retryableErrors.includes(error.kind);
  }

  /**
   * 失敗したバッチから対象ファイルを抽出
   */
  static extractTargetFiles(
    allFiles: string[],
    currentStrategy: ExecutionStrategy,
    fallbackStrategy: ExecutionStrategy,
    failedBatch?: { startIndex: number; endIndex: number; files: string[] },
  ): string[] {
    // Batch → Single-file フォールバックの場合、失敗したバッチのファイルのみを対象とする
    if (
      currentStrategy.mode.kind === "batch" &&
      fallbackStrategy.mode.kind === "single-file" &&
      failedBatch
    ) {
      return failedBatch.files;
    }

    // All → Batch フォールバックの場合、全ファイルを対象とする
    if (
      currentStrategy.mode.kind === "all" &&
      fallbackStrategy.mode.kind === "batch"
    ) {
      return allFiles;
    }

    return allFiles;
  }
}

/**
 * エラー分類サービス
 */
export class ErrorClassificationService {
  static classifyError(result: ProcessResult): CIError {
    const stderr = result.stderr.toLowerCase();
    const stdout = result.stdout.toLowerCase();
    const combinedOutput = stderr + " " + stdout;

    if (combinedOutput.includes("type") && combinedOutput.includes("error")) {
      return {
        kind: "TypeCheckError",
        files: this.extractFileNames(result.stderr),
        details: [result.stderr],
      };
    }

    if (
      combinedOutput.includes("test") &&
      (combinedOutput.includes("failed") || combinedOutput.includes("fail"))
    ) {
      return {
        kind: "TestFailure",
        files: this.extractFileNames(result.stderr),
        errors: [result.stderr],
      };
    }

    if (combinedOutput.includes("jsr") || combinedOutput.includes("publish")) {
      return {
        kind: "JSRError",
        output: result.stderr,
        suggestion: "Check JSR compatibility and package configuration",
      };
    }

    if (combinedOutput.includes("format")) {
      return {
        kind: "FormatError",
        files: this.extractFileNames(result.stderr),
        fixCommand: "deno fmt",
      };
    }

    if (combinedOutput.includes("lint")) {
      return {
        kind: "LintError",
        files: this.extractFileNames(result.stderr),
        details: [result.stderr],
      };
    }

    return {
      kind: "FileSystemError",
      operation: "process_execution",
      path: "unknown",
      cause: result.stderr || result.stdout,
    };
  }

  private static extractFileNames(output: string): string[] {
    const filePattern = /[\w\/\-\.]+\.tsx?/g;
    const matches = output.match(filePattern) || [];
    // 重複を排除してソートする
    return [...new Set(matches)].sort();
  }
}

/**
 * CIパイプライン管理サービス
 */
export class CIPipelineOrchestrator {
  static readonly STAGE_ORDER: Array<CIStage["kind"]> = [
    "type-check",
    "jsr-check",
    "test-execution",
    "lint-check",
    "format-check",
  ];

  static getNextStage(currentStage: CIStage["kind"]): CIStage["kind"] | null {
    const currentIndex = this.STAGE_ORDER.indexOf(currentStage);
    return currentIndex >= 0 && currentIndex < this.STAGE_ORDER.length - 1
      ? this.STAGE_ORDER[currentIndex + 1]
      : null;
  }

  static shouldStopPipeline(_error: CIError): boolean {
    // すべてのエラーでパイプライン停止（要求事項に基づく）
    return true;
  }

  static createStage(
    kind: CIStage["kind"],
    files: string[] = [],
    strategy?: ExecutionStrategy,
  ): CIStage {
    switch (kind) {
      case "lockfile-init":
        return { kind: "lockfile-init", action: "regenerate" };
      case "type-check":
        return { kind: "type-check", files, optimized: true };
      case "jsr-check":
        return { kind: "jsr-check", dryRun: true, allowDirty: false };
      case "test-execution":
        if (!strategy) {
          throw new Error("ExecutionStrategy is required for test-execution stage");
        }
        return { kind: "test-execution", strategy };
      case "lint-check":
        return { kind: "lint-check", files };
      case "format-check":
        return { kind: "format-check", checkOnly: true };
    }
  }
}

/**
 * ファイル分類サービス
 */
export class FileClassificationService {
  static classifyFiles(files: string[]): {
    testFiles: string[];
    typeCheckFiles: string[];
    configFiles: string[];
  } {
    const testFiles: string[] = [];
    const typeCheckFiles: string[] = [];
    const configFiles: string[] = [];

    for (const file of files) {
      if (this.isTestFile(file)) {
        testFiles.push(file);
        // テストファイルもTypeScriptファイルとして分類
        typeCheckFiles.push(file);
      } else if (this.isTypeCheckFile(file)) {
        typeCheckFiles.push(file);
      } else if (this.isConfigFile(file)) {
        configFiles.push(file);
      }
    }

    return { testFiles, typeCheckFiles, configFiles };
  }

  private static isTestFile(filePath: string): boolean {
    return filePath.endsWith("_test.ts") || filePath.endsWith(".test.ts");
  }

  private static isTypeCheckFile(filePath: string): boolean {
    return filePath.endsWith(".ts") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".d.ts");
  }

  private static isConfigFile(filePath: string): boolean {
    const fileName = filePath.split("/").pop() || "";
    return ["deno.json", "deno.lock", "import_map.json"].includes(fileName);
  }
}
