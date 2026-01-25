/**
 * # Deno Local CI - CLI Parser
 *
 * Command-line interface parsing and configuration management module.
 * Provides type-safe argument parsing, validation, and configuration building.
 *
 * ## Features
 * - **Type-Safe Parsing**: Validates all command-line arguments with proper type checking
 * - **Configuration Building**: Transforms CLI options into structured CI configuration
 * - **Validation**: Comprehensive input validation with detailed error messages
 * - **Help System**: Automatic help generation and version information
 * - **Flexible Options**: Supports all execution modes and logging configurations
 *
 * @module
 */

import { BreakdownLoggerEnvConfig, CI_CONFIG, createError } from "./types.ts";
import type { CIConfig, ExecutionMode, LogMode, Result, ValidationError } from "./types.ts";
import { getFullVersion } from "./version.ts";

/**
 * Subcommand type for CLI operations.
 * 'run' is the default CI execution, 'status' shows history, 'retry' re-runs failed tests.
 */
export type Subcommand = "run" | "status" | "retry";

/**
 * Options for the 'status' subcommand.
 */
export interface StatusOptions {
  /** Number of records to show (default: 5) */
  count?: number;
  /** Show only failed executions */
  failed?: boolean;
  /** Output as JSON format */
  json?: boolean;
  /** Show verbose output */
  verbose?: boolean;
}

/**
 * Options for the 'retry' subcommand.
 */
export interface RetryOptions {
  /** Specific execution ID to retry */
  id?: string;
  /** Retry only specific stage */
  stage?: string;
}

/**
 * Command-line interface options configuration.
 * Defines all available CLI parameters with their types and constraints.
 *
 * @example
 * ```typescript
 * const options: CLIOptions = {
 *   mode: "batch",
 *   batchSize: CI_CONFIG.DEFAULT_BATCH_SIZE,
 *   logMode: "debug",
 *   fallbackEnabled: true,
 *   hierarchy: "./src/"  // 階層指定でsrc/ディレクトリのみを対象とする
 * };
 * ```
 */
export interface CLIOptions {
  /** Execution mode: 'all', 'batch', or 'single-file' */
  mode?: "all" | "batch" | "single-file";
  /** Number of files to process per batch (1-100) */
  batchSize?: number;
  /** Whether to enable automatic fallback to safer modes */
  fallbackEnabled?: boolean;
  /** Logging verbosity mode */
  logMode?: "normal" | "silent" | "debug" | "error-files-only";
  /** BreakdownLogger message length setting */
  logLength?: "W" | "M" | "L";
  /** BreakdownLogger environment key */
  logKey?: string;
  /** Whether to stop pipeline on first stage failure */
  stopOnFirstError?: boolean;
  /** Allow execution in dirty git repository */
  allowDirty?: boolean;
  /** File filter pattern for selective execution */
  filter?: string;
  /** Directory hierarchy for CI execution (null = entire project) */
  hierarchy?: string;
  help?: boolean;
  version?: boolean;
  workingDirectory?: string;
  /** Subcommand: run (default), status, retry */
  subcommand?: Subcommand;
  /** Options for status subcommand */
  statusOptions?: StatusOptions;
  /** Options for retry subcommand */
  retryOptions?: RetryOptions;
}

/**
 * CLI引数パーサー
 */
export class CLIParser {
  private constructor() {}

