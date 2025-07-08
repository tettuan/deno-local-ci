/**
 * @file mod.ts
 * @description Main entry point for @aidevtool/ci package
 * 
 * This module provides a comprehensive TypeScript-based CI runner for Deno projects,
 * offering structured testing, formatting, and linting capabilities with multiple
 * execution modes and robust error handling.
 * 
 * @example
 * ```typescript
 * import { CIRunner, Logger, CLIParser } from "@aidevtool/ci";
 * 
 * // Parse command line arguments
 * const config = CLIParser.parse(Deno.args);
 * 
 * // Initialize logger
 * const logger = new Logger(config.debug, config.silent);
 * 
 * // Create and run CI
 * const runner = new CIRunner(config, logger);
 * const success = await runner.run();
 * 
 * Deno.exit(success ? 0 : 1);
 * ```
 * 
 * @example Basic CLI usage
 * ```bash
 * # Run with default settings
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
 * 
 * # Run in single-file mode with debug output
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --single-file --debug
 * 
 * # Run in batch mode with custom batch size
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --batch --batch-size 15
 * ```
 * 
 * @module
 */

// Re-export all main classes and types for public API
export { CIRunner } from "./src/ci_runner.ts";
export { CLIParser } from "./src/cli_parser.ts";
export { Logger } from "./src/logger.ts";
export { ProcessRunner } from "./src/process_runner.ts";
export { FileSystem } from "./src/file_system.ts";

// Re-export all types
export type {
  CIConfig,
  ExecutionMode,
  LogLevel,
  LogMode,
  LogConfig,
  ProcessResult,
  TestResult,
  BatchResult,
  TypeCheckResult,
  CIResult,
} from "./src/types.ts";

/**
 * Default entry point that can be used directly as a CLI tool
 * 
 * @example
 * ```bash
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
 * ```
 */
export async function main(): Promise<void> {
  const { CIRunner } = await import("./src/ci_runner.ts");
  const { CLIParser } = await import("./src/cli_parser.ts");
  const { Logger } = await import("./src/logger.ts");

  try {
    // Parse command line arguments
    const config = CLIParser.parse(Deno.args);
    
    // Initialize logger with debug and silent modes
    const logger = new Logger(config.debug, config.silent);
    
    // Create and run CI
    const runner = new CIRunner(config, logger);
    const success = await runner.run();
    
    Deno.exit(success ? 0 : 1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Fatal error:", errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    Deno.exit(1);
  }
}

// Auto-run if this module is the main module
if (import.meta.main) {
  await main();
}
