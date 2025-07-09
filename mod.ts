/**
 * @file mod_v2.ts
 * @description Main entry point for Deno Local CI v2 with 5-stage pipeline
 * 
 * This module provides a type-safe, totality-principle-based CI runner for Deno projects,
 * implementing a 5-stage pipeline: Type Check → JSR Check → Test → Lint → Format
 * with automatic fallback strategy and comprehensive error handling.
 * 
 * @example
 * ```typescript
 * import { TypeSafeCIRunner, parseArgs } from "@aidevtool/ci";
 * 
 * // Parse command line arguments
 * const configResult = parseArgs(Deno.args);
 * if (!configResult.ok) {
 *   console.error("Config error:", configResult.error.message);
 *   Deno.exit(1);
 * }
 * 
 * // Create and run CI
 * const runnerResult = TypeSafeCIRunner.create(configResult.data);
 * if (!runnerResult.ok) {
 *   console.error("Runner creation error:", runnerResult.error.message);
 *   Deno.exit(1);
 * }
 * 
 * const pipelineResult = await runnerResult.data.runPipeline();
 * if (!pipelineResult.ok) {
 *   console.error("Pipeline failed:", pipelineResult.error.kind);
 *   Deno.exit(1);
 * }
 * 
 * console.log("✅ All pipeline stages completed successfully!");
 * Deno.exit(0);
 * ```
 * 
 * @example CLI usage with new 5-stage pipeline
 * ```bash
 * # Default: single-file mode with fallback enabled
 * deno run --allow-all jsr:@aidevtool/ci
 * 
 * # All mode (fastest execution)
 * deno run --allow-all jsr:@aidevtool/ci --mode all
 * 
 * # Batch mode with custom size
 * deno run --allow-all jsr:@aidevtool/ci --mode batch --batch-size 10
 * 
 * # Debug mode with detailed BreakdownLogger output
 * deno run --allow-all jsr:@aidevtool/ci --log-mode debug --log-length L --log-key "test"
 * 
 * # Silent mode (errors only)
 * deno run --allow-all jsr:@aidevtool/ci --log-mode silent
 * 
 * # Disable automatic fallback
 * deno run --allow-all jsr:@aidevtool/ci --mode all --no-fallback
 * ```
 * 
 * @module
 */

// =============================================================================
// Core Exports - メインコンポーネント
// =============================================================================

// Type-safe CI Runner
export { TypeSafeCIRunner } from "./src/ci_runner.ts";
export { createCIRunner } from "./src/ci_runner.ts";

// Type-safe CLI Parser
export { TypeSafeCLIParser, parseArgs, parseArgsWithDefaults } from "./src/cli_parser.ts";

// Domain Services
export {
  ExecutionStrategyService,
  ErrorClassificationService,
  FilePatternService,
  BatchProcessingService
} from "./src/domain_services.ts";

// Infrastructure
export { ProcessRunner } from "./src/process_runner.ts";
export { FileSystem } from "./src/file_system.ts";
export { Logger } from "./src/logger.ts";

// =============================================================================
// Type Exports - 型定義
// =============================================================================

export type {
  // Available types from current types.ts
  CIConfig,
  ExecutionMode,
  LogMode,
  CIResult,
  TestResult,
  BatchResult,
  ProcessResult,
  TypeCheckResult,
  LogConfig,
  LogLevel,
} from "./src/types.ts";

// =============================================================================
// Pipeline Stage Information - パイプライン情報
// =============================================================================

/**
 * CI Pipeline stages in execution order
 */
export const PIPELINE_STAGES = [
  "type-check",
  "jsr-check", 
  "test",
  "lint",
  "format"
] as const;

/**
 * Pipeline stage descriptions
 */
export const STAGE_DESCRIPTIONS = {
  "type-check": "Deno type checking (deno check)",
  "jsr-check": "JSR compatibility check (deno publish --dry-run)",
  "test": "Test execution (deno test)",
  "lint": "Code linting (deno lint)",
  "format": "Code formatting check (deno fmt --check)"
} as const;

/**
 * Execution mode descriptions
 */
export const MODE_DESCRIPTIONS = {
  "all": "Execute all files at once (fastest, but less debug info)",
  "batch": "Execute files in batches (balanced speed and debug info)",
  "single-file": "Execute files one by one (slowest, but best for debugging)"
} as const;

// =============================================================================
// Version Information - バージョン情報
// =============================================================================

export const VERSION = "2.0.0";
export const DESCRIPTION = "Type-safe CI pipeline for Deno projects with 5-stage execution";
export const FEATURES = [
  "5-stage pipeline: Type Check → JSR Check → Test → Lint → Format",
  "Automatic fallback strategy: All → Batch → Single-file",
  "Type-safe error handling with Result types",
  "BreakdownLogger integration for detailed debugging",
  "Discriminated unions for state management",
  "Smart constructors for value validation"
] as const;
