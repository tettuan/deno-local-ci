/**
 * @file cli_parser.ts
 * @description Type-safe CLI parser for 5-stage pipeline CI system
 */

import type { 
  CIConfig, 
  ExecutionMode, 
  LogMode, 
  Result, 
  ValidationError 
} from "./types.ts";
import { BatchSize, BreakdownLoggerEnvConfig } from "./types.ts";

// =============================================================================
// CLI Arguments Definition - コマンドライン引数の型定義
// =============================================================================

interface CLIArgs {
  mode?: "all" | "batch" | "single-file";
  batchSize?: number;
  fallback?: boolean;
  logMode?: "normal" | "silent" | "debug" | "error-files-only";
  logLength?: "W" | "M" | "L";
  logKey?: string;
  help?: boolean;
  version?: boolean;
}

// =============================================================================
// Type-Safe CLI Parser - 全域性原則を適用したCLIパーサー
// =============================================================================

export class TypeSafeCLIParser {
  
  static parse(args: string[]): Result<CIConfig, ValidationError & { message: string }> {
    const argsResult = this.parseArguments(args);
    if (!argsResult.ok) {
      return argsResult;
    }
    
    const parsedArgs = argsResult.data;
    
    // ヘルプまたはバージョン表示
    if (parsedArgs.help) {
      this.printHelp();
      Deno.exit(0);
    }
    
    if (parsedArgs.version) {
      this.printVersion();
      Deno.exit(0);
    }
    
    return this.buildConfig(parsedArgs);
  }
  
  private static parseArguments(args: string[]): Result<CLIArgs, ValidationError & { message: string }> {
    const parsed: CLIArgs = {};
    
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      
      switch (arg) {
        case "--mode":
        case "-m": {
          if (i + 1 >= args.length) {
            return { 
              ok: false, 
              error: { 
                kind: "EmptyInput", 
                message: "Missing value for --mode" 
              }
            };
          }
          const mode = args[i + 1];
          if (!["all", "batch", "single-file"].includes(mode)) {
            return {
              ok: false,
              error: {
                kind: "UnsupportedMode",
                mode,
                message: `Unsupported mode: ${mode}. Valid options: all, batch, single-file`
              }
            };
          }
          parsed.mode = mode as "all" | "batch" | "single-file";
          i += 2;
          break;
        }
          
        case "--batch-size":
        case "-b": {
          if (i + 1 >= args.length) {
            return { 
              ok: false, 
              error: { 
                kind: "EmptyInput", 
                message: "Missing value for --batch-size" 
              }
            };
          }
          const batchSize = parseInt(args[i + 1]);
          if (isNaN(batchSize)) {
            return {
              ok: false,
              error: {
                kind: "ParseError",
                input: args[i + 1],
                message: `Invalid batch size: ${args[i + 1]}`
              }
            };
          }
          parsed.batchSize = batchSize;
          i += 2;
          break;
        }
          
        case "--no-fallback": {
          parsed.fallback = false;
          i++;
          break;
        }
          
        case "--fallback": {
          parsed.fallback = true;
          i++;
          break;
        }
          
        case "--log-mode":
        case "-l": {
          if (i + 1 >= args.length) {
            return { 
              ok: false, 
              error: { 
                kind: "EmptyInput", 
                message: "Missing value for --log-mode" 
              }
            };
          }
          const logMode = args[i + 1];
          if (!["normal", "silent", "debug", "error-files-only"].includes(logMode)) {
            return {
              ok: false,
              error: {
                kind: "UnsupportedMode",
                mode: logMode,
                message: `Unsupported log mode: ${logMode}. Valid options: normal, silent, debug, error-files-only`
              }
            };
          }
          parsed.logMode = logMode as "normal" | "silent" | "debug" | "error-files-only";
          i += 2;
          break;
        }
          
        case "--log-length": {
          if (i + 1 >= args.length) {
            return { 
              ok: false, 
              error: { 
                kind: "EmptyInput", 
                message: "Missing value for --log-length" 
              }
            };
          }
          const logLength = args[i + 1];
          if (!["W", "M", "L"].includes(logLength)) {
            return {
              ok: false,
              error: {
                kind: "PatternMismatch",
                value: logLength,
                pattern: "W|M|L",
                message: `Invalid log length: ${logLength}. Valid options: W, M, L`
              }
            };
          }
          parsed.logLength = logLength as "W" | "M" | "L";
          i += 2;
          break;
        }
          
        case "--log-key": {
          if (i + 1 >= args.length) {
            return { 
              ok: false, 
              error: { 
                kind: "EmptyInput", 
                message: "Missing value for --log-key" 
              }
            };
          }
          parsed.logKey = args[i + 1];
          i += 2;
          break;
        }
          
        case "--help":
        case "-h": {
          parsed.help = true;
          i++;
          break;
        }
          
        case "--version":
        case "-v": {
          parsed.version = true;
          i++;
          break;
        }
          
        default: {
          return {
            ok: false,
            error: {
              kind: "ParseError",
              input: arg,
              message: `Unknown argument: ${arg}`
            }
          };
        }
      }
    }
    
