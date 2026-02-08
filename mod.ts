/**
 * # @aidevtool/ci
 *
 * A comprehensive TypeScript-based CI runner for Deno projects with robust testing, formatting,
 * linting, and type checking capabilities. Built with Domain-Driven Design principles and strong type
 * safety.
 *
 * ## ✨ Features
 *
 * - 🔄 **Complete CI Pipeline**: Type check → JSR check → Test → Lint → Format
 * - 🎯 **Multiple Execution Modes**: Single-file, batch, and all modes for different project needs
 * - 🛡️ **Type Safety**: Full TypeScript support with strict type checking
 * - 📊 **Comprehensive Reporting**: Detailed error reporting and diagnostics with structured logging
 * - ⚙️ **Flexible Configuration**: Customizable batch sizes, log modes, and execution options
 * - 🔧 **Error Handling**: Structured error categorization and intelligent fallback mechanisms
 * - 📝 **Rich Logging**: Multiple log levels with debug, silent modes, and BreakdownLogger integration
 * - ⚡ **Performance Optimized**: Memory-efficient processing for large test suites
 * - 🏗️ **Domain-Driven Design**: Clean architecture with separated concerns and modular components
 *
 * ## 🚀 Installation
 *
 * ### Using JSR (Recommended)
 *
 * ```bash
 * # Run directly without installation
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
 *
 * # Or add to your project
 * deno add @aidevtool/ci
 * ```
 *
 * ### Using GitHub
 *
 * ```bash
 * deno run --allow-read --allow-write --allow-run --allow-env https://raw.githubusercontent.com/tettuan/deno-local-ci/main/mod.ts
 * ```
 *
 * ## 📖 Usage
 *
 * ### Command Line Interface (Main Use Case)
 *
 * @aidevtool/ci はCLIツールとしての使用がメインユースケースです。プロジェクトのルートディレクトリで以下のコマンドを実行してください：
 *
 * #### 基本的な使用方法
 *
 * ```bash
 * # デフォルト設定で実行（全ファイル同時実行モード - 最高速）
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
 * ```
 *
 * #### 実行モード別の使用例
 *
 * ```bash
 * # 全ファイル同時実行：最高速（デフォルト）
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all
 *
 * # バッチモード：パフォーマンスと安全性のバランス
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 10
 *
 * # シングルファイルモード：最も安全で詳細なエラー報告
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file
 * ```
 *
 * #### ログレベル別の使用例
 *
 * ```bash
 * # 通常モード：標準的な出力
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode normal
 *
 * # サイレントモード：最小限の出力（CI/CD環境に最適）
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode silent
 *
 * # エラーファイルのみ表示：エラーの特定に最適
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode error-files-only
 *
 * # デバッグモード：詳細なログとBreakdownLogger統合
 * deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode debug --log-key CI_DEBUG --log-length M
 * ```
 *
 * ### Programmatic Usage (Advanced)
 *
 * プログラムから直接使用する場合（高度な用途）：
 *
 * ```typescript
 * import { CILogger, CIRunner, CLIParser, LogModeFactory, main } from "@aidevtool/ci";
 *
 * // シンプルな使用方法 - デフォルト設定でCI実行
 * await main(["--mode", "batch"]);
 *
 * // 高度な使用方法 - CI設定の完全制御
 * const parseResult = CLIParser.parseArgs(["--mode", "single-file", "--log-mode", "debug"]);
 * if (parseResult.ok) {
 *   const configResult = CLIParser.buildCIConfig(parseResult.data);
 *   if (configResult.ok) {
 *     const config = configResult.data;
 *     const logMode = config.logMode || LogModeFactory.normal();
 *     const loggerResult = CILogger.create(logMode);
 *
 *     if (loggerResult.ok) {
 *       const logger = loggerResult.data;
 *       const runnerResult = await CIRunner.create(logger, config, Deno.cwd());
 *
 *       if (runnerResult.ok) {
 *         const runner = runnerResult.data;
 *         const result = await runner.run();
 *         console.log(result.success ? "✅ CI passed" : "❌ CI failed");
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ### Using Individual Components
 *
 * ```typescript
 * import {
 *   CILogger,
 *   FileSystemService,
 *   LogModeFactory,
 *   ProcessRunner,
 *   ProjectFileDiscovery,
 * } from "@aidevtool/ci";
 *
 * // Use logger with different modes
 * const debugMode = LogModeFactory.debug();
 * const loggerResult = CILogger.create(debugMode);
 * if (loggerResult.ok) {
 *   const logger = loggerResult.data;
 *   logger.logInfo("Starting custom CI process");
 * }
 *
 * // Use process runner for command execution
 * const processRunner = new ProcessRunner();
 * const result = await processRunner.run("deno", ["test", "example.test.ts"]);
 * console.log(`Process result: ${result.success}`);
 *
 * // Use file system utilities
 * const fileSystem = new FileSystemService();
 * const discovery = new ProjectFileDiscovery(fileSystem);
 * const projectFiles = await discovery.discoverProjectFiles("./src");
 * console.log(`Found ${projectFiles.testFiles.length} test files`);
 * ```
 *
 * ## 🔧 コマンドライン引数オプション
 *
 * | オプション | 説明 | デフォルト値 | 例 |
 * |---|---|---|---|
 * | `--mode <mode>` | 実行モード: `all`, `batch`, `single-file`（実行速度順） | `all` | `--mode batch` |
 * | `--batch-size <size>` | バッチあたりのファイル数 (1-100) | `25` | `--batch-size 10` |
 * | `--fallback` | 実行戦略のフォールバックを有効化 | `true` | `--fallback` |
 * | `--no-fallback` | 実行戦略のフォールバックを無効化 | - | `--no-fallback` |
 * | `--log-mode <mode>` | ログモード: `normal`, `silent`, `debug`, `error-files-only` | `normal` | `--log-mode debug` |
 * | `--log-key <key>` | BreakdownLoggerキー（デバッグモード必須） | - | `--log-key CI_DEBUG` |
 * | `--log-length <length>` | BreakdownLogger長さ: `W`, `M`, `L`（デバッグモード必須） | - | `--log-length M` |
 * | `--stop-on-first-error` | 最初のエラーで実行を停止 | `false` | `--stop-on-first-error` |
 * | `--continue-on-error` | エラー後も実行を継続 | `true` | `--continue-on-error` |
 * | `--allow-dirty` | JSRチェックでdirtyな作業ディレクトリを許可 | `false` | `--allow-dirty` |
 * | `--filter <pattern>` | テストファイルをパターンでフィルタ | - | `--filter "*integration*"` |
 * | `--cwd <path>` | 作業ディレクトリを指定 | カレントディレクトリ | `--cwd /path/to/project` |
 * | `--working-directory <path>` | 作業ディレクトリを指定（`--cwd`のエイリアス） | カレントディレクトリ | `--working-directory ./src` |
 * | `--hierarchy <path>` | 階層指定でCI実行対象を特定のディレクトリに限定 | プロジェクト全体 | `--hierarchy src/` |
 * | `--dir <path>` | 階層指定の短縮形（`--hierarchy`のエイリアス） | - | `--dir lib/core/` |
 * | `--help, -h` | ヘルプメッセージを表示 | - | `--help` |
 * | `--version, -v` | バージョン情報を表示 | - | `--version` |
 */

