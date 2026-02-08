/**
 * # Deno Local CI - Domain Services
 *
 * Domain-driven design based service layer implementing business logic
 * for CI pipeline orchestration, execution strategies, fallback handling,
 * and error classification according to the architecture design.
 *
 * ## Services
 * - **CIPipelineOrchestrator**: Pipeline stage management and execution control
 * - **ExecutionStrategyService**: Execution strategy determination and fallback logic
 * - **StageInternalFallbackService**: Stage-internal fallback processing
 * - **ErrorClassificationService**: Error type classification and analysis
 *
 * @module
 */

import { createError, ExecutionStrategy } from "./types.ts";
import type {
  CIConfig,
  CIError,
  CIStage,
  ExecutionMode,
  ProcessResult,
  Result,
  StageResult,
  ValidationError,
} from "./types.ts";

// === Domain Services ===

/**
 * CI Pipeline Orchestrator Service
 *
 * Manages the overall CI pipeline execution flow including stage ordering,
 * execution continuation decisions, and stage creation based on configuration.
 */
export class CIPipelineOrchestrator {
  /**
   * Get ordered stages for CI execution based on configuration and discovered files.
   *
   * @param config - CI configuration containing execution preferences
   * @param files - Discovered project files categorized by type
   * @returns Array of CI stages in execution order
   */
  static getStages(
    config: CIConfig,
    files: { testFiles: string[]; typeCheckFiles: string[]; allFiles: string[] },
  ): CIStage[] {
    const stages: CIStage[] = [];
    const hierarchy = config.hierarchy || null;

    // Stage 1: Git status check (always first to detect uncommitted changes)
    stages.push({ kind: "git-status-check" });

    // Stage 2: Format (auto-fix mode, run early to fix formatting before other checks)
    stages.push({
      kind: "format-check",
      checkOnly: false,
      hierarchy,
    });

    // Stage 3: Lockfile initialization
    stages.push({ kind: "lockfile-init", action: "regenerate" });

    // Stage 4: Type check
    stages.push({
      kind: "type-check",
      files: files.typeCheckFiles,
      optimized: true,
      hierarchy,
    });

    // Stage 5: Test execution
    if (files.testFiles.length > 0) {
      const strategy = ExecutionStrategyService.determineStrategy(config);
      if (strategy.ok) {
        stages.push({
          kind: "test-execution",
          strategy: strategy.data,
          files: files.testFiles,
          hierarchy,
        });
      }
    }

    // Stage 6: Lint check
    stages.push({
      kind: "lint-check",
      files: files.allFiles,
      hierarchy,
    });

    // Stage 7: JSR check (last, skip if hierarchy is specified per requirements)
    // Note: Will be skipped at runtime if uncommitted changes are detected
    if (!hierarchy) {
      stages.push({
        kind: "jsr-check",
        dryRun: true,
        allowDirty: config.allowDirty ?? true,
        hierarchy,
      });
    }

    return stages;
  }

  /**
   * Determine whether CI execution should stop based on stage result.
   *
   * Per requirements: execution stops on any stage failure.
   *
   * @param result - Result from completed stage
   * @param config - CI configuration
   * @returns true if execution should stop, false to continue
   */
  static shouldStopExecution(result: StageResult, config: CIConfig): boolean {
    if (result.kind === "failure") {
      return true; // Stop on any failure per requirements
    }

    if (result.kind === "skipped" && config.stopOnFirstError) {
      return true; // Stop on skip if configured to stop on first error
    }

    return false; // Continue execution
  }
}

/**
 * Execution Strategy Service
 *
 * Handles execution strategy determination and fallback decision logic
 * based on configuration and error conditions.
 */
export class ExecutionStrategyService {
  static determineStrategy(
    config: CIConfig,
  ): Result<ExecutionStrategy, ValidationError & { message: string }> {
    const defaultMode: ExecutionMode = {
      kind: "all",
      projectDirectories: [],
      hierarchy: config.hierarchy || null,
    };
    return ExecutionStrategy.create(
      config.mode ?? defaultMode,
      config.fallbackEnabled ?? true,
      config.hierarchy || null,
    );
  }

