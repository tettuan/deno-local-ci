/**
 * # Deno Local CI
 *
 * A modern TypeScript CI/CD runner for Deno v2.x projects.
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

// === Main Entry Point ===

/**
 * Main entry point for running the CI system.
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
 * await main(["--mode", "batch", "--batch-size", "10"]);
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

// === Version Information ===

/**
 * Get the current version of the package.
 *
 * @example
 * ```typescript
 * import { getVersion } from "@aidevtool/ci";
 * console.log(`Version: ${getVersion()}`);
 * ```
 */
export { getVersion } from "./src/version.ts";

/**
 * Auto-execution when module is run directly.
 * This allows the module to be executed as a CLI tool.
 */
if (import.meta.main) {
  await main();
}