// === Exports ===

// === Public API Exports ===
// Core types
export type {
  CIConfig,
  CIError,
  CIStage,
  CISummaryStats,
  EnhancedProgressIndicator,
  ExecutionMode,
  ExecutionRecord,
  FailedBatchInfo,
  HistoryFile,
  LogMode,
  ProcessResult,
  ProgressIndicator,
  Result,
  StageExecutionRecord,
  StageResult,
  TestFileInfo,
  TestStats,
  ValidationError,
} from "./src/types.ts";

// Core classes
export { BreakdownLoggerEnvConfig, ExecutionStrategy } from "./src/types.ts";
export { CIRunner } from "./src/ci_runner.ts";
export type { CIExecutionResult } from "./src/ci_runner.ts";
export { CILogger, LogModeFactory } from "./src/logger.ts";
export { CLIParser } from "./src/cli_parser.ts";
export { FileSystemService, ProjectFileDiscovery } from "./src/file_system.ts";
export { DenoCommandRunner, ProcessRunner } from "./src/process_runner.ts";
export { createExecutionRecord, HistoryStore } from "./src/history_store.ts";

// Domain services
export {
  CIPipelineOrchestrator,
  ErrorClassificationService,
  ExecutionStrategyService,
  FileClassificationService,
  StageInternalFallbackService,
} from "./src/domain_services.ts";

