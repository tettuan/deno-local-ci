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
  CISummaryStats,
  ExecutionStrategy,
  ProcessResult,
  ProcessResultWithBatch,
  ProgressIndicator,
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

import { DenoCommandRunner, extractTestSummaryLine } from "./process_runner.ts";
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
  /** Final progress state with file and error counts */
  progressState?: ProgressIndicator;
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

  // Statistics tracking
  private stats: {
    filesProcessed: Set<string>;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    testsSkipped: number;
  } = {
    filesProcessed: new Set(),
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsSkipped: 0,
  };

  // Progress tracking
  private progressState: {
    totalFiles: number;
    processedFiles: number;
    errorFiles: number;
    totalErrorCount: number;
    currentStage: string;
    isFallback: boolean;
    fallbackMessage?: string;
  } = {
    totalFiles: 0,
    processedFiles: 0,
    errorFiles: 0,
    totalErrorCount: 0,
    currentStage: "Initializing",
    isFallback: false,
  };

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
   * Create CIRunner instance
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
   * Execute full CI pipeline
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
      // File discovery
      const filesResult = await this.discoverFiles();
      if (!filesResult.ok) {
        const errorStage: CIStage = {
          kind: "type-check",
          files: [],
          optimized: false,
          hierarchy: null,
        };
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

      // Initialize progress state
      this.initializeProgress(testFiles, typeCheckFiles);

      // Execute CI stages
      const stages = this.createStages(testFiles, typeCheckFiles);

      for (const stage of stages) {
        // ステージ開始時の進捗更新
        this.updateProgress(this.getStageName(stage), this.progressState.processedFiles);

        const stageResult = await this.executeStage(stage);
        completedStages.push(stageResult);

        this.updateFileStats(stage); // Update statistics

        // ステージ完了時の進捗更新
        const processedFiles = this.getStageFileCount(stage);
        const errorCount = stageResult.kind === "failure"
          ? this.extractErrorCount(stageResult.error)
          : 0;

        // updateProgressで直接進捗状態を更新
        this.updateProgress(
          this.getStageName(stage),
          this.progressState.processedFiles + processedFiles,
          stageResult.kind === "failure"
            ? this.progressState.errorFiles + processedFiles
            : this.progressState.errorFiles,
          undefined,
          undefined,
          stageResult.kind === "failure"
            ? this.progressState.totalErrorCount + errorCount
            : this.progressState.totalErrorCount,
        );

        if (stageResult.kind === "failure") {
          const error = ErrorClassificationService.classifyError({
            success: false,
            code: 1,
            stdout: "",
            stderr: stageResult.error,
            duration: 0,
          });

          this.logger.logErrorFiles(error);

          // Show final failure summary with progress information
          const totalDuration = performance.now() - startTime;
          const finalProgressState: ProgressIndicator = {
            currentStage: `${this.getStageName(stage)} Failed`,
            processedFiles: this.progressState.processedFiles,
            totalFiles: this.progressState.totalFiles,
            errorFiles: this.progressState.errorFiles,
            totalErrorCount: this.progressState.totalErrorCount,
            isFallback: this.progressState.isFallback,
            fallbackMessage: this.progressState.isFallback
              ? "CI finished with errors - showing progress summary"
              : undefined,
          };

          this.logger.logProgress(finalProgressState);

          return {
            success: false,
            completedStages,
            totalDuration: totalDuration,
            errorDetails: error,
            progressState: finalProgressState,
          };
        }
      }

      const totalDuration = performance.now() - startTime;
      const summaryStats = this.generateSummaryStats(completedStages, totalDuration);

      this.logger.logSummary(
        completedStages.length,
        completedStages.filter((s) => s.kind === "success").length,
        completedStages.filter((s) => s.kind === "failure").length,
        totalDuration,
        summaryStats,
      );

      return {
        success: true,
        completedStages,
        totalDuration,
      };
    } catch (error) {
      const totalDuration = performance.now() - startTime;

      this.logger.logError("Unexpected error during CI execution", error);

      // Show final failure summary with progress information
      const finalProgressState: ProgressIndicator = {
        currentStage: "CI Execution Failed",
        processedFiles: this.progressState.processedFiles,
        totalFiles: this.progressState.totalFiles,
        errorFiles: this.progressState.errorFiles,
        totalErrorCount: this.progressState.totalErrorCount,
        isFallback: true,
        fallbackMessage: "Unexpected error occurred during CI execution",
      };

      this.logger.logProgress(finalProgressState);

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
        progressState: finalProgressState,
      };
    }
  }

  // === Private Methods ===

  private async discoverFiles(): Promise<
    Result<{
      testFiles: string[];
      typeCheckFiles: string[];
    }, ValidationError & { message: string }>
  > {
    // If hierarchy is specified, target only that hierarchy
    const targetDirectory = this.config.hierarchy ? this.config.hierarchy : this.projectRoot;

    const testFilesResult = await ProjectFileDiscovery.findTestFiles(targetDirectory);
    if (!testFilesResult.ok) return testFilesResult;

    const typeCheckFilesResult = await ProjectFileDiscovery.findTypeScriptFiles(
      targetDirectory,
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
    const hierarchy = this.config.hierarchy;

    // Type Check stage
    stages.push(
      CIPipelineOrchestrator.createStage("type-check", typeCheckFiles, undefined, hierarchy),
    );

    // JSR Check stage - skip when hierarchy is specified
    if (!hierarchy) {
      stages.push(CIPipelineOrchestrator.createStage("jsr-check", [], undefined, hierarchy));
    } else {
      this.logger.logDebug("JSR Check skipped due to hierarchy specification", { hierarchy });
    }

    // Test execution stage
    const strategyResult = ExecutionStrategyService.determineStrategy(this.config);
    if (strategyResult.ok && testFiles.length > 0) {
      // Allモードの場合は空のファイルリストを渡す（全体実行）
      const stageFiles = strategyResult.data.mode.kind === "all" ? [] : testFiles;
      stages.push(
        CIPipelineOrchestrator.createStage(
          "test-execution",
          stageFiles,
          strategyResult.data,
          hierarchy,
        ),
      );
    }

    // Lint stage
    stages.push(
      CIPipelineOrchestrator.createStage("lint-check", typeCheckFiles, undefined, hierarchy),
    );

    // Format stage
    stages.push(
      CIPipelineOrchestrator.createStage("format-check", typeCheckFiles, undefined, hierarchy),
    );

    return stages;
  }

  private async executeStage(stage: CIStage): Promise<StageResult> {
    const startTime = performance.now();

    this.logger.logStageStart(stage);

    // Update file statistics
    this.updateFileStats(stage);

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

    // Determine execution strategy from configuration
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

      // Attempt fallback
      if (strategy.fallbackEnabled) {
        // Extract failed batch information (type-safe)
        let failedBatch: { startIndex: number; endIndex: number; files: string[] } | undefined;
        if ("failedBatch" in result) {
          failedBatch = result.failedBatch;
        }

        // Attempt fallback to identify detailed errors
        await this.attemptTypeCheckFallback(
          strategy,
          stage.files,
          errorOutput,
          failedBatch,
        );
        // Fallback is only for detailed error identification, result is always treated as failure
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
      hierarchy: stage.hierarchy,
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

    // Search for test files within the hierarchy if specified
    const targetDirectory = stage.hierarchy || this.projectRoot;
    const testFilesResult = await ProjectFileDiscovery.findTestFiles(targetDirectory);
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
        reason: `No test files found in ${targetDirectory}`,
      };
      this.logger.logStageResult(skippedResult);
      return skippedResult;
    }

    // Execute tests based on strategy (including hierarchy information)
    const result = await this.executeTestsWithStrategy(stage.strategy, testFiles, stage.hierarchy);
    const duration = performance.now() - startTime;

    // Update test statistics
    if (result.ok) {
      console.log("=== UPDATING TEST STATS ===");
      console.log("Result data testStats:", result.data.testStats);
      this.updateTestStats(result.data, testFiles);
      console.log("Stats after update - testsRun:", this.stats.testsRun);
      console.log("Stats after update - testsPassed:", this.stats.testsPassed);
      console.log("Stats after update - testsFailed:", this.stats.testsFailed);
      console.log("===========================");
    }

    if (result.ok && result.data.success) {
      // テスト出力からサマリー行を抽出
      const testSummary = extractTestSummaryLine(result.data.stdout + result.data.stderr);

      const successResult: StageResult = {
        kind: "success",
        stage,
        duration,
        testSummary,
      };
      this.logger.logStageResult(successResult);
      return successResult;
    } else {
      const errorOutput = result.ok ? result.data.stderr : result.error.message;

      // Attempt fallback
      if (stage.strategy.fallbackEnabled) {
        // Extract failed batch information if available
        const failedBatch = (result.ok && "failedBatch" in result.data)
          ? (result.data as ProcessResultWithBatch).failedBatch
          : undefined;

        // Try fallback and use the result
        const fallbackResult = await this.attemptTestFallback(
          stage.strategy,
          testFiles,
          errorOutput,
          stage.hierarchy,
          failedBatch,
        );

        // フォールバック結果の詳細チェック
        if (fallbackResult.ok && fallbackResult.data.success) {
          const successResult: StageResult = {
            kind: "success",
            stage,
            duration,
          };
          this.logger.logStageResult(successResult);
          return successResult;
        } else {
          // フォールバック失敗時：詳細なエラー情報を生成
          const fallbackErrorOutput = fallbackResult.ok
            ? fallbackResult.data.stderr
            : fallbackResult.error.message;

          // エラー分類を実行してCIErrorオブジェクトを作成
          const classifiedError = ErrorClassificationService.classifyError(
            fallbackResult.ok ? fallbackResult.data : {
              success: false,
              code: 1,
              stdout: "",
              stderr: fallbackErrorOutput,
              duration: 0,
            },
          );

          // エラーファイル詳細をログに出力
          this.logger.logErrorFiles(classifiedError);

          // Show fallback failure progress
          const fallbackErrorCount = this.extractErrorCount(fallbackErrorOutput);
          const fallbackProgressState: ProgressIndicator = {
            currentStage: `${this.getStageName(stage)} Fallback Failed`,
            processedFiles: testFiles.length,
            totalFiles: this.progressState.totalFiles,
            errorFiles: testFiles.length,
            totalErrorCount: this.progressState.totalErrorCount + fallbackErrorCount,
            isFallback: true,
            fallbackMessage: "Fallback execution also failed",
          };

          this.logger.logProgress(fallbackProgressState);
        }
        // If fallback failed, continue to failure handling below
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
    hierarchy?: string | null,
  ): Promise<Result<ProcessResultWithBatch, ValidationError & { message: string }>> {
    switch (strategy.mode.kind) {
      case "all":
        this.logger.logInfo(`[ALL] Processing all tests together (no file arguments)`);
        // Allモードでは引数なしで全体実行（Denoのデフォルト動作）
        return await DenoCommandRunner.test([], { hierarchy });

      case "batch": {
        // 型安全なバッチ実行
        const batchSize = strategy.mode.batchSize;
        this.logger.logInfo(
          `[BATCH] Processing ${testFiles.length} files in batches of ${batchSize}`,
        );

        for (let i = 0; i < testFiles.length; i += batchSize) {
          const batch = testFiles.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(testFiles.length / batchSize);

          this.logger.logInfo(
            `[BATCH] Executing batch ${batchNumber}/${totalBatches}: ${batch.join(", ")}`,
          );

          // バッチ内の各ファイルを明示的に指定して実行
          const result = await DenoCommandRunner.test(batch, { hierarchy });
          if (!result.ok || !result.data.success) {
            this.logger.logInfo(`[BATCH] Batch ${batchNumber} failed`);

            // バッチ失敗時: 段階内フォールバック（Batch → Single-file）を実行
            if (strategy.fallbackEnabled) {
              const failedBatchInfo = { startIndex: i, endIndex: i + batchSize - 1, files: batch };
              const fallbackStrategyResult = StageInternalFallbackService.createFallbackStrategy(
                strategy,
                failedBatchInfo,
              );

              if (fallbackStrategyResult.ok) {
                const fallbackStrategy = fallbackStrategyResult.data;
                this.logger.logFallback(
                  strategy.mode.kind,
                  fallbackStrategy.mode.kind,
                  result.ok ? result.data.stderr : result.error.message,
                );

                // フォールバック時の進捗指標更新
                this.updateProgress(
                  "Test Execution",
                  this.progressState.processedFiles,
                  this.progressState.errorFiles,
                  true,
                  `Fallback from ${strategy.mode.kind} to ${fallbackStrategy.mode.kind}`,
                );

                // 失敗したバッチのファイルのみでフォールバック実行
                const targetFiles = StageInternalFallbackService.extractTargetFiles(
                  testFiles,
                  strategy,
                  fallbackStrategy,
                  failedBatchInfo,
                );

                const fallbackResult = await this.executeTestsWithStrategy(
                  fallbackStrategy,
                  targetFiles,
                  hierarchy,
                );
                if (fallbackResult.ok && fallbackResult.data.success) {
                  this.logger.logInfo(`[BATCH] Fallback succeeded for batch ${batchNumber}`);
                  continue; // 次のバッチに進む
                }
              }
            }

            // フォールバックが無効、または失敗した場合は失敗として返す
            if (result.ok) {
              const processResultWithBatch: ProcessResultWithBatch = {
                ...result.data,
                success: false,
                failedBatch: { startIndex: i, endIndex: i + batchSize - 1, files: batch },
              };
              return { ok: true, data: processResultWithBatch };
            } else {
              return result;
            }
          }
          this.logger.logInfo(`[BATCH] Batch ${batchNumber} completed successfully`);
        }
        this.logger.logInfo(
          `[BATCH] All ${Math.ceil(testFiles.length / batchSize)} batches processed successfully`,
        );
        return await DenoCommandRunner.test([], { hierarchy }); // 成功を示す空の実行
      }
      case "single-file": {
        // 全域性原則：各ファイルを個別実行し、エラー時はstopOnFirstErrorに従う
        this.logger.logInfo(`[SINGLE-FILE] Processing ${testFiles.length} files individually`);

        const failedFiles: Array<{ file: string; error: string }> = [];
        let firstFailureResult:
          | Result<ProcessResultWithBatch, ValidationError & { message: string }>
          | null = null;

        for (const file of testFiles) {
          this.logger.logInfo(`[SINGLE-FILE] Executing: ${file}`);
          const result = await DenoCommandRunner.test([file], { hierarchy });
          if (!result.ok || !result.data.success) {
            const errorDetails = result.ok ? result.data.stderr : result.error.message;
            failedFiles.push({ file, error: errorDetails });

            // 失敗時のみDenoの実際のテスト出力をそのまま表示
            this.logger.logInfo(`[SINGLE-FILE] Test failed for ${file}:`);
            if (result.ok) {
              // stdoutとstderrの両方を表示（Denoのテスト出力はstderrに含まれることが多い）
              if (result.data.stdout.trim()) {
                console.log(result.data.stdout);
              }
              if (result.data.stderr.trim()) {
                console.log(result.data.stderr);
              }
            } else {
              console.log(result.error.message);
            }

            if (strategy.mode.stopOnFirstError) {
              this.logger.logInfo(`[SINGLE-FILE] Stopping on first error at ${file}`);
              // 失敗ファイル情報を含むカスタム結果を作成
              firstFailureResult = result;
              break;
            }
            this.logger.logInfo(`[SINGLE-FILE] Continuing after error in ${file}`);
            // stopOnFirstError = false の場合は継続実行
          }
          // 成功時は出力を省略（ログメッセージのみ）
        }

        // エラーファイルがある場合の処理
        if (failedFiles.length > 0) {
          // 失敗したファイルの詳細をログに出力
          this.logger.logInfo(`[SINGLE-FILE] Failed files (${failedFiles.length}):`);
          for (const { file, error } of failedFiles) {
            this.logger.logInfo(`  - ${file}: ${error.split("\n")[0]}`); // 最初の行のみ表示
          }

          // stopOnFirstError=trueの場合は最初の失敗結果を返す
          if (strategy.mode.stopOnFirstError && firstFailureResult) {
            return firstFailureResult;
          }

          // stopOnFirstError=falseの場合は全失敗ファイル情報を含む失敗結果を作成
          const aggregatedError = failedFiles.map((f) => `${f.file}: ${f.error.split("\n")[0]}`)
            .join("; ");
          return {
            ok: true,
            data: {
              success: false,
              code: 1,
              stdout: "",
              stderr: aggregatedError,
              duration: 0,
              failedBatch: undefined,
            },
          };
        }

        this.logger.logInfo(
          `[SINGLE-FILE] All ${testFiles.length} files processed successfully`,
        );
        return await DenoCommandRunner.test([], { hierarchy }); // 成功を示す空の実行
      }
    }
  }

  private async attemptTestFallback(
    currentStrategy: ExecutionStrategy,
    testFiles: string[],
    originalError: string,
    hierarchy?: string | null,
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

    // フォールバック時の進捗指標更新
    this.updateProgress(
      "Test Execution",
      this.progressState.processedFiles,
      this.progressState.errorFiles,
      true,
      `Fallback from ${currentStrategy.mode.kind} to ${fallbackStrategy.mode.kind}`,
    );

    // 対象ファイルを決定: 失敗したバッチ範囲のみか全ファイルか
    const targetFiles = StageInternalFallbackService.extractTargetFiles(
      testFiles,
      currentStrategy,
      fallbackStrategy,
      failedBatch,
    );

    return await this.executeTestsWithStrategy(fallbackStrategy, targetFiles, hierarchy);
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
        this.logger.logInfo(`[TYPECHECK-ALL] Processing all ${files.length} files together`);
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

    // フォールバック時の進捗指標更新
    this.updateProgress(
      "Type Check",
      this.progressState.processedFiles,
      this.progressState.errorFiles,
      true,
      `Fallback from ${currentStrategy.mode.kind} to ${fallbackStrategy.mode.kind}`,
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

    // 対象ファイルを決定: 失敗したバッチ範囲のみか全ファイルか
    const targetFiles = StageInternalFallbackService.extractTargetFiles(
      files,
      currentStrategy,
      fallbackStrategy,
      failedBatch,
    );

    return await this.executeLintWithStrategy(fallbackStrategy, targetFiles);
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

  // === 統計情報収集メソッド ===

  /**
   * ステージ実行時にファイル統計を更新
   */
  private updateFileStats(stage: CIStage): void {
    switch (stage.kind) {
      case "type-check":
        stage.files.forEach((file) => this.stats.filesProcessed.add(file));
        break;
      case "lint-check":
        stage.files.forEach((file) => this.stats.filesProcessed.add(file));
        break;
      case "test-execution":
        // テストファイルは実行結果で更新
        break;
      case "format-check":
      case "jsr-check":
      case "lockfile-init":
        // これらはファイル数に含めない
        break;
    }
  }

  /**
   * テスト実行結果から統計を更新（実際のテスト結果解析）
   */
  private updateTestStats(result: ProcessResult, testFiles: string[]): void {
    // 実際のテスト統計が利用可能な場合はそれを使用
    if (result.testStats) {
      this.stats.testsRun = result.testStats.testsRun;
      this.stats.testsPassed = result.testStats.testsPassed;
      this.stats.testsFailed = result.testStats.testsFailed;

      // ファイル数も実際の実行結果から取得
      if (result.testStats.filesRun > 0) {
        // 実行されたファイル数が分かる場合は、テストファイルリストよりも正確
        for (let i = 0; i < result.testStats.filesRun; i++) {
          this.stats.filesProcessed.add(testFiles[i] || `unknown_test_file_${i}`);
        }
      } else {
        // フォールバック：渡されたテストファイルを使用
        testFiles.forEach((file) => this.stats.filesProcessed.add(file));
      }
    } else {
      // フォールバック：従来の推定ロジック
      testFiles.forEach((file) => this.stats.filesProcessed.add(file));

      if (result.success) {
        // 成功したテストファイル数を概算
        this.stats.testsRun += testFiles.length;
        this.stats.testsPassed += testFiles.length;
      } else {
        // 失敗したテスト統計の更新
        this.stats.testsRun += testFiles.length;
        this.stats.testsFailed += testFiles.length;
      }
    }
  }

  /**
   * サマリー統計情報を生成
   */
  private generateSummaryStats(
    completedStages: StageResult[],
    totalDuration: number,
  ): CISummaryStats {
    const successfulStages = completedStages.filter((s) => s.kind === "success");
    const failedStages = completedStages.filter((s) => s.kind === "failure");
    const skippedStages = completedStages.filter((s) => s.kind === "skipped");

    // 最も時間のかかったステージを特定
    let longestStage = "";
    let longestStageDuration = 0;

    successfulStages.forEach((stage) => {
      if (stage.duration > longestStageDuration) {
        longestStageDuration = stage.duration;
        longestStage = this.getStageName(stage.stage);
      }
    });

    // 各ステージごとにoutputLogからファイル数や実行数が記載された行全体を抽出
    function extractFileInfoLinesFromStage(stages: StageResult[], kind: string): string[] {
      const stage = stages.find((s) => s.stage.kind === kind && s.outputLog);
      if (stage && stage.outputLog) {
        // 📁 Files: ... や 📝 ... などの行をすべて抽出
        return stage.outputLog.split("\n").filter((line) =>
          /📁 Files:|📝 TypeScript files:|🧪 Test files:|🔍 Lint checked files:|Format files:/.test(
            line,
          )
        );
      }
      return [];
    }

    // ファイル数（数値）も従来通り抽出
    function extractFilesCountFromStage(stages: StageResult[], kind: string): number {
      const stage = stages.find((s) => s.stage.kind === kind && s.outputLog);
      if (stage && stage.outputLog) {
        const match = stage.outputLog.match(/📁 Files: \d+\/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
      return 0;
    }

    const typeCheckFiles = extractFilesCountFromStage(completedStages, "type-check");
    const testFiles = extractFilesCountFromStage(completedStages, "test-execution");
    const lintFiles = extractFilesCountFromStage(completedStages, "lint-check");
    const formatFiles = extractFilesCountFromStage(completedStages, "format-check");

    // ファイル数や実行数が記載された行全体をまとめて保持
    const fileInfoLines: string[] = [
      ...extractFileInfoLinesFromStage(completedStages, "type-check"),
      ...extractFileInfoLinesFromStage(completedStages, "test-execution"),
      ...extractFileInfoLinesFromStage(completedStages, "lint-check"),
      ...extractFileInfoLinesFromStage(completedStages, "format-check"),
    ];

    // 総ファイル数は最大値を採用（全体の進捗指標として）
    const totalFilesFromLogs = Math.max(typeCheckFiles, testFiles, lintFiles, formatFiles);

    return {
      stages: {
        total: completedStages.length,
        successful: successfulStages.length,
        failed: failedStages.length,
        skipped: skippedStages.length,
      },
      files: {
        totalChecked: totalFilesFromLogs > 0 ? totalFilesFromLogs : this.stats.filesProcessed.size,
        testFiles,
        typeCheckFiles,
        lintFiles,
        formatFiles,
        fileInfoLines, // 追加: 実際の行全体を保持
      },
      tests: {
        totalTests: this.stats.testsRun,
        passedTests: this.stats.testsPassed,
        failedTests: this.stats.testsFailed,
        skippedTests: this.stats.testsSkipped,
      },
      timing: {
        totalDuration,
        averageStageTime: completedStages.length > 0 ? totalDuration / completedStages.length : 0,
        longestStage,
        longestStageDuration,
      },
    };
  }

  /**
   * ステージ名を取得（ロガーと同じロジック）
   */
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

  /**
   * ステージのファイル数を取得
   */
  private getStageFileCount(stage: CIStage): number {
    switch (stage.kind) {
      case "lockfile-init":
        return 1; // lockfile 1つ
      case "type-check":
      case "test-execution":
      case "lint-check":
        return stage.files.length;
      case "jsr-check":
      case "format-check":
        return 0; // 全体的なチェック
    }
  }

  /**
   * エラー出力からエラー総数を抽出
   */
  private extractErrorCount(errorOutput: string): number {
    // "Found X errors." パターンを検索
    const foundMatch = errorOutput.match(/Found (\d+) errors?\./);
    if (foundMatch) {
      return parseInt(foundMatch[1], 10);
    }

    // TypeScriptエラーの個別行を数える（TS番号で始まる行）
    const tsErrorMatches = errorOutput.match(/TS\d+/g);
    if (tsErrorMatches) {
      return tsErrorMatches.length;
    }

    // フォールバック: 1つのエラーと仮定
    return 1;
  }

  /**
   * 進捗状態を初期化
   */
  private initializeProgress(testFiles: string[], typeCheckFiles: string[]): void {
    // 重複を除いた総ファイル数を計算
    const allFiles = new Set([...testFiles, ...typeCheckFiles]);
    this.progressState.totalFiles = allFiles.size;
    this.progressState.processedFiles = 0;
    this.progressState.errorFiles = 0;
    this.progressState.totalErrorCount = 0;
    this.progressState.currentStage = "Starting";
    this.progressState.isFallback = false;
    this.progressState.fallbackMessage = undefined;
  }

  /**
   * 進捗状態を更新
   */
  private updateProgress(
    stageName: string,
    processedFiles: number,
    errorFiles?: number,
    isFallback?: boolean,
    fallbackMessage?: string,
    totalErrorCount?: number,
  ): void {
    this.progressState.currentStage = stageName;
    this.progressState.processedFiles = processedFiles;
    if (errorFiles !== undefined) {
      this.progressState.errorFiles = errorFiles;
    }
    if (totalErrorCount !== undefined) {
      this.progressState.totalErrorCount = totalErrorCount;
    }
    if (isFallback !== undefined) {
      this.progressState.isFallback = isFallback;
      this.progressState.fallbackMessage = fallbackMessage;
    }
    this.logCurrentProgress();
  }

  /**
   * 現在の進捗を表示
   */
  private logCurrentProgress(): void {
    const progress: ProgressIndicator = {
      processedFiles: this.progressState.processedFiles,
      totalFiles: this.progressState.totalFiles,
      currentStage: this.progressState.currentStage,
      errorFiles: this.progressState.errorFiles,
      totalErrorCount: this.progressState.totalErrorCount > 0
        ? this.progressState.totalErrorCount
        : undefined,
      isFallback: this.progressState.isFallback,
      fallbackMessage: this.progressState.fallbackMessage,
    };
    this.logger.logProgress(progress);
  }
}
