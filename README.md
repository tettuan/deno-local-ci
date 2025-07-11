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

@aidevtool/ciは**CLIツールとしての使用がメインユースケース**です。プロジェクトのルートディレクトリで以下のコマンドを実行してください：

#### 基本的な使用方法

```bash
# デフォルト設定で実行（全ファイル同時実行モード - 最高速）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci
```

#### 実行モード別の使用例

```bash
# 全ファイル同時実行：最高速（デフォルト）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all

# バッチモード：パフォーマンスと安全性のバランス
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 10

# シングルファイルモード：最も安全で詳細なエラー報告
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file
```

#### ログレベル別の使用例

```bash
# 通常モード：標準的な出力
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode normal

# サイレントモード：最小限の出力（CI/CD環境に最適）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode silent

# エラーファイルのみ表示：エラーの特定に最適
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode error-files-only

# デバッグモード：詳細なログとBreakdownLogger統合
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --log-mode debug --log-key CI_DEBUG --log-length M
```

#### 階層指定実行

特定のディレクトリ階層のみを対象としたCI実行が可能です：

```bash
# src/ディレクトリのみを対象とした実行（位置引数）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/

# lib/ディレクトリのみを対象とした実行（--hierarchyオプション）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/

# tests/core/ディレクトリのみを対象とした実行
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/core/

# 階層指定とモード組み合わせ（src/配下をバッチモードで実行）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy src/ --mode batch

# 階層指定とログモード組み合わせ（lib/配下をデバッグモードで実行）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/ --log-mode error-files-only
```

#### 高度な使用例

```bash
# フォールバックを無効化してバッチモードを強制
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --no-fallback

# 特定のパターンのテストファイルのみ実行
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --filter "*integration*"

# 最初のエラーで停止
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --stop-on-first-error

# 作業ディレクトリを指定
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --cwd /path/to/project

# JSRチェックでdirtyな状態を許可
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --allow-dirty
```

### Programmatic Usage (Advanced)

プログラムから直接使用する場合（高度な用途）：

```typescript
import { CILogger, CIRunner, CLIParser, LogModeFactory, main } from "@aidevtool/ci";

// シンプルな使用方法 - デフォルト設定でCI実行
await main(["--mode", "batch"]);

// 高度な使用方法 - CI設定の完全制御
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

## 🔧 コマンドライン引数オプション

| オプション                   | 説明                                                        | デフォルト値         | 例                          |
| ---------------------------- | ----------------------------------------------------------- | -------------------- | --------------------------- |
| `--mode <mode>`              | 実行モード: `all`, `batch`, `single-file`（実行速度順）     | `all`                | `--mode batch`              |
| `--hierarchy <path>`         | 対象ディレクトリ階層の指定（特定ディレクトリのみ実行）      | プロジェクト全体     | `--hierarchy src/`          |
| `--dir <path>`               | 階層指定のエイリアス（`--hierarchy`と同じ）                 | プロジェクト全体     | `--dir lib/`                |
| `<path>`                     | 位置引数での階層指定（オプションなしで直接パス指定）        | プロジェクト全体     | `src/components/`           |
| `--batch-size <size>`        | バッチあたりのファイル数 (1-100)                            | `25`                 | `--batch-size 10`           |
| `--fallback`                 | 実行戦略のフォールバックを有効化                            | `true`               | `--fallback`                |
| `--no-fallback`              | 実行戦略のフォールバックを無効化                            | -                    | `--no-fallback`             |
| `--log-mode <mode>`          | ログモード: `normal`, `silent`, `debug`, `error-files-only` | `normal`             | `--log-mode debug`          |
| `--log-key <key>`            | BreakdownLoggerキー（デバッグモード必須）                   | -                    | `--log-key CI_DEBUG`        |
| `--log-length <length>`      | BreakdownLogger長さ: `W`, `M`, `L`（デバッグモード必須）    | -                    | `--log-length M`            |
| `--stop-on-first-error`      | 最初のエラーで実行を停止                                    | `false`              | `--stop-on-first-error`     |
| `--continue-on-error`        | エラー後も実行を継続                                        | `true`               | `--continue-on-error`       |
| `--allow-dirty`              | JSRチェックでdirtyな作業ディレクトリを許可                  | `false`              | `--allow-dirty`             |
| `--filter <pattern>`         | テストファイルをパターンでフィルタ                          | -                    | `--filter "*integration*"`  |
| `--cwd <path>`               | 作業ディレクトリを指定                                      | カレントディレクトリ | `--cwd /path/to/project`    |
| `--working-directory <path>` | 作業ディレクトリを指定（`--cwd`のエイリアス）               | カレントディレクトリ | `--working-directory ./src` |
| `--help, -h`                 | ヘルプメッセージを表示                                      | -                    | `--help`                    |
| `--version, -v`              | バージョン情報を表示                                        | -                    | `--version`                 |

### オプションの組み合わせ例

```bash
# 高速実行（CI/CD環境向け）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode all --log-mode silent