  /**
   * コマンドライン引数を解析
   */
  static parseArgs(args: string[]): Result<CLIOptions, ValidationError & { message: string }> {
    const options: CLIOptions = {};
    const positionalArgs: string[] = [];

    // Check for subcommand as first argument
    if (args.length > 0 && !args[0].startsWith("-")) {
      const firstArg = args[0];
      if (firstArg === "status") {
        options.subcommand = "status";
        return this.parseStatusArgs(args.slice(1), options);
      } else if (firstArg === "retry") {
        options.subcommand = "retry";
        return this.parseRetryArgs(args.slice(1), options);
      }
      // If not a known subcommand, treat as positional arg (hierarchy)
    }

    // Default subcommand is 'run'
    options.subcommand = "run";

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      try {
        if (arg.startsWith("--")) {
          // オプション引数の処理
          switch (arg) {
            case "--mode": {
              const modeValue = args[++i];
              if (!["all", "batch", "single-file"].includes(modeValue)) {
                return {
                  ok: false,
                  error: createError({
                    kind: "PatternMismatch",
                    value: modeValue,
                    pattern: "all|batch|single-file",
                  }),
                };
              }
              options.mode = modeValue as "all" | "batch" | "single-file";
              break;
            }

            case "--batch-size": {
              const batchSizeStr = args[++i];
              const batchSize = parseInt(batchSizeStr, 10);
              if (
                isNaN(batchSize) || batchSize < CI_CONFIG.MIN_BATCH_SIZE ||
                batchSize > CI_CONFIG.MAX_BATCH_SIZE
              ) {
                return {
                  ok: false,
                  error: createError({
                    kind: "OutOfRange",
                    value: batchSizeStr,
                    min: CI_CONFIG.MIN_BATCH_SIZE,
                    max: CI_CONFIG.MAX_BATCH_SIZE,
                  }),
                };
              }
              options.batchSize = batchSize;
              break;
            }

            case "--no-fallback":
              options.fallbackEnabled = false;
              break;

            case "--fallback":
              options.fallbackEnabled = true;
              break;

            case "--log-mode": {
              const logModeValue = args[++i];
              if (!["normal", "silent", "debug", "error-files-only"].includes(logModeValue)) {
                return {
                  ok: false,
                  error: createError({
                    kind: "PatternMismatch",
                    value: logModeValue,
                    pattern: "normal|silent|debug|error-files-only",
                  }),
                };
              }
              options.logMode = logModeValue as "normal" | "silent" | "debug" | "error-files-only";
              break;
            }

            case "--log-length": {
              const logLengthValue = args[++i];
              if (!["W", "M", "L"].includes(logLengthValue)) {
                return {
                  ok: false,
                  error: createError({
                    kind: "PatternMismatch",
                    value: logLengthValue,
                    pattern: "W|M|L",
                  }),
                };
              }
              options.logLength = logLengthValue as "W" | "M" | "L";
              break;
            }

            case "--log-key":
              options.logKey = args[++i];
              break;

            case "--stop-on-first-error":
              options.stopOnFirstError = true;
              break;

            case "--continue-on-error":
              options.stopOnFirstError = false;
              break;

            case "--allow-dirty":
              options.allowDirty = true;
              break;

            case "--filter":
              options.filter = args[++i];
              break;

            case "--hierarchy":
            case "--dir": {
              const hierarchyValue = args[++i];
              if (!hierarchyValue || hierarchyValue.trim().length === 0) {
                return {
                  ok: false,
                  error: createError({
                    kind: "EmptyInput",
                  }, "Hierarchy path cannot be empty"),
                };
              }
              options.hierarchy = hierarchyValue;
              break;
            }

            case "--cwd":
            case "--working-directory":
              options.workingDirectory = args[++i];
              break;

            case "--help":
            case "-h":
              options.help = true;
              break;

            case "--version":
            case "-v":
              options.version = true;
              break;

            default:
              return {
                ok: false,
                error: createError({
                  kind: "PatternMismatch",
                  value: arg,
                  pattern: "known CLI option",
                }, `Unknown option: ${arg}`),
              };
          }
        } else {
          // 位置引数として階層指定を処理
          positionalArgs.push(arg);
        }
      } catch (_error) {
        return {
          ok: false,
          error: createError({
            kind: "ParseError",
            input: arg,
          }, `Error parsing argument: ${arg}`),
        };
      }
    }

    // 位置引数から階層を設定（最初の位置引数を階層として使用）
    if (positionalArgs.length > 0 && !options.hierarchy) {
      options.hierarchy = positionalArgs[0];
    }