// === Internal Implementation ===

import { CLIParser } from "./src/cli_parser.ts";
import type { CLIOptions, RetryOptions, StatusOptions } from "./src/cli_parser.ts";
import { CIRunner } from "./src/ci_runner.ts";
import { CILogger, LogModeFactory } from "./src/logger.ts";
import { HistoryStore } from "./src/history_store.ts";
import type { ExecutionRecord } from "./src/types.ts";

/**
 * Main entry point for the CI tool
 *
 * Parses command line arguments and executes the CI pipeline
 *
 * @param args - Command line arguments
 */
export async function main(args: string[]): Promise<void> {
  try {
    // Parse CLI arguments
    const parseResult = CLIParser.parseArgs(args);
    if (!parseResult.ok) {
      console.error("Configuration error:", parseResult.error.message);
      Deno.exit(1);
    }

    const options = parseResult.data;

    // Route to appropriate subcommand handler
    switch (options.subcommand) {
      case "status":
        await handleStatusCommand(options);
        break;
      case "retry":
        await handleRetryCommand(options);
        break;
      case "run":
      default:
        await handleRunCommand(options);
        break;
    }
  } catch (error) {
    console.error("Unexpected error:", error);
    Deno.exit(1);
  }
}

/**
 * Handle the 'status' subcommand - display execution history
 */
async function handleStatusCommand(options: CLIOptions): Promise<void> {
  // Handle help flag
  if (options.help) {
    CLIParser.showStatusHelp();
    Deno.exit(0);
  }

  const statusOptions: StatusOptions = options.statusOptions ?? { count: 5 };

  // Create HistoryStore
  const historyStoreResult = HistoryStore.create(Deno.cwd());
  if (!historyStoreResult.ok) {
    console.error("Failed to access history:", historyStoreResult.error.message);
    Deno.exit(1);
  }

  const historyStore = historyStoreResult.data;

  // Get executions based on options
  let executions: ExecutionRecord[];
  if (statusOptions.failed) {
    const result = await historyStore.getFailedExecutions();
    if (!result.ok) {
      console.error("Failed to load history:", result.error.message);
      Deno.exit(1);
    }
    executions = result.data.slice(0, statusOptions.count ?? 5);
  } else {
    const result = await historyStore.getRecent(statusOptions.count ?? 5);
    if (!result.ok) {
      console.error("Failed to load history:", result.error.message);
      Deno.exit(1);
    }
    executions = result.data;
  }

  // Display results
  if (statusOptions.json) {
    console.log(JSON.stringify(executions, null, 2));
  } else {
    displayExecutionHistory(executions, statusOptions.verbose ?? false);
  }
}

/**
 * Display execution history in human-readable format
 */
