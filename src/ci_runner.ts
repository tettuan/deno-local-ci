/**
 * # Deno Local CI - CI Runner
 *
 * The core orchestration module responsible for managing the complete CI pipeline execution.
 * Implements staged execution with intelligent fallback strategies and comprehensive error handling.
 *
 * ## Features
 * - **Pipeline Management**: Orchestrates the complete CI workflow
 * - **Execution Strategies**: Supports single-file, batch, and all execution modes
 * - **Fallback Logic**: Automatically falls back to more conservative strategies on failures
 * - **Error Classification**: Categorizes errors for appropriate handling and reporting
 * - **Performance Optimization**: Batch processing with configurable sizes
 *
 * @module
 */

import {
  CIConfig,
  CIError,
  CIStage,
  ExecutionStrategy,
  Result,
  StageResult,
  ValidationError,
} from "./types.ts";

import {
  CIPipelineOrchestrator,
  ErrorClassificationService,
  ExecutionStrategyService,
  StageInternalFallbackService,
} from "./domain_services.ts";

import { DenoCommandRunner } from "./process_runner.ts";
import { ProjectFileDiscovery } from "./file_system.ts";
import { CILogger } from "./logger.ts";

/**
 * Result of CI execution containing success status, stage results, and timing information.
 *
 * @example
 * ```typescript
 * const result = await runner.run();
 * if (result.success) {
 *   console.log(`CI completed in ${result.totalDuration}ms`);
 * } else {
 *   console.error(`CI failed: ${result.errorDetails?.message}`);
 * }
 * ```
 */
export interface CIExecutionResult {
  /** Whether the entire CI pipeline completed successfully */
  success: boolean;
  /** Results from each completed stage */
  completedStages: StageResult[];
  /** Total execution time in milliseconds */
  totalDuration: number;
  /** Error details if the CI failed */
  errorDetails?: CIError;
}

/**
 * Main CI runner class that orchestrates the complete CI pipeline.
 *
 * Manages the execution of all CI stages (type check, JSR check, test, lint, format)
 * with intelligent fallback strategies and comprehensive error handling.
 *
 * @example
 * ```typescript
 * import { CIRunner, CILogger, LogModeFactory } from "@aidevtool/ci";
 *
 * const logger = CILogger.create(LogModeFactory.normal()).data!;
 * const runnerResult = await CIRunner.create(logger, {}, "/path/to/project");
 *
 * if (runnerResult.ok) {
 *   const result = await runnerResult.data.run();
 *   console.log(result.success ? "✅ CI passed" : "❌ CI failed");
 * }
 * ```
 */
export class CIRunner {
  private readonly logger: CILogger;
  private readonly config: CIConfig;
  private readonly projectRoot: string;

  private constructor(
    logger: CILogger,
    config: CIConfig,
    projectRoot: string,
  ) {
    this.logger = logger;
    this.config = config;
    this.projectRoot = projectRoot;
  }

  /**
   * CIRunner作成
   */
  static async create(
    logger: CILogger,
    config: CIConfig,
    workingDirectory?: string,
  ): Promise<Result<CIRunner, ValidationError & { message: string }>> {
    const projectRootResult = await ProjectFileDiscovery.findProjectRoot(
      workingDirectory || Deno.cwd(),
    );

    if (!projectRootResult.ok) {
      return projectRootResult;
    }

    return {
      ok: true,
      data: new CIRunner(logger, config, projectRootResult.data),
    };
  }

