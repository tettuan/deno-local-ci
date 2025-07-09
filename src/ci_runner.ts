/**
 * Deno Local CI - CI Runner
 *
 * CI実行の中核とパイプライン管理の責務
 * 段階的実行とフォールバック戦略の実装
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
 * CI実行結果
 */
export interface CIExecutionResult {
  success: boolean;
  completedStages: StageResult[];
  totalDuration: number;
  errorDetails?: CIError;
}

/**
 * CI実行サービス
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

    const result = await DenoCommandRunner.typeCheck(stage.files);
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
        const fallbackResult = await this.attemptTestFallback(
          stage.strategy,
          testFiles,
          errorOutput,
        );
        if (fallbackResult.ok) {
          const successResult: StageResult = {
            kind: "success",
            stage,
            duration: performance.now() - startTime,
          };
          this.logger.logStageResult(successResult);
          return successResult;
        }
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

    const result = await DenoCommandRunner.lint(stage.files);
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

    const result = await DenoCommandRunner.format(typeCheckFilesResult.data, {
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
}