  /**
   * Determine if fallback should be attempted for the given strategy and error.
   *
   * @param strategy - Current execution strategy
   * @param error - Error that occurred during execution
   * @returns true if fallback should be attempted, false otherwise
   */
  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean {
    // No fallback for fatal errors that indicate configuration or system issues
    const fatalErrors = [
      "JSRError", // JSR compatibility issues
      "ConfigurationError", // Configuration problems
      "FileSystemError", // System-level issues
    ];

    if (fatalErrors.includes(error.kind)) {
      return false;
    }

    // Allow fallback for code-related errors if strategy supports it
    const fallbackableErrors = [
      "TypeCheckError",
      "TestFailure",
      "LintError",
      "FormatError",
    ];

    return fallbackableErrors.includes(error.kind) &&
      strategy.fallbackEnabled &&
      strategy.mode.kind !== "single-file";
  }
}

/**
 * Stage Internal Fallback Service
 *
 * Handles fallback processing within individual CI stages when execution
 * modes need to be downgraded (All → Batch → Single-file).
 */
export class StageInternalFallbackService {
  /**
   * Create a fallback strategy for the current execution context.
   *
   * @param currentStrategy - The strategy that failed
   * @param failedBatch - Information about failed batch (if applicable)
   * @returns Result containing the fallback strategy or error
   */
  static createFallbackStrategy(
    currentStrategy: ExecutionStrategy,
    _failedBatch?: { startIndex: number; endIndex: number; files: string[] },
  ): Result<ExecutionStrategy, ValidationError & { message: string }> {
    const nextMode = currentStrategy.getNextFallbackMode();
    if (!nextMode) {
      return {
        ok: false,
        error: createError(
          { kind: "EmptyInput" },
          "No more fallback modes available - already at single-file mode",
        ),
      };
    }

    // Preserve hierarchy information in fallback
    return ExecutionStrategy.create(
      nextMode,
      currentStrategy.fallbackEnabled,
      currentStrategy.hierarchy,
    );
  }

  /**
   * Determine if a stage should retry with fallback based on error type.
   *
   * @param error - The error that occurred
   * @param stage - The stage where the error occurred
   * @returns true if retry with fallback should be attempted
   */
  static shouldRetryWithFallback(error: CIError, stage: CIStage): boolean {
    // All stages support fallback for these error types
    const retryableErrors = [
      "TypeCheckError",
      "TestFailure",
      "LintError",
      "FormatError",
    ];

    if (!retryableErrors.includes(error.kind)) {
      return false;
    }

    // JSR check doesn't support fallback as it's project-wide only
    if (stage.kind === "jsr-check") {
      return false;
    }

    return true;
  }

  /**
   * Extract target files for fallback execution based on the transition type.
   *
   * Implements the requirement that only failed batch files should be processed
   * in single-file mode, while all files are processed in other transitions.
   *
   * @param allFiles - Complete list of files for the stage
   * @param currentStrategy - Strategy that failed
   * @param fallbackStrategy - Strategy to fall back to
   * @param failedBatch - Information about the failed batch (if applicable)
   * @returns Array of files to process in fallback mode
   */
  static extractTargetFiles(
    allFiles: string[],
    currentStrategy: ExecutionStrategy,
    fallbackStrategy: ExecutionStrategy,
    failedBatch?: { startIndex: number; endIndex: number; files: string[] },
  ): string[] {
    // Batch → Single-file: only process failed batch files per requirements
    if (
      currentStrategy.mode.kind === "batch" &&
      fallbackStrategy.mode.kind === "single-file" &&
      failedBatch?.files
    ) {
      return failedBatch.files;
    }

    // All → Batch: process all files in batches
    if (
      currentStrategy.mode.kind === "all" &&
      fallbackStrategy.mode.kind === "batch"
    ) {
      return allFiles;
    }

    // All → Single-file: process all files individually
    if (
      currentStrategy.mode.kind === "all" &&
      fallbackStrategy.mode.kind === "single-file"
    ) {
      return allFiles;
    }

    // Default case: return all files
    return allFiles;
  }
}

/**
 * Error Classification Service
 *
 * Analyzes process output to classify errors into specific types
 * and extract relevant information for error reporting and handling.
 */