    return { ok: true, data: parsed };
  }
  
  private static buildConfig(args: CLIArgs): Result<CIConfig, ValidationError & { message: string }> {
    // ExecutionMode構築
    const executionMode = this.buildExecutionMode(args);
    if (!executionMode.ok) {
      return executionMode;
    }
    
    // BatchSize構築
    const batchSize = args.batchSize ?? 25;
    const batchSizeResult = BatchSize.create(batchSize);
    if (!batchSizeResult.ok) {
      return batchSizeResult;
    }
    
    // LogMode構築
    const logMode = this.buildLogMode(args);
    if (!logMode.ok) {
      return logMode;
    }
    
    // 環境変数からのデフォルト値
    const fallbackEnabled = args.fallback ?? true;
    
    return {
      ok: true,
      data: {
        mode: executionMode.data,
        fallbackEnabled,
        batchSize: batchSizeResult.data,
        logMode: logMode.data
      }
    };
  }
  
  private static buildExecutionMode(args: CLIArgs): Result<ExecutionMode, ValidationError & { message: string }> {
    const mode = args.mode ?? "single-file"; // デフォルトはsingle-file
    const batchSize = args.batchSize ?? 25;
    
    switch (mode) {
      case "all":
        return { 
          ok: true, 
          data: { 
            kind: "all", 
            projectDirectories: ["."] // デフォルトでカレントディレクトリ
          }
        };
      case "batch":
        return { 
          ok: true, 
          data: { 
            kind: "batch", 
            batchSize,
            failedBatchOnly: false
          }
        };
      case "single-file":
        return { 
          ok: true, 
          data: { 
            kind: "single-file", 
            stopOnFirstError: true
          }
        };
    }
  }
  
  private static buildLogMode(args: CLIArgs): Result<LogMode, ValidationError & { message: string }> {
    const logMode = args.logMode ?? this.getLogModeFromEnv();
    
    switch (logMode) {
      case "normal": {
        return { 
          ok: true, 
          data: { 
            kind: "normal", 
            showSections: true 
          }
        };
      }
      case "silent": {
        return { 
          ok: true, 
          data: { 
            kind: "silent", 
            errorsOnly: true 
          }
        };
      }
      case "error-files-only": {
        return { 
          ok: true, 
          data: { 
            kind: "error-files-only", 
            implicitSilent: true 
          }
        };
      }
      case "debug": {
        const logLength = args.logLength ?? Deno.env.get("LOG_LENGTH") ?? "M";
        const logKey = args.logKey ?? Deno.env.get("LOG_KEY") ?? "";
        
        const envConfigResult = BreakdownLoggerEnvConfig.create(logLength, logKey);
        if (!envConfigResult.ok) {
          return envConfigResult;
        }
        
        return { 
          ok: true, 
          data: { 
            kind: "debug", 
            verboseLevel: "high",
            breakdownLoggerEnv: envConfigResult.data
          }
        };
      }
    }
  }
  
  private static getLogModeFromEnv(): "normal" | "silent" | "debug" | "error-files-only" {
    const logLevel = Deno.env.get("LOG_LEVEL");
    const debug = Deno.env.get("DEBUG");
    
    if (debug === "true" || debug === "1" || logLevel === "debug") {
      return "debug";
    }
    
    if (logLevel === "silent") {
      return "silent";
    }
    
    if (logLevel === "error-files-only") {
      return "error-files-only";
    }
    
    return "normal";
  }
  
  private static printHelp(): void {
    console.log(`
Deno Local CI - Type-safe CI pipeline for Deno projects

USAGE:
    deno_local_ci [OPTIONS]

OPTIONS:
    -m, --mode <MODE>           Execution mode: all, batch, single-file [default: single-file]
    -b, --batch-size <SIZE>     Batch size for batch mode [default: 25]
        --fallback              Enable automatic fallback [default: true]
        --no-fallback           Disable automatic fallback
    -l, --log-mode <MODE>       Log mode: normal, silent, debug, error-files-only [default: normal]
        --log-length <LENGTH>   BreakdownLogger length: W, M, L [default: M]
        --log-key <KEY>         BreakdownLogger filter key [default: ""]
    -h, --help                  Print help information
    -v, --version               Print version information

EXECUTION MODES:
    all                         Execute all files at once (fastest, but less debug info)
    batch                       Execute files in batches (balanced speed and debug info)
    single-file                 Execute files one by one (slowest, but best for debugging)

PIPELINE STAGES:
    1. Type Check               Deno type checking (deno check)
    2. JSR Check                JSR compatibility check (deno publish --dry-run)
    3. Test                     Test execution (deno test)
    4. Lint                     Code linting (deno lint)
    5. Format                   Code formatting check (deno fmt --check)

FALLBACK STRATEGY:
    If fallback is enabled, the system will automatically fall back:
    all → batch → single-file

    Each stage stops on error and does not proceed to the next stage.

ENVIRONMENT VARIABLES:
    LOG_LEVEL                   Log level: normal, silent, debug, error-files-only
    LOG_LENGTH                  BreakdownLogger length: W, M, L
    LOG_KEY                     BreakdownLogger filter key
    DEBUG                       Enable debug mode: true, 1

EXAMPLES:
    deno_local_ci                                    # Default: single-file mode with fallback
    deno_local_ci --mode all                         # All mode (fastest)
    deno_local_ci --mode batch --batch-size 10       # Batch mode with custom size
    deno_local_ci --mode single-file --no-fallback   # Single-file mode without fallback
    deno_local_ci --log-mode debug --log-length L    # Debug mode with detailed logging
    deno_local_ci --log-mode silent                  # Silent mode (errors only)
`);
  }
  
  private static printVersion(): void {
    console.log("Deno Local CI v2.0.0");
  }
}

// =============================================================================
// Convenience Functions - 便利関数
// =============================================================================

export const parseArgs = (args: string[]): Result<CIConfig, ValidationError & { message: string }> => {
  return TypeSafeCLIParser.parse(args);
};

export const parseArgsWithDefaults = (): Result<CIConfig, ValidationError & { message: string }> => {
  return TypeSafeCLIParser.parse(Deno.args);
};
