/**
 * # Deno Local CI
 *
 * A comprehensive TypeScript-based CI runner for Deno projects with robust testing,
 * formatting, and linting capabilities.
 *
 * ## Features
 *
 * - **Multiple Execution Modes**: Single-file, batch, and all modes for different project needs
 * - **Type Safety**: Full TypeScript support with strict type checking
 * - **Comprehensive Pipeline**: Type check → JSR check → Test → Lint → Format
 * - **Flexible Configuration**: Customizable batch sizes and execution options
 * - **Error Handling**: Structured error categorization and fallback mechanisms
 * - **Rich Logging**: Multiple log levels with debug and silent modes including BreakdownLogger integration
 * - **Performance Optimized**: Memory-efficient processing for large test suites
 *
 * ## Quick Start
 *
 * ```typescript
 * import { main } from "@aidevtool/ci";
 *
 * // Run CI with default settings
 * await main(["--mode", "batch"]);
 * ```
 *
 * @module
 */

// === Core Types ===

/**
 * Core type definitions for the CI system.
 *
 * @example
 * ```typescript
 * import type { CIConfig, ExecutionMode } from "@aidevtool/ci";
 *
 * const config: CIConfig = {
 *   mode: { kind: "batch", batchSize: 25 },
 *   fallbackEnabled: true
 * };
 * ```
 */
export type {
  /** Configuration object for the CI runner */
  CIConfig,
  /** Error type used throughout the CI system */
  CIError,
  /** Represents a CI pipeline stage */
  CIStage,
  /** Execution mode for running tests */
  ExecutionMode,
  /** Logging configuration mode */
  LogMode,
  /** Result of process execution */
  ProcessResult,
  /** Generic result type with success/error states */
  Result,
  /** Result of a CI stage execution */
  StageResult,
  /** Classification of test file types */
  TestFileType,
  /** Result of test execution */
  TestResult,
  /** Validation error details */
  ValidationError,
} from "./src/types.ts";

/**
 * Utility types and helper functions.
 *
 * @example
 * ```typescript
 * import { ExecutionStrategy, createError } from "@aidevtool/ci";
 *
 * const strategy = ExecutionStrategy.batch(25);
 * const error = createError("TypeCheckError", "Type check failed");
 * ```
 */
export { BreakdownLoggerEnvConfig, createError, ExecutionStrategy } from "./src/types.ts";

// === Domain Services ===

/**
 * Domain services implementing the core business logic of the CI system.
 * These services handle pipeline orchestration, error classification, and execution strategies.
 *
 * @example
 * ```typescript
 * import { CIPipelineOrchestrator, ExecutionStrategyService } from "@aidevtool/ci";
 *
 * const orchestrator = new CIPipelineOrchestrator();
 * const strategy = ExecutionStrategyService.determineStrategy(files);
 * ```
 */
export {
  /** Orchestrates the CI pipeline execution flow */
  CIPipelineOrchestrator,
  /** Classifies and categorizes CI errors */
  ErrorClassificationService,
  /** Determines optimal execution strategies */
  ExecutionStrategyService,
  /** Classifies and filters project files */
  FileClassificationService,
  /** Handles fallback logic between execution modes */
  StageInternalFallbackService,
} from "./src/domain_services.ts";

// === Infrastructure Services ===

/**
 * Infrastructure services for process execution and system interaction.
 *
 * @example
 * ```typescript
 * import { ProcessRunner, DenoCommandRunner } from "@aidevtool/ci";
 *
 * const runner = new ProcessRunner();
 * const result = await runner.run("deno", ["test", "file.test.ts"]);
 * ```
 */
export { DenoCommandRunner, ProcessRunner } from "./src/process_runner.ts";

/**
 * File system operations and project file discovery.
 *
 * @example
 * ```typescript
 * import { FileSystemService, ProjectFileDiscovery } from "@aidevtool/ci";
 *
 * const fs = new FileSystemService();
 * const discovery = new ProjectFileDiscovery(fs);
 * const files = await discovery.discoverProjectFiles("/path/to/project");
 * ```
 */
export { FileSystemService, ProjectFileDiscovery } from "./src/file_system.ts";

/**
 * Logging infrastructure with multiple modes and BreakdownLogger integration.
 *
 * @example
 * ```typescript
 * import { CILogger, LogModeFactory } from "@aidevtool/ci";
 *
 * const mode = LogModeFactory.debug();
 * const loggerResult = CILogger.create(mode);
 * if (loggerResult.ok) {
 *   const logger = loggerResult.data;
 *   logger.logInfo("Starting CI process");
 * }
 * ```
 */
export { CILogger, LogModeFactory } from "./src/logger.ts";

