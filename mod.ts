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

// === CLI Tool Exports ===
// This package is primarily a CLI tool. Only the main entry point is exported.
// The main function is defined and exported below.

// === Internal Implementation ===

import { CLIParser } from "./src/cli_parser.ts";
import { CIRunner } from "./src/ci_runner.ts";
import { CILogger, LogModeFactory } from "./src/logger.ts";

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
      console.error("❌ Configuration error:", parseResult.error.message);
      Deno.exit(1);
    }

    const options = parseResult.data;

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

    // Build CI configuration
    const configResult = CLIParser.buildCIConfig(options);
    if (!configResult.ok) {
      console.error("❌ Configuration build failed:", configResult.error.message);
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
          console.error("❌ Debug mode requires --log-length and --log-key options");
          Deno.exit(1);
        }
        if (!config.breakdownLoggerConfig) {
          console.error("❌ BreakdownLogger configuration is missing for debug mode");
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
      console.error("❌ Logger creation failed:", loggerResult.error.message);
      Deno.exit(1);
    }

    const logger = loggerResult.data;

    // Create and run CI
    const runnerResult = await CIRunner.create(logger, config, Deno.cwd());
    if (!runnerResult.ok) {
      console.error("❌ CI Runner creation failed:", runnerResult.error.message);
      Deno.exit(1);
    }

    const runner = runnerResult.data;
    const result = await runner.run();

    if (result.success) {
      if (options.logMode !== "silent") {
        console.log("✅ CI passed successfully");
        console.log(`✅ CI completed successfully in ${result.totalDuration}ms`);
        console.log(`📊 Completed stages: ${result.completedStages.length}`);
      }
    } else {
      console.error("❌ CI failed");
      console.error(`❌ CI failed: ${result.errorDetails?.kind || "Unknown error"}`);

      // Show progress information if available
      if (result.progressState) {
        const progress = result.progressState;
        const errorMessage = progress.totalErrorCount
          ? `❌ Errors: ${progress.totalErrorCount} errors in ${progress.errorFiles} files`
          : `❌ Error files: ${progress.errorFiles}/${progress.totalFiles}`;
        console.error(errorMessage);

        if (progress.isFallback && progress.fallbackMessage) {
          console.error(`⚠️  ${progress.fallbackMessage}`);
        }
      }

      console.error(`⏱️  Failed after ${result.totalDuration}ms`);
      console.error(`📊 Completed stages: ${result.completedStages.length}`);
      Deno.exit(1);
    }
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    Deno.exit(1);
  }
}

// Auto-execute when run directly
if (import.meta.main) {
  await main(Deno.args);
}