  /**
   * CI全体実行
   */
  async run(): Promise<CIExecutionResult> {
    const startTime = performance.now();
    const completedStages: StageResult[] = [];

    this.logger.setupBreakdownLogger();
    this.logger.logDebug("Starting CI execution", {
      config: this.config,
      projectRoot: this.projectRoot,
    });

    try {
      // ファイル発見
      const filesResult = await this.discoverFiles();
      if (!filesResult.ok) {
        const errorStage: CIStage = { kind: "type-check", files: [], optimized: false };
        const failureResult: StageResult = {
          kind: "failure",
          stage: errorStage,
          error: filesResult.error.message,
          shouldStop: true,
        };
        completedStages.push(failureResult);

        return {
          success: false,
          completedStages,
          totalDuration: performance.now() - startTime,
          errorDetails: {
            kind: "FileSystemError",
            operation: "file_discovery",
            path: this.projectRoot,
            cause: filesResult.error.message,
          },
        };
      }

      const { testFiles, typeCheckFiles } = filesResult.data;

      // CI段階実行
      const stages = this.createStages(testFiles, typeCheckFiles);

      for (const stage of stages) {
        const stageResult = await this.executeStage(stage);
        completedStages.push(stageResult);

        if (stageResult.kind === "failure") {
          const error = ErrorClassificationService.classifyError({
            success: false,
            code: 1,
            stdout: "",
            stderr: stageResult.error,
            duration: 0,
          });

          this.logger.logErrorFiles(error);

          return {
            success: false,
            completedStages,
            totalDuration: performance.now() - startTime,
            errorDetails: error,
          };
        }
      }

      const totalDuration = performance.now() - startTime;
      this.logger.logSummary(
        completedStages.length,
        completedStages.filter((s) => s.kind === "success").length,
        completedStages.filter((s) => s.kind === "failure").length,
        totalDuration,
      );

      return {
        success: true,
        completedStages,
        totalDuration,
      };
    } catch (error) {
      const totalDuration = performance.now() - startTime;

      this.logger.logError("Unexpected error during CI execution", error);

      return {
        success: false,
        completedStages,
        totalDuration,
        errorDetails: {
          kind: "FileSystemError",
          operation: "ci_execution",
          path: this.projectRoot,
          cause: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  // === プライベートメソッド ===

  private async discoverFiles(): Promise<
    Result<{
      testFiles: string[];
      typeCheckFiles: string[];
    }, ValidationError & { message: string }>
  > {
    const testFilesResult = await ProjectFileDiscovery.findTestFiles(this.projectRoot);
    if (!testFilesResult.ok) return testFilesResult;

    const typeCheckFilesResult = await ProjectFileDiscovery.findTypeScriptFiles(
      this.projectRoot,
      false,
    );
    if (!typeCheckFilesResult.ok) return typeCheckFilesResult;

    return {
      ok: true,
      data: {
        testFiles: testFilesResult.data,
        typeCheckFiles: typeCheckFilesResult.data,
      },
    };
  }

  private createStages(testFiles: string[], typeCheckFiles: string[]): CIStage[] {
    const stages: CIStage[] = [];

    // Type Check段階
    stages.push(CIPipelineOrchestrator.createStage("type-check", typeCheckFiles));

    // JSR Check段階
    stages.push(CIPipelineOrchestrator.createStage("jsr-check"));

    // Test実行段階
    const strategyResult = ExecutionStrategyService.determineStrategy(this.config);
    if (strategyResult.ok && testFiles.length > 0) {
      stages.push(CIPipelineOrchestrator.createStage("test-execution", [], strategyResult.data));
    }

    // Lint段階
    stages.push(CIPipelineOrchestrator.createStage("lint-check", typeCheckFiles));

    // Format段階
    stages.push(CIPipelineOrchestrator.createStage("format-check", typeCheckFiles));

    return stages;
  }

  private async executeStage(stage: CIStage): Promise<StageResult> {
    const startTime = performance.now();

    this.logger.logStageStart(stage);

    try {
      switch (stage.kind) {
        case "type-check":
          return await this.executeTypeCheck(stage, startTime);
        case "jsr-check":
          return await this.executeJSRCheck(stage, startTime);
        case "test-execution":
          return await this.executeTests(stage, startTime);
        case "lint-check":
          return await this.executeLint(stage, startTime);
        case "format-check":
          return await this.executeFormat(stage, startTime);
        case "lockfile-init":
          return await this.executeLockfileInit(stage, startTime);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: StageResult = {
        kind: "failure",
        stage,
        error: errorMessage,
        shouldStop: true,
      };

      this.logger.logStageResult(result);
      return result;
    }
  }

  private async executeTypeCheck(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "type-check") {
      throw new Error("Invalid stage type for type check");
    }

    // 設定から実行戦略を決定
    const strategyResult = ExecutionStrategyService.determineStrategy(this.config);
    if (!strategyResult.ok) {
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: strategyResult.error.message || "Strategy determination failed",
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }

    const strategy = strategyResult.data;
    const result = await this.executeTypeCheckWithStrategy(strategy, stage.files);
    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok
        ? result.data.stderr
        : (String(result.error) || "Unknown error");

      // フォールバック試行
      if (strategy.fallbackEnabled) {
        // 失敗したバッチ情報を抽出（型安全に）
        let failedBatch: { startIndex: number; endIndex: number; files: string[] } | undefined;
        if ("failedBatch" in result) {
          failedBatch = result.failedBatch;
        }

        // フォールバックを試行してエラーの詳細特定を行う
        await this.attemptTypeCheckFallback(
          strategy,
          stage.files,
          errorOutput,
          failedBatch,
        );
        // フォールバックは詳細なエラー特定のみで、結果は常に失敗として扱う
      }

      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeJSRCheck(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "jsr-check") {
      throw new Error("Invalid stage type for JSR check");
    }

    const result = await DenoCommandRunner.jsrCheck({
      dryRun: stage.dryRun,
      allowDirty: stage.allowDirty || this.config.allowDirty,
    });

    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeTests(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "test-execution") {
      throw new Error("Invalid stage type for test execution");
    }

    const testFilesResult = await ProjectFileDiscovery.findTestFiles(this.projectRoot);
    if (!testFilesResult.ok) {
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: testFilesResult.error.message,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }

    const testFiles = testFilesResult.data;
    if (testFiles.length === 0) {
      const skippedResult: StageResult = {
        kind: "skipped",
        stage,
        reason: "No test files found",
      };
      this.logger.logStageResult(skippedResult);
      return skippedResult;
    }

    // 実行戦略に基づくテスト実行
    const result = await this.executeTestsWithStrategy(stage.strategy, testFiles);
    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;

      // フォールバック試行
      if (stage.strategy.fallbackEnabled) {
        // フォールバックを試行してエラーの詳細特定を行う
        await this.attemptTestFallback(
          stage.strategy,
          testFiles,
          errorOutput,
        );
        // フォールバックは詳細なエラー特定のみで、結果は常に失敗として扱う
      }

      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeTestsWithStrategy(
    strategy: ExecutionStrategy,
    testFiles: string[],
  ) {
    switch (strategy.mode.kind) {
      case "all":
        return await DenoCommandRunner.test(testFiles);

      case "batch": {
        // バッチ実行（簡略実装）
        const batchSize = strategy.mode.batchSize;
        for (let i = 0; i < testFiles.length; i += batchSize) {
          const batch = testFiles.slice(i, i + batchSize);
          const result = await DenoCommandRunner.test(batch);
          if (!result.ok || !result.data.success) {
            return result;
          }
        }
        return await DenoCommandRunner.test([]); // 成功を示す空の実行
      }

      case "single-file": {
        for (const file of testFiles) {
          const result = await DenoCommandRunner.test([file]);
          if (!result.ok || !result.data.success) {
            if (strategy.mode.stopOnFirstError) {
              return result;
            }
          }
        }
        return await DenoCommandRunner.test([]); // 成功を示す空の実行
      }
    }
  }

  private async attemptTestFallback(
    currentStrategy: ExecutionStrategy,
    testFiles: string[],
    originalError: string,
  ) {
    const fallbackStrategyResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy,
    );

    if (!fallbackStrategyResult.ok) {
      return fallbackStrategyResult;
    }

    const fallbackStrategy = fallbackStrategyResult.data;
    this.logger.logFallback(
      currentStrategy.mode.kind,
      fallbackStrategy.mode.kind,
      originalError,
    );

    return await this.executeTestsWithStrategy(fallbackStrategy, testFiles);
  }

  private async executeLint(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "lint-check") {
      throw new Error("Invalid stage type for lint check");
    }

    // 設定から実行戦略を決定
    const strategyResult = ExecutionStrategyService.determineStrategy(this.config);
    if (!strategyResult.ok) {
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: strategyResult.error.message,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }

    const strategy = strategyResult.data;
    const result = await this.executeLintWithStrategy(strategy, stage.files);
    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;

      // フォールバック試行
      if (strategy.fallbackEnabled) {
        // フォールバックを試行してエラーの詳細特定を行う
        await this.attemptLintFallback(
          strategy,
          stage.files,
          errorOutput,
        );
        // フォールバックは詳細なエラー特定のみで、結果は常に失敗として扱う
      }

      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeFormat(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "format-check") {
      throw new Error("Invalid stage type for format check");
    }

    // TypeScriptファイルを取得
    const typeCheckFilesResult = await ProjectFileDiscovery.findTypeScriptFiles(
      this.projectRoot,
      false,
    );
    if (!typeCheckFilesResult.ok) {
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: typeCheckFilesResult.error.message,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }

    // 設定から実行戦略を決定
    const strategyResult = ExecutionStrategyService.determineStrategy(this.config);
    if (!strategyResult.ok) {
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: strategyResult.error.message,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }

    const strategy = strategyResult.data;
    const result = await this.executeFormatWithStrategy(strategy, typeCheckFilesResult.data, {
      check: stage.checkOnly,
    });
    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;

      // フォールバック試行
      if (strategy.fallbackEnabled) {
        // フォールバックを試行してエラーの詳細特定を行う
        await this.attemptFormatFallback(
          strategy,
          typeCheckFilesResult.data,
          errorOutput,
          { check: stage.checkOnly },
        );
        // フォールバックは詳細なエラー特定のみで、結果は常に失敗として扱う
      }

      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeLockfileInit(stage: CIStage, startTime: number): Promise<StageResult> {
    if (stage.kind !== "lockfile-init") {
      throw new Error("Invalid stage type for lockfile init");
    }

    const result = await DenoCommandRunner.regenerateLockfile();
    const duration = performance.now() - startTime;

    if (result.ok && result.data.success) {
      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;
      const failureResult: StageResult = {
        kind: "failure",
        stage,
        error: errorOutput,
        shouldStop: true,
      };
      this.logger.logStageResult(failureResult);
      return failureResult;
    }
  }

  private async executeTypeCheckWithStrategy(
    strategy: ExecutionStrategy,
    files: string[],
  ) {
    switch (strategy.mode.kind) {
      case "all":
        return await DenoCommandRunner.typeCheck(files);

      case "batch": {
        const batchSize = strategy.mode.batchSize;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const result = await DenoCommandRunner.typeCheck(batch);
          if (!result.ok || !result.data.success) {
            // 失敗したバッチの情報を含める
            return {
              ...result,
              failedBatch: { startIndex: i, endIndex: i + batchSize - 1, files: batch },
            };
          }
        }
        return await DenoCommandRunner.typeCheck([]); // 成功を示す空の実行
      }

      case "single-file": {
        for (const file of files) {
          const result = await DenoCommandRunner.typeCheck([file]);
          if (!result.ok || !result.data.success) {
            if (strategy.mode.stopOnFirstError) {
              return result;
            }
          }
        }
        return await DenoCommandRunner.typeCheck([]); // 成功を示す空の実行
      }
    }
  }

  private async attemptTypeCheckFallback(
    currentStrategy: ExecutionStrategy,
    allFiles: string[],
    originalError: string,
    failedBatch?: { startIndex: number; endIndex: number; files: string[] },
  ) {
    const fallbackStrategyResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy,
      failedBatch,
    );

    if (!fallbackStrategyResult.ok) {
      return fallbackStrategyResult;
    }

    const fallbackStrategy = fallbackStrategyResult.data;
    this.logger.logFallback(
      currentStrategy.mode.kind,
      fallbackStrategy.mode.kind,
      originalError,
    );

    // 対象ファイルを決定
    const targetFiles = StageInternalFallbackService.extractTargetFiles(
      allFiles,
      currentStrategy,
      fallbackStrategy,
      failedBatch,
    );

    return await this.executeTypeCheckWithStrategy(fallbackStrategy, targetFiles);
  }

  private async executeLintWithStrategy(
    strategy: ExecutionStrategy,
    files: string[],
  ) {
    switch (strategy.mode.kind) {
      case "all":
        return await DenoCommandRunner.lint(files);

      case "batch": {
        const batchSize = strategy.mode.batchSize;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const result = await DenoCommandRunner.lint(batch);
          if (!result.ok || !result.data.success) {
            const error = {
              ...result,
              failedBatch: { startIndex: i, endIndex: i + batchSize - 1, files: batch },
            };
            return error;
          }
        }
        return await DenoCommandRunner.lint([]); // 成功を示す空の実行
      }

      case "single-file": {
        for (const file of files) {
          const result = await DenoCommandRunner.lint([file]);
          if (!result.ok || !result.data.success) {
            if (strategy.mode.stopOnFirstError) {
              return result;
            }
          }
        }
        return await DenoCommandRunner.lint([]); // 成功を示す空の実行
      }
    }
  }

  private async attemptLintFallback(
    currentStrategy: ExecutionStrategy,
    files: string[],
    originalError: string,
  ) {
    const fallbackStrategyResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy,
    );

    if (!fallbackStrategyResult.ok) {
      return fallbackStrategyResult;
    }

    const fallbackStrategy = fallbackStrategyResult.data;
    this.logger.logFallback(
      currentStrategy.mode.kind,
      fallbackStrategy.mode.kind,
      originalError,
    );

    return await this.executeLintWithStrategy(fallbackStrategy, files);
  }

