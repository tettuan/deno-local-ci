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

// === Essential Types for Public API ===

/**
 * Essential type definitions for using the CI system.
 *
 * @example
 * ```typescript
 * import type { CIConfig, Result } from "@aidevtool/ci";
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
  /** Generic result type with success/error states */
  Result,
  /** Result of a CI stage execution */
  StageResult,
} from "./src/types.ts";

// === Version Information ===

/**
 * Version information for the package.
 *
 * @example
 * ```typescript
 * import { VERSION, getVersion, getFullVersion } from "@aidevtool/ci";
 *
 * console.log(`Current version: ${VERSION}`);
 * console.log(`Full version: ${getFullVersion()}`);
 * ```
 */
export { getFullVersion, getVersion, VERSION } from "./src/version.ts";

// === Main CI Runner ===

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
 *   console.log(result.success ? "✅ CI passed" : "❌ CI failed");
 * }
 * ```
 */
export { type CIExecutionResult, CIRunner } from "./src/ci_runner.ts";

// === Logger Interface ===

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

// === CLI Interface ===

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
export { CLIParser } from "./src/cli_parser.ts";

// === Main Entry Point ===

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