# 開発環境での詳細デバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode single-file --log-mode debug --log-key DEV --log-length L

# 中規模プロジェクト向けバランス設定
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --mode batch --batch-size 15 --log-mode error-files-only

# 特定のテストのみ実行（統合テスト）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --filter "*integration*" --stop-on-first-error

# dirtyな状態でのJSR互換性チェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --allow-dirty --log-mode normal

# 階層指定の組み合わせ例
# src/配下のみを高速チェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/ --mode all --log-mode silent

# lib/配下をバッチモードで詳細チェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/ --mode batch --log-mode error-files-only

# tests/配下をシングルファイルモードでデバッグ
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

## 🗂️ 階層指定機能（Directory Hierarchy Targeting）

特定のディレクトリ階層のみを対象としたCI実行により、大規模プロジェクトでの効率的な開発が可能です。

### 階層指定の基本的な使用方法

```bash
# 位置引数での階層指定（推奨）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/

# --hierarchyオプションでの階層指定
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --hierarchy lib/

# --dirオプション（--hierarchyのエイリアス）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci --dir tests/core/
```

### 階層指定時の動作

#### ✅ 実行対象となるステージ

1. **Type Check**: `deno check <階層>/` - 指定階層内のTypeScriptファイルの型チェック
2. **JSR Check**: **自動スキップ** - JSRパッケージチェックは常にプロジェクト全体が対象のため
3. **Test**: `deno test <階層>/` - 指定階層内のテストファイルのみ実行
4. **Lint**: `deno lint <階層>/` - 指定階層内のファイルのリント
5. **Format**: `deno fmt --check <階層>/` - 指定階層内のファイルのフォーマットチェック

#### 🎯 対象ファイル（階層指定時）

- **TypeScript files**: `<階層>/**/*.ts`, `<階層>/**/*.tsx`, `<階層>/**/*.d.ts`
- **Test files**: `<階層>/**/*_test.ts`, `<階層>/**/*.test.ts`
- **All source files**: 階層内のすべてのTypeScriptファイル

### 実用的な階層指定例

```bash
# フロントエンド関連のみをチェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/components/

# バックエンドAPIのみをチェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/api/

# 特定のサービス層のみをチェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/services/user/

# テストディレクトリのみをチェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/integration/

# ユーティリティモジュールのみをチェック
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/utils/
```

### 階層指定と実行モードの組み合わせ

```bash
# src/配下をバッチモードで実行（中規模プロジェクト向け）
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci src/ --mode batch --batch-size 15

# lib/配下をシングルファイルモードでデバッグ
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci lib/ --mode single-file --log-mode debug --log-key LIB --log-length M

# tests/配下のエラーファイルのみ確認
deno run --allow-read --allow-write --allow-run --allow-env jsr:@aidevtool/ci tests/ --log-mode error-files-only
```

### 階層指定のメリット

- **🚀 高速実行**: 必要な部分のみをチェックして開発サイクルを高速化
- **🎯 集中開発**: 作業中のモジュールに集中した検証
- **📊 効率的デバッグ**: 問題のある階層を特定してピンポイントで修正
- **⚡ CI最適化**: 変更された階層のみをチェックしてCI時間を短縮
- **🔍 段階的検証**: 段階的にコードを検証して品質を向上

### 注意事項

- **JSR Check自動スキップ**: 階層指定時はJSRチェックが自動的にスキップされます
- **相対パス対応**: 相対パス・絶対パスの両方をサポート
- **存在チェック**: 存在しない階層を指定した場合は適切なエラーメッセージを表示
- **フォールバック継承**: 階層指定時も実行モードのフォールバック機能は継続して動作

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