/**
 * Command-line interface parsing and configuration.
 *
 * @example
 * ```typescript
 * import { CLIParser } from "@aidevtool/ci";
 *
 * const parseResult = CLIParser.parseArgs(["--mode", "batch", "--batch-size", "10"]);
 * if (parseResult.ok) {
 *   const config = CLIParser.buildCIConfig(parseResult.data);
 * }
 * ```
 */
export { type CLIOptions, CLIParser } from "./src/cli_parser.ts";

// === Core CI Runner ===

/**
 * Main CI runner that orchestrates the entire CI pipeline.
 *
 * @example
 * ```typescript
 * import { CIRunner, CILogger, LogModeFactory } from "@aidevtool/ci";
 *
 * const logger = CILogger.create(LogModeFactory.normal()).data!;
 * const runnerResult = await CIRunner.create(logger, {}, "/path/to/project");
 * if (runnerResult.ok) {
 *   const result = await runnerResult.data.run();
 *   console.log(result.success ? "CI passed" : "CI failed");
 * }
 * ```
 */
export { type CIExecutionResult, CIRunner } from "./src/ci_runner.ts";

// === CLI Interface ===

/**
 * Main entry point for running the CI system from command line or programmatically.
 *
 * This function handles the complete CI workflow:
 * 1. Parses command line arguments
 * 2. Builds CI configuration
 * 3. Creates logger with appropriate mode
 * 4. Initializes and runs the CI pipeline
 * 5. Reports results and sets exit code
 *
 * @param args - Command line arguments (defaults to Deno.args)
 *
 * @example
 * ```typescript
 * import { main } from "@aidevtool/ci";
 *
 * // Run with default settings
 * await main();
 *
 * // Run with custom arguments
 * await main(["--mode", "batch", "--batch-size", "10", "--log-mode", "debug"]);
 *
 * // Run in silent mode
 * await main(["--log-mode", "silent"]);
 * ```
 *
 * @example CLI Usage
 * ```bash
 * # Run with default settings
 * deno run --allow-read --allow-run --allow-write --allow-env jsr:@aidevtool/ci
 *
 * # Run in batch mode with custom batch size
 * deno run --allow-read --allow-run --allow-write --allow-env jsr:@aidevtool/ci --mode batch --batch-size 15
 *
 * # Run in debug mode with BreakdownLogger
 * deno run --allow-read --allow-run --allow-write --allow-env jsr:@aidevtool/ci --log-mode debug --log-key CI_DEBUG
 * ```
 */
export async function main(args: string[] = Deno.args): Promise<void> {
  const { CLIParser } = await import("./src/cli_parser.ts");
  const { CILogger, LogModeFactory } = await import("./src/logger.ts");
  const { CIRunner } = await import("./src/ci_runner.ts");

  // Parse CLI arguments
  const parseResult = CLIParser.parseArgs(args);
  if (!parseResult.ok) {
    console.error("Error parsing command line arguments:");
    console.error(`   ${parseResult.error.message}`);
    CLIParser.showHelp();
    Deno.exit(1);
  }

  const options = parseResult.data;

  // Show help or version if requested
  if (options.help) {
    CLIParser.showHelp();
    return;
  }

  if (options.version) {
    CLIParser.showVersion();
    return;
  }

  // Build CI configuration
  const configResult = CLIParser.buildCIConfig(options);
  if (!configResult.ok) {
    console.error("Error building CI configuration:");
    console.error(`   ${configResult.error.message}`);
    Deno.exit(1);
  }

  const config = configResult.data;

  // Setup logging
  const logMode = config.logMode || LogModeFactory.normal();
  const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);
  if (!loggerResult.ok) {
    console.error("Error creating logger:");
    console.error(`   ${loggerResult.error.message}`);
    Deno.exit(1);
  }

  const logger = loggerResult.data;

  // Create CI runner
  const runnerResult = await CIRunner.create(logger, config, options.workingDirectory);
  if (!runnerResult.ok) {
    logger.logError("Failed to create CI runner", runnerResult.error.message);
    Deno.exit(1);
  }

  const runner = runnerResult.data;

  // Execute CI pipeline
  logger.logDebug("Starting CI execution with configuration", config);
  const result = await runner.run();

  // Exit with appropriate code
  if (result.success) {
    logger.logDebug("CI execution completed successfully");
    Deno.exit(0);
  } else {
    logger.logError("CI execution failed", result.errorDetails);
    Deno.exit(1);
  }
}

/**
 * Auto-execution when module is run directly.
 * This allows the module to be executed as a CLI tool.
 */
if (import.meta.main) {
  await main();
}