export class ErrorClassificationService {
  /**
   * Classify error based on process execution result.
   *
   * Analyzes stdout and stderr to determine the specific type of CI error
   * and extract relevant context information.
   *
   * @param result - Process execution result containing output and error information
   * @returns Classified CI error with context
   */
  static classifyError(result: ProcessResult): CIError {
    const stderr = result.stderr.toLowerCase();
    const stdout = result.stdout.toLowerCase();
    const combinedOutput = stderr + " " + stdout;

    // Type check errors
    if (combinedOutput.includes("type") && combinedOutput.includes("error")) {
      return {
        kind: "TypeCheckError",
        files: this.extractFileNames(result.stderr),
        details: this.extractErrorLines(result.stderr),
      };
    }

    // Test failures
    if (
      combinedOutput.includes("test") &&
      (combinedOutput.includes("failed") || combinedOutput.includes("fail"))
    ) {
      return {
        kind: "TestFailure",
        files: this.extractFileNames(result.stderr),
        errors: this.extractErrorLines(result.stderr),
      };
    }

    // JSR publish errors
    if (combinedOutput.includes("jsr") || combinedOutput.includes("publish")) {
      return {
        kind: "JSRError",
        output: result.stderr,
        suggestion: "Check JSR compatibility and package configuration in deno.json",
      };
    }

    // Format errors
    if (combinedOutput.includes("format") || combinedOutput.includes("fmt")) {
      return {
        kind: "FormatError",
        files: this.extractFileNames(result.stderr),
        fixCommand: "deno fmt",
      };
    }

    // Lint errors
    if (combinedOutput.includes("lint")) {
      return {
        kind: "LintError",
        files: this.extractFileNames(result.stderr),
        details: this.extractErrorLines(result.stderr),
      };
    }

    // Default to file system error
    return {
      kind: "FileSystemError",
      operation: "process_execution",
      path: "unknown",
      cause: result.stderr || result.stdout || "Unknown error",
    };
  }

  /**
   * Extract filenames from error output.
   *
   * @param output - Error output string
   * @returns Array of extracted file paths
   */
  private static extractFileNames(output: string): string[] {
    const allMatches: string[] = [];

    // Basic TypeScript file patterns
    const filePattern = /[\w\/\-\.]+\.tsx?/g;
    const basicMatches = output.match(filePattern) || [];
    allMatches.push(...basicMatches);

    // Remove duplicates and return
    return [...new Set(allMatches)];
  }

  /**
   * Extract error detail lines from output.
   *
   * @param output - Error output string
   * @returns Array of meaningful error lines
   */
  private static extractErrorLines(output: string): string[] {
    return output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .filter((line) =>
        line.includes("error") ||
        line.includes("Error") ||
        line.includes("failed") ||
        line.includes("Failed")
      )
      .slice(0, 5); // Limit to first 5 error lines
  }

  /**
   * Determine if an error is fatal and should stop all execution.
   *
   * @param error - Classified CI error
   * @returns true if error is fatal, false if recoverable
   */
  static isFatalError(error: CIError): boolean {
    const fatalErrorTypes = [
      "JSRError",
      "ConfigurationError",
      "FileSystemError",
    ];

    return fatalErrorTypes.includes(error.kind);
  }

  /**
   * Extract file paths from error for targeting in fallback.
   *
   * @param error - Classified CI error
   * @returns Array of file paths that had errors
   */
  static extractErrorFiles(error: CIError): string[] {
    switch (error.kind) {
      case "TypeCheckError":
      case "TestFailure":
      case "LintError":
      case "FormatError":
        return error.files;
      case "JSRError":
      case "ConfigurationError":
      case "FileSystemError":
        return []; // These don't target specific files
    }
  }
}

/**
 * File Classification Service
 *
 * Categorizes discovered files into different types for CI processing.
 * Used by infrastructure layer for file discovery and organization.
 */
export class FileClassificationService {
  /**
   * Classify files into categories for CI processing.
   *
   * @param files - Array of file paths to classify
   * @returns Object containing categorized file arrays
   */
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
        // Test files are also TypeScript files for type checking
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
