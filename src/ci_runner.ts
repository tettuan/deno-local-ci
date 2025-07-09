/**
 * @file ci_runner.ts
 * @description Type-safe CI runner implementing 5-stage pipeline with fallback strategy
 * Pipeline: Type Check → JSR Check → Test → Lint → Format
 */

import type {
  CIConfig,
  CIStage,
  StageResult,
  CIResult,
  TestResult,
  CIError,
  Result,
  ValidationError,
  ExecutionMode,
  LogMode,
} from "./types.ts";
import { ExecutionStrategy, BatchSize } from "./types.ts";
import { ExecutionStrategyService, ErrorClassificationService, FilePatternService, BatchProcessingService } from "./domain_services.ts";
import { ProcessRunner } from "./process_runner.ts";
import { FileSystem } from "./file_system.ts";

// =============================================================================
// Pipeline Stage Definitions - 5段階パイプライン定義
// =============================================================================

type PipelineStage = 
  | "type-check"
  | "jsr-check" 
  | "test"
  | "lint"
  | "format";

const PIPELINE_ORDER: readonly PipelineStage[] = [
  "type-check",
  "jsr-check", 
  "test",
  "lint",
  "format"
] as const;

// =============================================================================
// Type-Safe CI Runner - 5段階パイプライン実装
// =============================================================================

export class TypeSafeCIRunner {
  private currentStage: PipelineStage = "type-check";
  private executionResults: StageResult[] = [];
  private globalStrategy: ExecutionStrategy;
  private logMode: LogMode;

  private constructor(
    strategy: ExecutionStrategy,
    logMode: LogMode
  ) {
    this.globalStrategy = strategy;
    this.logMode = logMode;
  }

  static create(config: CIConfig): Result<TypeSafeCIRunner, ValidationError & { message: string }> {
    const strategyResult = ExecutionStrategyService.determineStrategy(config);
    if (!strategyResult.ok) {
      return strategyResult;
    }

    // BreakdownLogger環境変数設定
    if (config.logMode.kind === "debug") {
      config.logMode.breakdownLoggerEnv.setEnvironmentVariables();
    }

    return {
      ok: true,
      data: new TypeSafeCIRunner(strategyResult.data, config.logMode)
    };
  }

  async runPipeline(): Promise<Result<CIResult, CIError>> {
    const startTime = Date.now();
    this.log("info", "Starting 5-stage CI pipeline...");

    // 段階的実行: Type Check → JSR Check → Test → Lint → Format
    const stages: PipelineStage[] = ["type-check", "jsr-check", "test", "lint", "format"];
    
    for (const stage of stages) {
      this.currentStage = stage;
      this.log("info", `🔄 Starting stage: ${stage}`);
      
      const stageResult = await this.executeStage(stage);
      this.executionResults.push(stageResult);
      
      // エラー時は即停止（停止ルール）
      if (stageResult.kind === "failure") {
        this.log("error", `❌ Stage ${stage} failed. Pipeline stopped.`);
        return {
          ok: false,
          error: {
            kind: "TestFailure", // 一般的なパイプライン失敗として分類
            files: [],
            errors: [stageResult.error]
          }
        };
      }
      
      this.log("info", `✅ Stage ${stage} completed successfully`);
    }

    const totalDuration = Date.now() - startTime;
    this.log("info", `🎉 All pipeline stages completed in ${totalDuration}ms`);

    return {
      ok: true,
      data: this.buildCIResult(totalDuration)
    };
  }

  private async executeStage(stage: PipelineStage): Promise<StageResult> {
    const startTime = Date.now();
    
    try {
      switch (stage) {
        case "type-check":
          return await this.executeTypeCheck();
        case "jsr-check":
          return await this.executeJSRCheck();
        case "test":
          return await this.executeTests();
        case "lint":
          return await this.executeLint();
        case "format":
          return await this.executeFormat();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        kind: "failure",
        stage: this.createStageInfo(stage),
        error: String(error),
        shouldStop: true
      };
    }
  }

  // Type Check段階の実行
  private async executeTypeCheck(): Promise<StageResult> {
    this.log("info", "Executing type check...");
    const startTime = Date.now();
    
    const files = await FileSystem.findFiles(FilePatternService.getTypeCheckFilePattern(), ".");
    const result = await ProcessRunner.run("deno", ["check", ...files]);
    const duration = Date.now() - startTime;
    
    if (!result.success) {
      const error = ErrorClassificationService.classifyError(result);
      return {
        kind: "failure",
        stage: this.createStageInfo("type-check"),
        error: `Type check failed: ${error.kind}`,
        shouldStop: true
      };
    }
    
    return {
      kind: "success", 
      stage: this.createStageInfo("type-check"),
      duration
    };
  }

