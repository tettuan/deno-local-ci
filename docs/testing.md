# Deno Local CI テスト戦略

## 概要

Deno Local CIは、TypeScriptベースのDenoプロジェクト向けCI実行ツールです。テスト、フォーマット、リントを包括的にサポートし、シンプルで効率的なテスト戦略を採用しています。

## テスト構造

### 配置方針

- **単体テスト**: `src/`配下の実装ファイルと同じディレクトリに配置
- **統合・E2Eテスト**: `tests/`配下の独立したテストディレクトリに配置

### ディレクトリ構造

```
src/                          # 実装ファイル + 単体テスト
├── ci_runner.ts
├── ci_runner.test.ts         # 単体テスト（実装と同じ場所）
├── logger.ts
├── logger.test.ts            # 単体テスト（実装と同じ場所）
├── cli_parser.ts
├── cli_parser.test.ts        # 単体テスト（実装と同じ場所）
└── ...

tests/                        # 統合・E2Eテスト専用
├── 0_architecture/           # アーキテクチャ制約（最初に実行）
├── 1_behavior/               # 動作検証（基本機能の確認）
├── 2_structure/              # 構造整合性（データ構造の検証）
├── 3_core/                   # コア機能テスト（統合検証）
├── 4_e2e/                    # システム全体のE2Eテスト（最後に実行）
└── fixtures/                 # テストデータ
```

### 技術テストカテゴリ

テストは以下の分類に基づいて組織されています：

#### 単体テスト (Unit Tests) - `src/`配下に配置
実装ファイルと同じディレクトリに配置され、各モジュールの基本機能を個別に検証：

- **`0_architecture/`** - アーキテクチャ制約（最初に実行）
- **`1_behavior/`** - 動作検証（基本機能の確認）
- **`2_structure/`** - 構造整合性（データ構造の検証）

#### 統合テスト (Integration Tests) - `tests/`配下に配置
システム内の複数コンポーネントの協働を検証：

- **`3_core/`** - コア機能テスト（CI全体の統合検証）

#### E2E・結合テスト (End-to-End & Integration Tests) - `tests/`配下に配置
システム全体の協働を検証：

- **`4_e2e/`** - システム全体のE2Eテスト

> **実行順序制御**: フォルダ名に番号プレフィックスを付けることで、Denoのテスト実行順序が制御されます。

## テスト実行方法

### 単体テスト（src/配下）

```bash
# 全単体テスト実行
deno test src/

# 特定のモジュールテスト実行
deno test src/ci_runner.test.ts
deno test src/logger.test.ts
```

### 統合・E2Eテスト（tests/配下）

```bash
# 全統合テスト実行（番号順に実行される）
deno test tests/

# 段階別実行（推奨される実行順序）
deno test tests/0_architecture/   # アーキテクチャ制約（最初）
deno test tests/1_behavior/       # 動作検証
deno test tests/2_structure/      # 構造整合性
deno test tests/3_core/           # コア機能統合テスト
deno test tests/4_e2e/           # E2Eテスト（最後）

# 特定のテストカテゴリのみ実行
deno test tests/ --filter="0_architecture"  # アーキテクチャ制約テスト
deno test tests/ --filter="1_behavior"      # 動作検証テスト
deno test tests/ --filter="2_structure"     # 構造整合性テスト
```

### CI/CD実行

```bash
# CI全体実行
deno task ci

# 段階的実行（推奨：単体テスト → 統合テスト の順序）
deno test src/ && deno test tests/

# 個別実行
deno task test      # 全テスト実行
deno task fmt       # フォーマット
deno task lint      # リント
deno task check     # 型チェック
```


