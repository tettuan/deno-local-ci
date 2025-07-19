# @aidevtool/ci

[![JSR](https://jsr.io/badges/@aidevtool/ci)](https://jsr.io/@aidevtool/ci)
[![GitHub](https://img.shields.io/github/license/tettuan/deno-local-ci)](https://github.com/tettuan/deno-local-ci/blob/main/LICENSE)
[![Tests](https://github.com/tettuan/deno-local-ci/actions/workflows/ci.yml/badge.svg)](https://github.com/tettuan/deno-local-ci/actions/workflows/ci.yml)

A comprehensive TypeScript-based CI runner for Deno projects with robust testing, formatting,
linting, and type checking capabilities. Built with Domain-Driven Design principles and strong type
safety.

## ✨ Features

- 🔄 **Complete CI Pipeline**: Type check → JSR check → Test → Lint → Format
- 🎯 **Multiple Execution Modes**: Single-file, batch, and all modes for different project needs
- 🛡️ **Type Safety**: Full TypeScript support with strict type checking
- 📊 **Comprehensive Reporting**: Detailed error reporting and diagnostics with structured logging
- ⚙️ **Flexible Configuration**: Customizable batch sizes, log modes, and execution options
- 🔧 **Error Handling**: Structured error categorization and intelligent fallback mechanisms
- 📝 **Rich Logging**: Multiple log levels with debug, silent modes, and BreakdownLogger integration
- ⚡ **Performance Optimized**: Memory-efficient processing for large test suites
- 🏗️ **Domain-Driven Design**: Clean architecture with separated concerns and modular components

## 🚀 Installation

### Using JSR (Recommended)

```bash
# Run directly without installation
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# Or add to your project
deno add @aidevtool/ci
```

### Using GitHub

```bash
deno run --allow-read --allow-write --allow-run --allow-env https://raw.githubusercontent.com/tettuan/deno-local-ci/main/mod.ts
```

## 📖 Usage

### Command Line Interface (Main Use Case)

**@aidevtool/ci is primarily designed as a CLI tool.** Run the following commands in your project's root directory:

#### Basic Usage

```bash
# Run with default settings (all-files mode - fastest)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
```

#### Execution Mode Examples

```bash
# All mode: fastest execution (default)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all

# Batch mode: balanced performance and safety
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 10

# Single-file mode: safest with detailed error reporting
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file
```

#### Log Level Examples

```bash
# Normal mode: standard output
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode normal

# Silent mode: minimal output (optimal for CI/CD environments)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode silent

# Error-files-only mode: optimal for error identification
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode error-files-only

# Debug mode: detailed logs with BreakdownLogger integration
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode debug --log-key CI_DEBUG --log-length M
```

#### Directory-Specific Execution

You can target specific directory hierarchies for CI execution:

```bash
# Execute only src/ directory (positional argument)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/

# Execute only lib/ directory (--hierarchy option)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/

# Execute only tests/core/ directory
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/core/

# Combine hierarchy and mode (execute src/ in batch mode)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy src/ --mode batch

# Combine hierarchy and log mode (execute lib/ in debug mode)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/ --log-mode error-files-only
```

#### Advanced Usage Examples

```bash
# Disable fallback and force batch mode
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --no-fallback

# Execute only specific pattern test files
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --filter "*integration*"

# Stop on first error
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --stop-on-first-error

# Specify working directory
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --cwd /path/to/project

# Allow dirty state for JSR check
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --allow-dirty
```

### Programmatic Usage (Advanced)

For direct programmatic usage (advanced use cases):

```typescript
import { CILogger, CIRunner, CLIParser, LogModeFactory, main } from "@aidevtool/ci";

// Simple usage - run CI with default settings
await main(["--mode", "batch"]);

// Advanced usage - full control over CI configuration
const parseResult = CLIParser.parseArgs(["--mode", "single-file", "--log-mode", "debug"]);
if (parseResult.ok) {
  const configResult = CLIParser.buildCIConfig(parseResult.data);
  if (configResult.ok) {
    const config = configResult.data;
    const logMode = config.logMode || LogModeFactory.normal();
    const loggerResult = CILogger.create(logMode, config.breakdownLoggerConfig);

    if (loggerResult.ok) {
      const logger = loggerResult.data;
      const runnerResult = await CIRunner.create(logger, config, Deno.cwd());

      if (runnerResult.ok) {
        const runner = runnerResult.data;
        const result = await runner.run();
        console.log(result.success ? "✅ CI passed" : "❌ CI failed");
      }
    }
  }
}
```

### Using Individual Components

```typescript
import {
  CILogger,
  FileSystemService,
  LogModeFactory,
  ProcessRunner,
  ProjectFileDiscovery,
} from "@aidevtool/ci";

// Use logger with different modes
const debugMode = LogModeFactory.debug();
const loggerResult = CILogger.create(debugMode);
if (loggerResult.ok) {
  const logger = loggerResult.data;
  logger.logInfo("Starting custom CI process");
}

// Use process runner for command execution
const processRunner = new ProcessRunner();
const result = await processRunner.run("deno", ["test", "example.test.ts"]);
console.log(`Process result: ${result.success}`);

// Use file system utilities
const fileSystem = new FileSystemService();
const discovery = new ProjectFileDiscovery(fileSystem);
const projectFiles = await discovery.discoverProjectFiles("./src");
console.log(`Found ${projectFiles.testFiles.length} test files`);
```

## 🔧 Command Line Options

| Option                       | Description                                                 | Default Value        | Example                     |
| ---------------------------- | ----------------------------------------------------------- | -------------------- | --------------------------- |
| `--mode <mode>`              | Execution mode: `all`, `batch`, `single-file` (speed order) | `all`                | `--mode batch`              |
| `--hierarchy <path>`         | Target directory hierarchy (execute specific directory only) | Entire project       | `--hierarchy src/`          |
| `--dir <path>`               | Alias for hierarchy specification (same as `--hierarchy`)   | Entire project       | `--dir lib/`                |
| `<path>`                     | Positional argument for hierarchy (direct path without option) | Entire project       | `src/components/`           |
| `--batch-size <size>`        | Number of files per batch (1-100)                          | `25`                 | `--batch-size 10`           |
| `--fallback`                 | Enable execution strategy fallback                         | `true`               | `--fallback`                |
| `--no-fallback`              | Disable execution strategy fallback                        | -                    | `--no-fallback`             |
| `--log-mode <mode>`          | Log mode: `normal`, `silent`, `debug`, `error-files-only`  | `normal`             | `--log-mode debug`          |
| `--log-key <key>`            | BreakdownLogger key (required for debug mode)              | -                    | `--log-key CI_DEBUG`        |
| `--log-length <length>`      | BreakdownLogger length: `W`, `M`, `L` (required for debug) | -                    | `--log-length M`            |
| `--stop-on-first-error`      | Stop execution on first error                              | `false`              | `--stop-on-first-error`     |
| `--continue-on-error`        | Continue execution after errors                            | `true`               | `--continue-on-error`       |
| `--allow-dirty`              | Allow dirty working directory for JSR check               | `false`              | `--allow-dirty`             |
| `--filter <pattern>`         | Filter test files by pattern                               | -                    | `--filter "*integration*"`  |
| `--cwd <path>`               | Specify working directory                                   | Current directory    | `--cwd /path/to/project`    |
| `--working-directory <path>` | Specify working directory (alias for `--cwd`)              | Current directory    | `--working-directory ./src` |
| `--help, -h`                 | Display help message                                        | -                    | `--help`                    |
| `--version, -v`              | Display version information                                 | -                    | `--version`                 |

### Option Combination Examples

```bash
# Fast execution (for CI/CD environments)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all --log-mode silent

# Detailed debugging in development environment
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file --log-mode debug --log-key DEV --log-length L

# Balanced settings for medium-sized projects
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 15 --log-mode error-files-only

# Execute specific tests only (integration tests)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --filter "*integration*" --stop-on-first-error

# JSR compatibility check with dirty state
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --allow-dirty --log-mode normal

# Hierarchy specification combination examples
# Fast check for src/ directory only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/ --mode all --log-mode silent

# Detailed batch check for lib/ directory
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/ --mode batch --log-mode error-files-only

# Debug tests/ directory in single-file mode
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/ --mode single-file --log-mode debug --log-key TEST --log-length M
```

## 🎯 CI Pipeline Stages

The CI runner executes the following stages in order:

1. **Type Check** - Validates TypeScript types across the project
2. **JSR Compatibility Check** - Ensures JSR package compatibility (dry-run only)
3. **Test Execution** - Runs all test files with proper isolation
4. **Lint Check** - Validates code style and catches potential issues
5. **Format Check** - Ensures consistent code formatting

Each stage must pass before proceeding to the next. On failure, the pipeline stops and reports
detailed error information.

## 🗂️ Directory Hierarchy Targeting

Efficient development for large projects is possible by targeting specific directory hierarchies for CI execution.

### Basic Usage of Hierarchy Specification

```bash
# Hierarchy specification with positional argument (recommended)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/

# Hierarchy specification with --hierarchy option
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/

# --dir option (alias for --hierarchy)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --dir tests/core/
```

### Behavior When Hierarchy is Specified

#### ✅ Stages That Will Execute

1. **Type Check**: `deno check <hierarchy>/` - Type check TypeScript files within specified hierarchy
2. **JSR Check**: **Automatically skipped** - JSR package check always targets the entire project
3. **Test**: `deno test <hierarchy>/` - Execute only test files within specified hierarchy
4. **Lint**: `deno lint <hierarchy>/` - Lint files within specified hierarchy
5. **Format**: `deno fmt --check <hierarchy>/` - Format check files within specified hierarchy

#### 🎯 Target Files (When Hierarchy is Specified)

- **TypeScript files**: `<hierarchy>/**/*.ts`, `<hierarchy>/**/*.tsx`, `<hierarchy>/**/*.d.ts`
- **Test files**: `<hierarchy>/**/*_test.ts`, `<hierarchy>/**/*.test.ts`
- **All source files**: All TypeScript files within the hierarchy

### Practical Hierarchy Specification Examples

```bash
# Check frontend-related files only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/components/

# Check backend API only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/api/

# Check specific service layer only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/services/user/

# Check test directory only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/integration/

# Check utility modules only
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/utils/
```

### Combining Hierarchy Specification and Execution Modes

```bash
# Execute src/ in batch mode (for medium-sized projects)
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/ --mode batch --batch-size 15

# Debug lib/ in single-file mode
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/ --mode single-file --log-mode debug --log-key LIB --log-length M

# Check only error files in tests/
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/ --log-mode error-files-only
```

### Benefits of Hierarchy Specification

- **🚀 Fast Execution**: Accelerate development cycle by checking only necessary parts
- **🎯 Focused Development**: Concentrated verification on modules being worked on
- **📊 Efficient Debugging**: Identify problematic hierarchies and fix them precisely
- **⚡ CI Optimization**: Reduce CI time by checking only changed hierarchies
- **🔍 Gradual Verification**: Improve quality through gradual code verification

### Important Notes

- **JSR Check Auto-Skip**: JSR check is automatically skipped when hierarchy is specified
- **Relative Path Support**: Supports both relative and absolute paths
- **Existence Check**: Shows appropriate error message when non-existent hierarchy is specified
- **Fallback Inheritance**: Execution mode fallback functionality continues to work with hierarchy specification

## 📊 実行モード詳細

### All Mode (`--mode all`) - デフォルト

- すべてのテストを一度に実行
- 最高速だがエラー分離が限定的
- シンプルなプロジェクトや最終検証に最適
- 失敗時はbatchモードにフォールバック
- **推奨用途**: 高速チェック、小規模プロジェクト、CI/CD環境

```bash
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all
```

### Batch Mode (`--mode batch`)

- 設定可能なバッチサイズでファイルをグループ化して処理
- パフォーマンスとエラー分離のバランス
- バッチ失敗時は自動的にsingle-fileモードにフォールバック
- 大部分のプロジェクトに最適
- **推奨用途**: 中〜大規模プロジェクト、バランス重視

```bash
# デフォルトバッチサイズ（25ファイル）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch

# カスタムバッチサイズ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 10
```

### Single-File Mode (`--mode single-file`)

- テストファイルを1つずつ実行
- 最大限の分離と詳細なエラー報告
- 特定のテスト失敗のデバッグに最適
- 実行速度は遅いが最も信頼性が高い
- **推奨用途**: 開発環境、デバッグ、詳細なエラー調査

```bash
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file
```

## 🔍 ログモード詳細

### Normal Mode (`--log-mode normal`) - デフォルト

- 標準出力とプログレス表示
- ステージ完了通知
- エラーサマリーとファイルリスト
- **推奨用途**: 対話的な開発環境

```bash
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode normal
```

### Silent Mode (`--log-mode silent`)

- 最小限の出力
- 重要なエラーと最終結果のみ
- **推奨用途**: CI/CD環境、自動化スクリプト

```bash
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode silent
```

### Error Files Only Mode (`--log-mode error-files-only`)

- エラーを含むファイルのみ表示
- コンパクトなエラー報告
- 迅速な問題特定に最適
- **推奨用途**: エラーの迅速な特定、レビュー

```bash
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode error-files-only
```

### Debug Mode (`--log-mode debug`)

- 詳細な実行情報とタイムスタンプ
- BreakdownLogger統合（`--log-key`と`--log-length`が必須）
- 完全な設定とステート情報のログ
- **推奨用途**: トラブルシューティング、詳細分析

```bash
# BreakdownLoggerとの統合を含む詳細デバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --log-mode debug --log-key CI_DEBUG --log-length M

# 短いメッセージでのデバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --log-mode debug --log-key DEV --log-length W

# 長いメッセージでの詳細デバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --log-mode debug --log-key ANALYSIS --log-length L
```

## 🌍 環境変数

CI実行時に以下の環境変数を使用できます：

```bash
# デバッグログの有効化（--log-mode debugの代替）
export DEBUG=true
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# ログレベルの設定
export LOG_LEVEL=debug
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci

# BreakdownLogger環境変数（デバッグモード使用時）
export CI_LOCAL_KEY=MY_DEBUG_KEY
export CI_LOCAL_LENGTH=M
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode debug --log-key CI_LOCAL --log-length M
```

## ⚡ 実践的な使用パターン

### 開発ワークフロー

```bash
# 1. 開発中の迅速チェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file --log-mode error-files-only

# 2. コミット前の完全チェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch

# 3. プルリクエスト前の最終確認
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all --log-mode silent
```

### 階層指定を活用した開発ワークフロー

```bash
# 1. 作業中のモジュールのみ迅速チェック（src/components/配下）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/components/ --mode single-file --log-mode error-files-only

# 2. API関連のみバッチチェック（src/api/配下）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/api/ --mode batch --log-mode normal

# 3. 新機能のテストのみ実行（tests/features/new-feature/配下）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/features/new-feature/ --mode all

# 4. ライブラリ変更後の影響確認（lib/配下）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/ --mode batch --stop-on-first-error

# 5. ユーティリティ修正後の検証（src/utils/配下）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/utils/ --mode all --log-mode silent
```

### CI/CD環境

```bash
# GitHub Actions等での使用
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --log-mode silent --no-fallback

# Jenkins等での使用（詳細ログ）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --log-mode normal

# Docker環境での使用
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all --log-mode silent
```

### デバッグ・トラブルシューティング

```bash
# 特定の問題の詳細調査
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --mode single-file --log-mode debug --log-key ISSUE_123 --log-length L

# 特定パターンのテストのみデバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --filter "*api*" --log-mode debug --log-key API_TEST --log-length M

# エラー後即座に停止してデバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci \
  --stop-on-first-error --log-mode debug --log-key FIRST_ERROR --log-length L
```

## 🏗️ Architecture

The CI runner follows Domain-Driven Design principles with clear separation of concerns:

### Core Components

- **`CIRunner`** - Main orchestration class managing the complete CI pipeline
- **`CIPipelineOrchestrator`** - Manages stage execution flow and dependencies
- **`CILogger`** - Structured logging with multiple modes and BreakdownLogger integration
- **`ProcessRunner`** - Async process execution with timeout and error handling
- **`FileSystemService`** - File discovery and path utilities with type classification
- **`CLIParser`** - Command-line argument parsing and validation

### Domain Services

- **`ExecutionStrategyService`** - Determines optimal execution strategies based on project
  characteristics
- **`ErrorClassificationService`** - Categorizes and analyzes CI errors for appropriate handling
- **`StageInternalFallbackService`** - Implements intelligent fallback logic between execution modes
- **`FileClassificationService`** - Classifies project files by type and purpose

### Infrastructure Layer

- **`DenoCommandRunner`** - Deno-specific command execution and environment management
- **`ProjectFileDiscovery`** - Discovers and categorizes project files across directories
- **`BreakdownLoggerEnvConfig`** - Configuration management for enhanced debugging

## ⚡ Performance Features

### Intelligent Batching

- **Configurable Batch Sizes**: Optimize for your system resources (1-100 files per batch)
- **Memory Efficiency**: Processes large test suites without memory exhaustion
- **Resource Detection**: Automatically adjusts batch sizes based on system capabilities

### Fallback Mechanisms

- **Automatic Fallback**: Seamlessly falls back from batch to single-file mode on failures
- **Error-Specific Handling**: Different fallback strategies based on error types
- **Progressive Degradation**: Maintains functionality even when optimal strategies fail

### Real-time Feedback

- **Live Progress Reporting**: See CI progress as it happens
- **Immediate Error Feedback**: Get error details as soon as they're detected
- **Stage-by-Stage Results**: Clear visibility into each pipeline stage

## 🛡️ Error Handling

### Error Classification

- **Type Check Errors**: TypeScript compilation and type validation issues
- **Test Failures**: Runtime test failures with detailed stack traces
- **JSR Compatibility Issues**: Package compatibility and publishing validation
- **Lint Violations**: Code style and quality issues
- **Format Inconsistencies**: Code formatting violations

### Fallback Strategies

```typescript
// Automatic fallback flow
All Mode → Batch Mode → Single-File Mode → Detailed Error Report
```

### Error Reporting

- Structured error messages with context
- File-specific error isolation
- Aggregated error summaries
- Actionable recommendations for fixes

## 🧪 Testing & Quality

This package includes comprehensive test coverage:

- **64 Tests** covering all components and integration scenarios
- **Unit Tests** for individual components and services
- **Integration Tests** for complete CI pipeline flows
- **Type Safety Tests** ensuring robust TypeScript integration
- **Error Scenario Tests** validating fallback mechanisms

Run tests locally:

```bash
deno test --allow-read --allow-write --allow-run --allow-env
```

## 📋 Development Workflow

### Local Development

```bash
# Clone the repository
git clone https://github.com/tettuan/deno-local-ci.git
cd deno-local-ci

# Run CI on the project itself
deno task ci

# Run tests
deno task test

# Format code
deno task fmt

# Lint code
deno task lint

# Type check
deno task check
```

### Available Tasks

| Task        | Command               | Description               |
| ----------- | --------------------- | ------------------------- |
| `ci`        | `deno task ci`        | Run full CI pipeline      |
| `ci-debug`  | `deno task ci-debug`  | Run CI with debug logging |
| `ci-silent` | `deno task ci-silent` | Run CI in silent mode     |
| `ci-batch`  | `deno task ci-batch`  | Run CI in batch mode      |
| `ci-all`    | `deno task ci-all`    | Run CI in all mode        |
| `test`      | `deno task test`      | Run test suite            |
| `fmt`       | `deno task fmt`       | Format code               |
| `lint`      | `deno task lint`      | Lint code                 |
| `check`     | `deno task check`     | Type check                |

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with comprehensive tests
4. **Run the CI pipeline**: `deno task ci`
5. **Commit your changes**: `git commit -am 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Submit a pull request**

### Development Guidelines

- Maintain strong TypeScript typing
- Follow Domain-Driven Design principles
- Add comprehensive test coverage
- Update documentation for new features
- Ensure all CI stages pass

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **[JSR Package](https://jsr.io/@aidevtool/ci)** - Official package registry
- **[GitHub Repository](https://github.com/tettuan/deno-local-ci)** - Source code and issues
- **[Documentation](https://jsr.io/@aidevtool/ci/doc)** - API documentation
- **[Issues](https://github.com/tettuan/deno-local-ci/issues)** - Bug reports and feature requests
- **[Releases](https://github.com/tettuan/deno-local-ci/releases)** - Version history and changelogs

---

**Built with ❤️ for the Deno community**
