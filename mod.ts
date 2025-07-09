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
 *     const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);
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
 * | `--help, -h` | ヘルプメッセージを表示 | - | `--help` |
 * | `--version, -v` | バージョン情報を表示 | - | `--version` |
 *
 * ## 🎯 CI Pipeline Stages
 *
 * The CI runner executes the following stages in order:
 *
 * 1. **Type Check** - Validates TypeScript types across the project
 * 2. **JSR Compatibility Check** - Ensures JSR package compatibility (dry-run only)
 * 3. **Test Execution** - Runs all test files with proper isolation
 * 4. **Lint Check** - Validates code style and catches potential issues
 * 5. **Format Check** - Ensures consistent code formatting
 *
 * Each stage must pass before proceeding to the next. On failure, the pipeline stops and reports
 * detailed error information.
 *
 * ## 📊 実行モード詳細
 *
 * ### All Mode (`--mode all`) - デフォルト
 *
 * - すべてのテストを一度に実行
 * - 最高速だがエラー分離が限定的
 * - シンプルなプロジェクトや最終検証に最適
 * - 失敗時はbatchモードにフォールバック
 * - **推奨用途**: 高速チェック、小規模プロジェクト、CI/CD環境
 *
 * ### Batch Mode (`--mode batch`)
 *
 * - 設定可能なバッチサイズでファイルをグループ化して処理
 * - パフォーマンスとエラー分離のバランス
 * - バッチ失敗時は自動的にsingle-fileモードにフォールバック
 * - 大部分のプロジェクトに最適
 * - **推奨用途**: 中〜大規模プロジェクト、バランス重視
 *
 * ### Single-File Mode (`--mode single-file`)
 *
 * - テストファイルを1つずつ実行
 * - 最大限の分離と詳細なエラー報告
 * - 特定のテスト失敗のデバッグに最適
 * - 実行速度は遅いが最も信頼性が高い
 * - **推奨用途**: 開発環境、デバッグ、詳細なエラー調査
 *
 * ## 🔍 ログモード詳細
 *
 * ### Normal Mode (`--log-mode normal`) - デフォルト
 *
 * - 標準出力とプログレス表示
 * - ステージ完了通知
 * - エラーサマリーとファイルリスト
 * - **推奨用途**: 対話的な開発環境
 *
 * ### Silent Mode (`--log-mode silent`)
 *
 * - 最小限の出力
 * - 重要なエラーと最終結果のみ
 * - **推奨用途**: CI/CD環境、自動化スクリプト
 *
 * ### Error Files Only Mode (`--log-mode error-files-only`)
 *
 * - エラーを含むファイルのみ表示
 * - コンパクトなエラー報告
 * - 迅速な問題特定に最適
 * - **推奨用途**: エラーの迅速な特定、レビュー
 *
 * ### Debug Mode (`--log-mode debug`)
 *
 * - 詳細な実行情報とタイムスタンプ
 * - BreakdownLogger統合（`--log-key`と`--log-length`が必須）
 * - 完全な設定とステート情報のログ
 * - **推奨用途**: トラブルシューティング、詳細分析
 *
 * ## 🏗️ Architecture
 *
 * The CI runner follows Domain-Driven Design principles with clear separation of concerns:
 *
 * ### Core Components
 *
 * - **`CIRunner`** - Main orchestration class managing the complete CI pipeline
 * - **`CIPipelineOrchestrator`** - Manages stage execution flow and dependencies
 * - **`CILogger`** - Structured logging with multiple modes and BreakdownLogger integration
 * - **`ProcessRunner`** - Async process execution with timeout and error handling
 * - **`FileSystemService`** - File discovery and path utilities with type classification
 * - **`CLIParser`** - Command-line argument parsing and validation
 *
 * ### Domain Services
 *
 * - **`ExecutionStrategyService`** - Determines optimal execution strategies based on project characteristics
 * - **`ErrorClassificationService`** - Categorizes and analyzes CI errors for appropriate handling
 * - **`StageInternalFallbackService`** - Implements intelligent fallback logic between execution modes
 * - **`FileClassificationService`** - Classifies project files by type and purpose
 *
 * ## ⚡ Performance Features
 *
 * ### Intelligent Batching
 *
 * - **Configurable Batch Sizes**: Optimize for your system resources (1-100 files per batch)
 * - **Memory Efficiency**: Processes large test suites without memory exhaustion
 * - **Resource Detection**: Automatically adjusts batch sizes based on system capabilities
 *
 * ### Fallback Mechanisms
 *
 * - **Automatic Fallback**: Seamlessly falls back from batch to single-file mode on failures
 * - **Error-Specific Handling**: Different fallback strategies based on error types
 * - **Progressive Degradation**: Maintains functionality even when optimal strategies fail
 *
 * ### Real-time Feedback
 *
 * - **Live Progress Reporting**: See CI progress as it happens
 * - **Immediate Error Feedback**: Get error details as soon as they're detected
 * - **Stage-by-Stage Results**: Clear visibility into each pipeline stage
 *
 * ## 🛡️ Error Handling
 *
 * ### Error Classification
 *
 * - **Type Check Errors**: TypeScript compilation and type validation issues
 * - **Test Failures**: Runtime test failures with detailed stack traces
 * - **JSR Compatibility Issues**: Package compatibility and publishing validation
 * - **Lint Violations**: Code style and quality issues
 * - **Format Inconsistencies**: Code formatting violations
 *
 * ### Fallback Strategies
 *
 * ```typescript
 * // Automatic fallback flow
 * All Mode → Batch Mode → Single-File Mode → Detailed Error Report
 * ```
 *
 * ## 🧪 Testing & Quality
 *
 * This package includes comprehensive test coverage:
 *
 * - **64 Tests** covering all components and integration scenarios
 * - **Unit Tests** for individual components and services
 * - **Integration Tests** for complete CI pipeline flows
 * - **Type Safety Tests** ensuring robust TypeScript integration
 * - **Error Scenario Tests** validating fallback mechanisms
 *
 * ## 🤝 Contributing
 *
 * We welcome contributions! Please follow these steps:
 *
 * 1. **Fork the repository**
 * 2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
 * 3. **Make your changes** with comprehensive tests
 * 4. **Run the CI pipeline**: `deno task ci`
 * 5. **Commit your changes**: `git commit -am 'Add amazing feature'`
 * 6. **Push to the branch**: `git push origin feature/amazing-feature`
 * 7. **Submit a pull request**
 *
 * ## 📄 License
 *
 * MIT License - see the [LICENSE](LICENSE) file for details.
 *
 * ## 🔗 Links
 *
 * - **[JSR Package](https://jsr.io/@aidevtool/ci)** - Official package registry
 * - **[GitHub Repository](https://github.com/tettuan/deno-local-ci)** - Source code and issues
 * - **[Documentation](https://jsr.io/@aidevtool/ci/doc)** - API documentation
 * - **[Issues](https://github.com/tettuan/deno-local-ci/issues)** - Bug reports and feature requests
 * - **[Releases](https://github.com/tettuan/deno-local-ci/releases)** - Version history and changelogs
 *
 * ---
 *
 * **Built with ❤️ for the Deno community**
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
 * // Run with default settings (all mode)
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