  private async executeFormatWithStrategy(
    strategy: ExecutionStrategy,
    files: string[],
    options: { check?: boolean },
  ) {
    switch (strategy.mode.kind) {
      case "all":
        return await DenoCommandRunner.format(files, options);

      case "batch": {
        const batchSize = strategy.mode.batchSize;
        for (let i = 0; i < files.length; i += batchSize) {
          const batch = files.slice(i, i + batchSize);
          const result = await DenoCommandRunner.format(batch, options);
          if (!result.ok || !result.data.success) {
            const error = {
              ...result,
              failedBatch: { startIndex: i, endIndex: i + batchSize - 1, files: batch },
            };
            return error;
          }
        }
        return await DenoCommandRunner.format([], options); // 成功を示す空の実行
      }

      case "single-file": {
        for (const file of files) {
          const result = await DenoCommandRunner.format([file], options);
          if (!result.ok || !result.data.success) {
            if (strategy.mode.stopOnFirstError) {
              return result;
            }
          }
        }
        return await DenoCommandRunner.format([], options); // 成功を示す空の実行
      }
    }
  }

  private async attemptFormatFallback(
    currentStrategy: ExecutionStrategy,
    files: string[],
    originalError: string,
    options: { check?: boolean },
  ) {
    const fallbackStrategyResult = StageInternalFallbackService.createFallbackStrategy(
      currentStrategy,
    );

    if (!fallbackStrategyResult.ok) {
      return fallbackStrategyResult;
    }

    const fallbackStrategy = fallbackStrategyResult.data;
    this.logger.logFallback(
      currentStrategy.mode.kind,
      fallbackStrategy.mode.kind,
      originalError,
    );

    return await this.executeFormatWithStrategy(fallbackStrategy, files, options);
  }
}