  // JSR Check段階の実行
  private async executeJSRCheck(): Promise<StageResult> {
    this.log("info", "Executing JSR compatibility check...");
    const startTime = Date.now();
    
    const result = await ProcessRunner.run("deno", ["publish", "--dry-run"]);
    const duration = Date.now() - startTime;
    
    if (!result.success) {
      const error = ErrorClassificationService.classifyError(result);
      return {
        kind: "failure",
        stage: this.createStageInfo("jsr-check"),
        error: `JSR check failed: ${error.kind}`,
        shouldStop: true
      };
    }
    
    return {
      kind: "success",
      stage: this.createStageInfo("jsr-check"), 
      duration
    };
  }

  // Test段階の実行（フォールバック機能付き）
  private async executeTests(): Promise<StageResult> {
    this.log("info", `Running tests with ${this.globalStrategy.getMode().kind} mode...`);
    const startTime = Date.now();
    
    const testFiles = await FileSystem.findFiles(FilePatternService.getTestFilePattern(), ".");
    let currentStrategy = this.globalStrategy;
    
    // フォールバック機能: All → Batch → Single-file
    while (true) {
      const testResult = await this.executeTestsWithStrategy(testFiles, currentStrategy);
      
      if (testResult.ok) {
        const duration = Date.now() - startTime;
        return {
          kind: "success",
          stage: this.createStageInfo("test"),
          duration
        };
      }
      
      // フォールバック判定
      if (ExecutionStrategyService.shouldFallback(currentStrategy, testResult.error)) {
        const fallbackResult = ExecutionStrategyService.createFallbackStrategy(currentStrategy);
        if (fallbackResult.ok && fallbackResult.data !== null) {
          this.log("warn", `Falling back from ${currentStrategy.getMode().kind} to ${fallbackResult.data.getMode().kind} mode`);
          currentStrategy = fallbackResult.data;
          continue;
        }
      }
      
      // フォールバック不可能な場合は失敗
      return {
        kind: "failure",
        stage: this.createStageInfo("test"),
        error: `Test execution failed: ${testResult.error.kind}`,
        shouldStop: true
      };
    }
  }

  // Lint段階の実行
  private async executeLint(): Promise<StageResult> {
    this.log("info", "Executing lint check...");
    const startTime = Date.now();
    
    const result = await ProcessRunner.run("deno", ["lint"]);
    const duration = Date.now() - startTime;
    
    if (!result.success) {
      const error = ErrorClassificationService.classifyError(result);
      return {
        kind: "failure",
        stage: this.createStageInfo("lint"),
        error: `Lint failed: ${error.kind}`,
        shouldStop: true
      };
    }
    
    return {
      kind: "success",
      stage: this.createStageInfo("lint"),
      duration
    };
  }

  // Format段階の実行
  private async executeFormat(): Promise<StageResult> {
    this.log("info", "Executing format check...");
    const startTime = Date.now();
    
    const result = await ProcessRunner.run("deno", ["fmt", "--check"]);
    const duration = Date.now() - startTime;
    
    if (!result.success) {
      const error = ErrorClassificationService.classifyError(result);
      return {
        kind: "failure",
        stage: this.createStageInfo("format"),
        error: `Format check failed: ${error.kind}`,
        shouldStop: true
      };
    }
    
    return {
      kind: "success",
      stage: this.createStageInfo("format"),
      duration
    };
  }

  // テスト実行戦略による実行
  private async executeTestsWithStrategy(
    testFiles: string[], 
    strategy: ExecutionStrategy
  ): Promise<Result<TestResult[], CIError>> {
    const mode = strategy.getMode();
    
    switch (mode.kind) {
      case "all":
        return await this.executeAllMode(testFiles, mode.projectDirectories);
      case "batch":
        return await this.executeBatchMode(testFiles, mode.batchSize, mode.failedBatchOnly);
      case "single-file":
        return await this.executeSingleFileMode(testFiles, mode.stopOnFirstError);
    }
  }

  // All モード実行
  private async executeAllMode(testFiles: string[], _projectDirectories: string[]): Promise<Result<TestResult[], CIError>> {
    this.log("info", `Running all ${testFiles.length} test files at once...`);
    
    const result = await ProcessRunner.run("deno", ["test", ...testFiles]);
    
    if (!result.success) {
      const error = ErrorClassificationService.classifyError(result);
      return { ok: false, error };
    }
    
    return { 
      ok: true, 
      data: testFiles.map(file => ({ 
        kind: "success" as const, 
        filePath: file, 
        duration: 0 
      }))
    };
  }

