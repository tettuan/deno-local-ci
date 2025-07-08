#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

/**
 * @file local_ci.ts
 * @description Deno Local CI - JSR Entry Point for TypeScript CI Runner
 * 
 * Purpose:
 *   - Run all Deno tests in the project with strict permissions and debug logging
 *   - Ensure all tests pass before running formatting and lint checks
 *   - Mimics the CI flow locally to catch issues before commit, push, or merge
 *   - Serves as the main JSR entry point for the deno-local-ci package
 * 
 * Features:
 *   - Type-safe configuration and error handling
 *   - Multiple execution modes (single-file, batch, legacy)
 *   - Automatic fallback mechanisms
 *   - Comprehensive error diagnostics
 *   - Memory optimization for large test suites
 * 
 * JSR Usage:
 *   deno run --allow-read --allow-write --allow-run --allow-env jsr:@tettuan/deno-local-ci
 *   deno run --allow-read --allow-write --allow-run --allow-env jsr:@tettuan/deno-local-ci --single-file
 *   deno run --allow-read --allow-write --allow-run --allow-env jsr:@tettuan/deno-local-ci --batch --batch-size 15
 * 
 * Local Usage:
 *   deno run --allow-read --allow-write --allow-run --allow-env local_ci.ts
 *   deno run --allow-read --allow-write --allow-run --allow-env local_ci.ts --single-file
 *   deno run --allow-read --allow-write --allow-run --allow-env local_ci.ts --batch --batch-size 15
 */

import { CIRunner } from "./src/ci_runner.ts";
import { CLIParser } from "./src/cli_parser.ts";
import { Logger } from "./src/logger.ts";

/**
 * Main entry point for the Deno Local CI runner
 * This function serves as both the CLI entry point and JSR package main function
 * 
 * @param args - Command line arguments (defaults to Deno.args for CLI usage)
 * @returns Promise<number> - Exit code (0 for success, 1 for failure)
 */
export async function main(args: string[] = Deno.args): Promise<number> {
  try {
    // Parse command line arguments
    const config = CLIParser.parse(args);
    
    // Initialize logger with debug and silent modes
    const logger = new Logger(config.debug, config.silent);
    
    // Create and run CI
    const runner = new CIRunner(config, logger);
    const success = await runner.run();
    
    // Return exit code instead of calling Deno.exit for JSR compatibility
    return success ? 0 : 1;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Fatal error:", errorMessage);
    
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return 1;
  }
}

// CLI entry point - only run when this file is executed directly
if (import.meta.main) {
  const exitCode = await main();
  Deno.exit(exitCode);
}