function displayExecutionHistory(executions: ExecutionRecord[], verbose: boolean): void {
  if (executions.length === 0) {
    console.log("No execution history found.");
    console.log("Run CI to create history: deno run --allow-all mod.ts");
    return;
  }

  console.log("\nCI Execution History");
  console.log("=".repeat(60));

  for (const exec of executions) {
    const status = exec.success ? "SUCCESS" : "FAILURE";
    const statusIcon = exec.success ? "[OK]" : "[FAIL]";
    const duration = (exec.totalDuration / 1000).toFixed(2);
    const date = new Date(exec.timestamp).toLocaleString();

    console.log(`\n${statusIcon} [${date}] ID: ${exec.id} - ${status} (${duration}s)`);

    // Git info
    if (exec.git?.branch || exec.git?.commit) {
      const gitInfo = [exec.git.branch, exec.git.commit].filter(Boolean).join(" @ ");
      console.log(`  Branch: ${gitInfo}`);
    }

    // Config info
    console.log(
      `  Mode: ${exec.config.mode}${
        exec.config.hierarchy ? ` (hierarchy: ${exec.config.hierarchy})` : ""
      }`,
    );

    // Stage details
    if (verbose || !exec.success) {
      for (const stage of exec.stages) {
        const stageIcon = stage.status === "success"
          ? "[OK]"
          : stage.status === "failure"
          ? "[FAIL]"
          : "[SKIP]";
        const stageDuration = stage.duration > 0 ? ` (${(stage.duration / 1000).toFixed(2)}s)` : "";

        console.log(`  [Stage/${stage.stage}] ${stageIcon}${stageDuration}`);

        if (stage.strategy) {
          console.log(`    [Strategy/${stage.strategy}]`);
        }

        if (stage.fallback) {
          console.log(`    [Fallback/${stage.fallback.from}->${stage.fallback.to}]`);
        }

        if (stage.error && stage.status === "failure") {
          const errorMsg = stage.error.message?.substring(0, 100) || "Unknown error";
          console.log(
            `    Error: ${errorMsg}${
              stage.error.message && stage.error.message.length > 100 ? "..." : ""
            }`,
          );
        }

        if (stage.testSummary) {
          console.log(`    ${stage.testSummary}`);
        }
      }
    }

    // Failed batch info
    if (exec.failedBatchInfo) {
      console.log(
        `  Failed batch: files ${exec.failedBatchInfo.startIndex}-${exec.failedBatchInfo.endIndex}`,
      );
      if (verbose) {
        console.log(`    Files: ${exec.failedBatchInfo.files.join(", ")}`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Showing ${executions.length} execution(s)`);
}

/**
 * Handle the 'retry' subcommand - retry failed execution
 */
async function handleRetryCommand(options: CLIOptions): Promise<void> {
  // Handle help flag
  if (options.help) {
    CLIParser.showRetryHelp();
    Deno.exit(0);
  }

  const retryOptions: RetryOptions = options.retryOptions ?? {};

  // Create HistoryStore
  const historyStoreResult = HistoryStore.create(Deno.cwd());
  if (!historyStoreResult.ok) {
    console.error("Failed to access history:", historyStoreResult.error.message);
    Deno.exit(1);
  }

  const historyStore = historyStoreResult.data;

  // Find execution to retry
  let execution: ExecutionRecord | null = null;

  if (retryOptions.id) {
    // Find by ID
    const targetId = retryOptions.id;
    const recentResult = await historyStore.getRecent(50);
    if (recentResult.ok) {
      execution = recentResult.data.find((e) => e.id === targetId || e.id.startsWith(targetId)) ??
        null;
    }
    if (!execution) {
      console.error(`Execution not found: ${retryOptions.id}`);
      Deno.exit(1);
    }
  } else {
    // Get last failed execution
    const failedResult = await historyStore.getFailedExecutions();
    if (!failedResult.ok) {
      console.error("Failed to load history:", failedResult.error.message);
      Deno.exit(1);
    }
    if (failedResult.data.length === 0) {
      console.log("No failed executions found. Nothing to retry.");
      Deno.exit(0);
    }
    execution = failedResult.data[0];
  }

  console.log(`Retrying execution: ${execution.id}`);
  console.log(`  Original: ${execution.success ? "SUCCESS" : "FAILURE"} at ${execution.timestamp}`);
  console.log(`  Mode: ${execution.config.mode}`);

  // Build retry configuration
  const retryConfig = buildRetryConfig(execution, retryOptions);

  // Create logger
  const logMode = LogModeFactory.normal();
  const loggerResult = CILogger.create(logMode);
  if (!loggerResult.ok) {
    console.error("Logger creation failed:", loggerResult.error.message);
    Deno.exit(1);
  }

  // Create and run CI
  const runnerResult = await CIRunner.create(loggerResult.data, retryConfig, Deno.cwd());
  if (!runnerResult.ok) {
    console.error("CI Runner creation failed:", runnerResult.error.message);
    Deno.exit(1);
  }

  console.log("\nStarting retry...\n");

  const result = await runnerResult.data.run();

  if (result.success) {
    console.log("\n[OK] Retry succeeded!");
  } else {
    console.error("\n[FAIL] Retry failed.");
    console.error(`Error: ${result.errorDetails?.kind || "Unknown error"}`);
    Deno.exit(1);
  }
}

/**
 * Build CI configuration for retry based on original execution
 */
function buildRetryConfig(
  execution: ExecutionRecord,
  retryOptions: RetryOptions,
): import("./src/types.ts").CIConfig {
  // Reconstruct mode from saved config
  let mode: import("./src/types.ts").ExecutionMode;
  const hierarchy = execution.config.hierarchy;

  switch (execution.config.mode) {
    case "batch":
      mode = {
        kind: "batch",
        batchSize: execution.config.batchSize ?? 25,
        failedBatchOnly: true,
        hierarchy,
      };
      break;
    case "single-file":
      mode = {
        kind: "single-file",
        stopOnFirstError: false,
        hierarchy,
      };
      break;
    case "all":
    default:
      // For retry, use batch mode for better error isolation
      mode = {
        kind: "batch",
        batchSize: execution.config.batchSize ?? 10,
        failedBatchOnly: false,
        hierarchy,
      };
  }

  // If specific stage requested, we'd filter here (future enhancement)
  if (retryOptions.stage) {
    console.log(`  Targeting stage: ${retryOptions.stage}`);
  }

  return {
    mode,
    hierarchy,
    fallbackEnabled: execution.config.fallbackEnabled,
    batchSize: execution.config.batchSize,
  };
}

/**
 * Delegate CI result summarization to haiku via pipe.
 * Runs CI directly, captures output, pipes to claude -p --model haiku for summarization.
 */
async function delegateToHaiku(options: CLIOptions): Promise<void> {
  // Build CI command args (without --use-haiku)
  const ciArgs = ["run", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "mod.ts"];
  if (options.allowDirty) ciArgs.push("--allow-dirty");
  if (options.hierarchy) ciArgs.push("--hierarchy", options.hierarchy);
  if (options.mode) ciArgs.push("--mode", options.mode);
  if (options.batchSize) ciArgs.push("--batch-size", String(options.batchSize));

  // Run CI and capture output
  const ci = new Deno.Command("deno", {
    args: ciArgs,
    stdout: "piped",
    stderr: "piped",
  });
  const ciResult = await ci.output();
  const ciOutput = new TextDecoder().decode(ciResult.stdout) +
    new TextDecoder().decode(ciResult.stderr);

  // Pipe CI output to haiku via stdin for structured JSONL summarization
  const jsonSchema = JSON.stringify({
    type: "object",
    properties: {
      status: { type: "string", enum: ["PASS", "FAIL"] },
      summary: { type: "string", maxLength: 80 },
      error_count: { type: "integer" },
      errors: {
        type: "array",
        items: { type: "string" },
        description: "1-level directory paths with errors, e.g. ['src/', 'tests/error_tests/']",
      },
    },
    required: ["status", "summary", "error_count", "errors"],
  });
  const systemPrompt =
    "CI出力→JSON。summary=1行要約。error_count=エラー総数(成功時0)。errorsは1階層dirパスのみ。ファイル列挙禁止。";
  const haiku = new Deno.Command("claude", {
    args: [
      "-p",
      "--model",
      "haiku",
      "--system-prompt",
      systemPrompt,
      "--output-format",
      "json",
      "--json-schema",
      jsonSchema,
      "--tools",
      "",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  });
  const haikuProcess = haiku.spawn();
  const writer = haikuProcess.stdin.getWriter();
  await writer.write(new TextEncoder().encode(ciOutput));
  await writer.close();
  const haikuResult = await haikuProcess.output();

  // Extract structured result from claude JSON output and emit as single JSONL line
  const haikuOutput = new TextDecoder().decode(haikuResult.stdout).trim();
  try {
    const messages = JSON.parse(haikuOutput);
    // Find the StructuredOutput tool_use in the message array
    let structuredResult = null;
    for (const msg of Array.isArray(messages) ? messages : [messages]) {
      const content = msg?.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use" && block.name === "StructuredOutput") {
            structuredResult = block.input;
          }
        }
      }
    }
    console.log(JSON.stringify(structuredResult ?? messages));
  } catch {
    console.log(haikuOutput);
  }

  Deno.exit(ciResult.code === 0 ? haikuResult.code : ciResult.code);
}

/**
 * Handle the default 'run' subcommand - execute CI pipeline
 */
async function handleRunCommand(options: CLIOptions): Promise<void> {
  // Handle help flag
  if (options.help) {
    CLIParser.showHelp();
    Deno.exit(0);
  }

  // Handle version flag
  if (options.version) {
    CLIParser.showVersion();
    Deno.exit(0);
  }

  // When --use-haiku is specified, delegate CI execution to haiku via claude CLI
  if (options.useHaiku) {
    await delegateToHaiku(options);
    return;
  }

  // Build CI configuration
  const configResult = CLIParser.buildCIConfig(options);
  if (!configResult.ok) {
    console.error("Configuration build failed:", configResult.error.message);
    Deno.exit(1);
  }

  const config = configResult.data;

  // Create logger with appropriate mode
  let logMode;
  switch (options.logMode) {
    case "silent":
      logMode = LogModeFactory.silent();
      break;
    case "debug":
      if (!options.logLength || !options.logKey) {
        console.error("Debug mode requires --log-length and --log-key options");
        Deno.exit(1);
      }
      if (!config.breakdownLoggerConfig) {
        console.error("BreakdownLogger configuration is missing for debug mode");
        Deno.exit(1);
      }
      logMode = LogModeFactory.debug(
        "high",
        config.breakdownLoggerConfig.logLength,
        config.breakdownLoggerConfig.logKey,
      );
      break;
    case "error-files-only":
      logMode = LogModeFactory.errorFilesOnly();
      break;
    default:
      logMode = LogModeFactory.normal();
      break;
  }

  const loggerResult = CILogger.create(logMode);
  if (!loggerResult.ok) {
    console.error("Logger creation failed:", loggerResult.error.message);
    Deno.exit(1);
  }

  const logger = loggerResult.data;

  // Create and run CI
  const runnerResult = await CIRunner.create(logger, config, Deno.cwd());
  if (!runnerResult.ok) {
    console.error("CI Runner creation failed:", runnerResult.error.message);
    Deno.exit(1);
  }

  const runner = runnerResult.data;
  const result = await runner.run();

  const totalStages = result.completedStages.length;
  const passedStages = result.completedStages.filter((s) => s.kind === "success").length;
  const durationSec = (result.totalDuration / 1000).toFixed(1);

  if (result.success) {
    if (options.logMode !== "silent") {
      console.log(`ALL PASSED ${passedStages}/${totalStages} stages ${durationSec}s`);
    }
  } else {
    console.error(`FAILED ${passedStages}/${totalStages} stages ${durationSec}s`);
  }

  if (!result.success) {
    Deno.exit(1);
  }
}

// Auto-execute when run directly
if (import.meta.main) {
  await main(Deno.args);
}