  // Batch モード実行
  private async executeBatchMode(
    testFiles: string[], 
    batchSize: number, 
    _failedBatchOnly: boolean
  ): Promise<Result<TestResult[], CIError>> {
    this.log("info", `Running tests in batches of ${batchSize}...`);
    
    const batches = BatchProcessingService.createBatches(testFiles, batchSize);
    const results: TestResult[] = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.log("info", `Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);
      
      const result = await ProcessRunner.run("deno", ["test", ...batch]);
      
      if (!result.success) {
        const error = ErrorClassificationService.classifyError(result);
        return { ok: false, error };
      }
      
      results.push(...batch.map(file => ({ 
        kind: "success" as const, 
        filePath: file, 
        duration: 0 
      })));
    }
    
    return { ok: true, data: results };
  }

  // Single-file モード実行
  private async executeSingleFileMode(
    testFiles: string[], 
    stopOnFirstError: boolean
  ): Promise<Result<TestResult[], CIError>> {
    this.log("info", `Running tests one by one (${testFiles.length} files)...`);
    
    const results: TestResult[] = [];
    
    for (const file of testFiles) {
      this.log("info", `Testing ${file}...`);
      
      const result = await ProcessRunner.run("deno", ["test", file]);
      
      if (!result.success) {
        const error = ErrorClassificationService.classifyError(result);
        
        results.push({ 
          kind: "failure", 
          filePath: file, 
          error: result.stderr 
        });
        
        if (stopOnFirstError) {
          return { ok: false, error };
        }
      } else {
        results.push({ 
          kind: "success", 
          filePath: file, 
          duration: 0 
        });
      }
    }
    
    return { ok: true, data: results };
  }

  // ステージ情報作成
  private createStageInfo(stage: PipelineStage): CIStage {
    switch (stage) {
      case "type-check":
        return { kind: "type-check", files: [], optimized: true };
      case "jsr-check":
        return { kind: "jsr-check", dryRun: true, allowDirty: false };
      case "test":
        return { kind: "test-execution", strategy: this.globalStrategy };
      case "lint":
        return { kind: "lint-check", files: [] };
      case "format":
        return { kind: "format-check", checkOnly: true };
    }
  }

  // CI結果構築
  private buildCIResult(totalDuration: number): CIResult {
    const errorSummary = {
      typeCheckErrors: this.extractErrors("TypeCheckError"),
      testFailures: this.extractErrors("TestFailure"),
      jsrErrors: this.extractErrors("JSRError"),
      formatErrors: this.extractErrors("FormatError"),
      lintErrors: this.extractErrors("LintError")
    };

    return {
      success: this.executionResults.every(result => result.kind === "success"),
      stages: this.executionResults,
      totalDuration,
      errorSummary
    };
  }

  // エラー抽出
  private extractErrors(errorKind: string): string[] {
    return this.executionResults
      .filter((result): result is StageResult & { kind: "failure" } => 
        result.kind === "failure" && result.error.includes(errorKind)
      )
      .map(result => result.error);
  }

  // ログ出力
  private log(level: "info" | "warn" | "error", message: string): void {
    switch (this.logMode.kind) {
      case "silent":
        if (level === "error") {
          console.error(`[ERROR] ${message}`);
        }
        break;
      case "debug":
        console.log(`[${level.toUpperCase()}] ${message}`);
        break;
      case "error-files-only":
        if (level === "error") {
          console.error(message);
        }
        break;
      case "normal":
      default:
        console.log(`[${level.toUpperCase()}] ${message}`);
        break;
    }
  }
}

// =============================================================================
// Factory Functions - 設定ベースのRunner作成
// =============================================================================

export const createCIRunner = {
  // デフォルト設定でのRunner作成
  withDefaults(): Result<TypeSafeCIRunner, ValidationError & { message: string }> {
    const batchSizeResult = BatchSize.create(25);
    if (!batchSizeResult.ok) {
      return batchSizeResult;
    }
    
    const defaultConfig: CIConfig = {
      mode: { kind: "single-file", stopOnFirstError: true },
      fallbackEnabled: true,
      batchSize: batchSizeResult.data,
      logMode: { kind: "normal", showSections: true }
    };
    
    return TypeSafeCIRunner.create(defaultConfig);
  },
  
  // カスタム設定でのRunner作成
  withConfig(config: CIConfig): Result<TypeSafeCIRunner, ValidationError & { message: string }> {
    return TypeSafeCIRunner.create(config);
  },
  
  // 実行モード指定でのRunner作成
  withMode(mode: ExecutionMode): Result<TypeSafeCIRunner, ValidationError & { message: string }> {
    const batchSizeResult = BatchSize.create(25);
    if (!batchSizeResult.ok) {
      return batchSizeResult;
    }
    
    const config: CIConfig = {
      mode,
      fallbackEnabled: true,
      batchSize: batchSizeResult.data,
      logMode: { kind: "normal", showSections: true }
    };
    
    return TypeSafeCIRunner.create(config);
  }
};