    return { ok: true, data: options };
  }

  /**
   * CLIオプションからCI設定を構築
   */
  static buildCIConfig(
    options: CLIOptions,
  ): Result<CIConfig, ValidationError & { message: string }> {
    const config: CIConfig = {};

    // 実行モード設定
    if (options.mode) {
      const modeResult = this.buildExecutionMode(options);
      if (!modeResult.ok) return modeResult;
      config.mode = modeResult.data;
    } else {
      // デフォルトはallモード（実行速度優先：All → Batch → Single-file）
      config.mode = {
        kind: "all",
        projectDirectories: ["."],
        hierarchy: options.hierarchy || null,
      };
    }

    // 階層設定
    config.hierarchy = options.hierarchy || null;

    // フォールバック設定
    config.fallbackEnabled = options.fallbackEnabled ?? true;

    // バッチサイズ設定（一時的に検証用バッチサイズを使用）
    config.batchSize = options.batchSize ?? CI_CONFIG.VALIDATION_BATCH_SIZE;

    // ログモード設定
    const logModeResult = this.buildLogMode(options);
    if (!logModeResult.ok) return logModeResult;
    config.logMode = logModeResult.data;

    // BreakdownLogger設定
    if (options.logMode === "debug" && options.logLength && options.logKey) {
      const breakdownResult = BreakdownLoggerEnvConfig.create(options.logLength, options.logKey);
      if (!breakdownResult.ok) return breakdownResult;
      config.breakdownLoggerConfig = breakdownResult.data;
    }

    // その他設定
    config.stopOnFirstError = options.stopOnFirstError ?? false;
    config.allowDirty = options.allowDirty ?? false;

    return { ok: true, data: config };
  }

  /**
   * ヘルプメッセージ表示
   */
  static showHelp(): void {
    console.log(`
Deno Local CI - TypeScript-based CI runner for Deno projects

USAGE:
    deno run [permissions] mod.ts [OPTIONS]

OPTIONS:
    --mode <MODE>              Execution mode: all, batch, single-file [default: all]
    --batch-size <SIZE>        Batch size for batch mode (1-100) [default: 2]
    --fallback                 Enable execution strategy fallback [default: true]
    --no-fallback              Disable execution strategy fallback
    
    --log-mode <MODE>          Log mode: normal, silent, debug, error-files-only [default: normal]
    --log-length <LENGTH>      BreakdownLogger length: W, M, L [required for debug mode]
    --log-key <KEY>            BreakdownLogger key [required for debug mode]
    
    --stop-on-first-error      Stop execution on first error [default: false]
    --continue-on-error        Continue execution after errors
    --allow-dirty              Allow dirty working directory for JSR check
    --filter <PATTERN>         Filter test files by pattern
    
    --hierarchy <PATH>         Target directory hierarchy for CI execution
    --dir <PATH>               Alias for --hierarchy
    --cwd <PATH>               Working directory [default: current directory]
    --help, -h                 Show this help message
    --version, -v              Show version information

HIERARCHY SPECIFICATION:
    You can specify a target directory to limit CI execution scope:
    
    # Run CI only for files in src/ directory
    deno run --allow-all mod.ts --hierarchy src/
    
    # Run CI only for files in lib/core/ directory  
    deno run --allow-all mod.ts --hierarchy lib/core/

EXAMPLES:
    # Run with default settings (all mode, entire project)
    deno run --allow-all mod.ts

    # Run only for src/ directory with batch mode
    deno run --allow-all mod.ts --mode batch --hierarchy src/

    # Run with debug logging for specific directory
    deno run --allow-all mod.ts --hierarchy lib/ --log-mode debug --log-length M --log-key CI_DEBUG

    # Run with error files only for tests directory
    deno run --allow-all mod.ts --hierarchy tests/ --log-mode error-files-only

    # Run only in the src/ directory
    deno run --allow-all mod.ts --hierarchy ./src/

CI STAGES:
    The CI pipeline executes the following stages in order:
    1. Type Check     (deno check [hierarchy])
    2. JSR Check      (deno publish --dry-run) - SKIPPED when hierarchy specified
    3. Test           (deno test [hierarchy])
    4. Lint           (deno lint [hierarchy])
    5. Format         (deno fmt --check [hierarchy])

    Each stage stops execution on error. Test stage supports fallback strategies.
    When hierarchy is specified, JSR Check is automatically skipped.

EXECUTION MODES:
    all         - Execute all files at once (fastest when successful)
    batch       - Execute files in batches (balanced performance/debugging)
    single-file - Execute files one by one (best for debugging)

    Fallback: all → batch → single-file (automatic on errors)
`);
  }

  /**
   * Display version information
   */
  static showVersion(): void {
    console.log(getFullVersion());
  }

  // === プライベートメソッド ===

  private static buildExecutionMode(
    options: CLIOptions,
  ): Result<ExecutionMode, ValidationError & { message: string }> {
    const hierarchy = options.hierarchy || null;

    switch (options.mode) {
      case "all":
        return { ok: true, data: { kind: "all", projectDirectories: ["."], hierarchy } };

      case "batch": {
        const batchSize = options.batchSize ?? CI_CONFIG.VALIDATION_BATCH_SIZE;
        return { ok: true, data: { kind: "batch", batchSize, failedBatchOnly: false, hierarchy } };
      }

      case "single-file": {
        const stopOnFirstError = options.stopOnFirstError ?? true;
        return { ok: true, data: { kind: "single-file", stopOnFirstError, hierarchy } };
      }

      default:
        return {
          ok: false,
          error: createError({
            kind: "PatternMismatch",
            value: options.mode || "undefined",
            pattern: "all|batch|single-file",
          }),
        };
    }
  }

  private static buildLogMode(
    options: CLIOptions,
  ): Result<LogMode, ValidationError & { message: string }> {
    switch (options.logMode || "normal") {
      case "normal":
        return { ok: true, data: { kind: "normal", showSections: true } };

      case "silent":
        return { ok: true, data: { kind: "silent", errorsOnly: true } };

      case "error-files-only":
        return { ok: true, data: { kind: "error-files-only", implicitSilent: true } };

      case "debug": {
        if (!options.logLength || !options.logKey) {
          return {
            ok: false,
            error: createError({
              kind: "EmptyInput",
            }, "Debug mode requires --log-length and --log-key options"),
          };
        }

        const breakdownResult = BreakdownLoggerEnvConfig.create(options.logLength, options.logKey);
        if (!breakdownResult.ok) return breakdownResult;

        return {
          ok: true,
          data: {
            kind: "debug",
            verboseLevel: "high",
            breakdownLoggerEnv: breakdownResult.data,
          },
        };
      }

      default:
        return {
          ok: false,
          error: createError({
            kind: "PatternMismatch",
            value: options.logMode || "undefined",
            pattern: "normal|silent|debug|error-files-only",
          }),
        };
    }
  }

  /**
   * Parse arguments for 'status' subcommand
   */
  private static parseStatusArgs(
    args: string[],
    options: CLIOptions,
  ): Result<CLIOptions, ValidationError & { message: string }> {
    const statusOptions: StatusOptions = {
      count: 5,
      failed: false,
      json: false,
      verbose: false,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case "--count":
        case "-n": {
          const countStr = args[++i];
          const count = parseInt(countStr, 10);
          if (isNaN(count) || count < 1 || count > 100) {
            return {
              ok: false,
              error: createError({
                kind: "OutOfRange",
                value: countStr,
                min: 1,
                max: 100,
              }, "Count must be between 1 and 100"),
            };
          }
          statusOptions.count = count;
          break;
        }
        case "--failed":
        case "-f":
          statusOptions.failed = true;
          break;
        case "--json":
          statusOptions.json = true;
          break;
        case "--verbose":
        case "-v":
          statusOptions.verbose = true;
          break;
        case "--help":
        case "-h":
          options.help = true;
          break;
        default:
          if (arg.startsWith("-")) {
            return {
              ok: false,
              error: createError({
                kind: "PatternMismatch",
                value: arg,
                pattern: "known status option",
              }, `Unknown status option: ${arg}`),
            };
          }
      }
    }

    options.statusOptions = statusOptions;
    return { ok: true, data: options };
  }

  /**
   * Parse arguments for 'retry' subcommand
   */
  private static parseRetryArgs(
    args: string[],
    options: CLIOptions,
  ): Result<CLIOptions, ValidationError & { message: string }> {
    const retryOptions: RetryOptions = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case "--id": {
          retryOptions.id = args[++i];
          break;
        }
        case "--stage": {
          const stage = args[++i];
          const validStages = ["type-check", "test", "lint", "format"];
          if (!validStages.includes(stage)) {
            return {
              ok: false,
              error: createError({
                kind: "PatternMismatch",
                value: stage,
                pattern: validStages.join("|"),
              }, `Invalid stage: ${stage}. Valid stages: ${validStages.join(", ")}`),
            };
          }
          retryOptions.stage = stage;
          break;
        }
        case "--help":
        case "-h":
          options.help = true;
          break;
        default:
          if (arg.startsWith("-")) {
            return {
              ok: false,
              error: createError({
                kind: "PatternMismatch",
                value: arg,
                pattern: "known retry option",
              }, `Unknown retry option: ${arg}`),
            };
          }
      }
    }

    options.retryOptions = retryOptions;
    return { ok: true, data: options };
  }

  /**
   * Show help for status subcommand
   */
  static showStatusHelp(): void {
    console.log(`
Deno Local CI - Status Command

Show recent CI execution history from .ci-local/history.json

USAGE:
    deno run [permissions] mod.ts status [OPTIONS]

OPTIONS:
    --count, -n <N>    Number of records to show [default: 5]
    --failed, -f       Show only failed executions
    --json             Output as JSON format
    --verbose, -v      Show detailed stage information
    --help, -h         Show this help message

EXAMPLES:
    # Show last 5 executions
    deno run --allow-all mod.ts status

    # Show last 10 executions
    deno run --allow-all mod.ts status --count 10

    # Show only failed executions
    deno run --allow-all mod.ts status --failed

    # Output as JSON
    deno run --allow-all mod.ts status --json
`);
  }

  /**
   * Show help for retry subcommand
   */
  static showRetryHelp(): void {
    console.log(`
Deno Local CI - Retry Command

Retry failed CI execution using saved history.

USAGE:
    deno run [permissions] mod.ts retry [OPTIONS]

OPTIONS:
    --id <ID>          Retry specific execution by ID
    --stage <STAGE>    Retry only specific stage (type-check, test, lint, format)
    --help, -h         Show this help message

EXAMPLES:
    # Retry last failed execution
    deno run --allow-all mod.ts retry

    # Retry specific execution
    deno run --allow-all mod.ts retry --id abc123

    # Retry only test stage of last failure
    deno run --allow-all mod.ts retry --stage test
`);
  }
}
