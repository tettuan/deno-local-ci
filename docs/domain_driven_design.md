# ドメイン駆動設計：Deno Local CI の中核ドメイン

## ユビキタス言語（Ubiquitous Language）

### 中核概念（Core Concepts）

**実行戦略（ExecutionStrategy）**: テスト実行の方法と順序を決定する戦略パターン（All → Batch → Single-file フォールバック）

**フォールバック（Fallback）**: 上位実行戦略の失敗時に、より詳細な戦略へ段階的に移行する仕組み

**CI段階（CI Stage）**: CI/CDパイプライン内の独立した検証ステップ（型チェック → JSR → テスト → フォーマット/リント）

**バッチサイズ（Batch Size）**: 一度に並列実行するテストファイルの数（1-100、デフォルト25）

**テストファイル種別（Test File Type）**: 処理対象ファイルの分類（*_test.ts | *.ts,*.tsx,*.d.ts | deno.json）

**BreakdownLogger**: JSRパッケージ `@tettuan/breakdownlogger` を使用するアプリケーションの出力制御（環境変数 LOG_LENGTH: W/M/L、LOG_KEY でフィルタリング）

### エラー分類

**復旧可能エラー**: TestFailure（フォールバック可能）
**致命的エラー**: TypeCheckError, JSRError, FormatError, LintError, ConfigurationError, FileSystemError（即停止）

### 型安全概念

**Result型**: 成功値またはエラー値を型安全に表現 `{ ok: boolean; data?: T; error?: E }`
**Smart Constructor**: 制約付きコンストラクタパターン `private constructor + static create`
**Discriminated Union**: 型タグによる状態区別 `{ kind: string; ... }`

## 中核ドメイン（Core Domain）

```typescript
// 実行戦略ドメイン - Discriminated Union による状態表現
type ExecutionMode = 
  | { kind: "all"; projectDirectories: string[] }
  | { kind: "batch"; batchSize: number; failedBatchOnly: boolean }
  | { kind: "single-file"; stopOnFirstError: boolean };

class ExecutionStrategy {
  private constructor(readonly mode: ExecutionMode, readonly fallbackEnabled: boolean) {}
  
  static create(mode: ExecutionMode, fallbackEnabled = true): Result<ExecutionStrategy, ValidationError> {
    if (mode.kind === "batch" && (mode.batchSize < 1 || mode.batchSize > 100)) {
      return { ok: false, error: { kind: "OutOfRange", value: mode.batchSize } };
    }
    return { ok: true, data: new ExecutionStrategy(mode, fallbackEnabled) };
  }

  getNextFallbackMode(): ExecutionMode | null {
    switch (this.mode.kind) {
      case "all": return { kind: "batch", batchSize: 25, failedBatchOnly: false };
      case "batch": return { kind: "single-file", stopOnFirstError: true };
      case "single-file": return null;
    }
  }
}

// テスト実行ドメイン - Result型によるエラー値化
type TestResult = 
  | { kind: "success"; filePath: string; duration: number }
  | { kind: "failure"; filePath: string; error: string }
  | { kind: "skipped"; filePath: string; reason: string };

type TestFileType = 
  | { kind: "test"; pattern: "*_test.ts" | "*.test.ts" }
  | { kind: "typecheck"; pattern: "*.ts" | "*.tsx" | "*.d.ts" }
  | { kind: "config"; pattern: "deno.json" | "deno.lock" | "import_map.json" };
```

**ドメインルール**: All → Batch → Single-file の段階的フォールバック、型チェック → JSR → テスト → フォーマット/リント の順次実行

## サポートドメイン（Support Domain）

```typescript
// CI パイプライン - Discriminated Union による段階表現
type CIStage = 
  | { kind: "lockfile-init"; action: "regenerate" }
  | { kind: "type-check"; files: string[]; optimized: boolean }
  | { kind: "jsr-check"; dryRun: boolean; allowDirty: boolean }
  | { kind: "test-execution"; strategy: ExecutionStrategy }
  | { kind: "format-check"; checkOnly: boolean }
  | { kind: "lint-check"; files: string[] };

type StageResult = 
  | { kind: "success"; stage: CIStage; duration: number }
  | { kind: "failure"; stage: CIStage; error: string; shouldStop: true }
  | { kind: "skipped"; stage: CIStage; reason: string };

// エラーハンドリング - 統一されたエラー型
type CIError = 
  | { kind: "TypeCheckError"; files: string[]; details: string[] }
  | { kind: "TestFailure"; files: string[]; errors: string[] }
  | { kind: "JSRError"; output: string; suggestion: string }
  | { kind: "FormatError"; files: string[]; fixCommand: string }
  | { kind: "LintError"; files: string[]; details: string[] }
  | { kind: "ConfigurationError"; field: string; value: unknown }
  | { kind: "FileSystemError"; operation: string; path: string; cause: string };
```

## 汎用サブドメイン（Generic Subdomain）

```typescript
// ログ出力ドメイン - BreakdownLogger環境変数制御
type LogMode = 
  | { kind: "normal"; showSections: true }
  | { kind: "silent"; errorsOnly: true }
  | { kind: "debug"; verboseLevel: "high"; breakdownLoggerEnv: BreakdownLoggerEnvConfig }
  | { kind: "error-files-only"; implicitSilent: true };

class BreakdownLoggerEnvConfig {
  private constructor(readonly logLength: "W" | "M" | "L", readonly logKey: string) {}
  
  static create(logLength: string, logKey: string): Result<BreakdownLoggerEnvConfig, ValidationError> {
    if (!["W", "M", "L"].includes(logLength)) {
      return { ok: false, error: { kind: "PatternMismatch", value: logLength } };
    }
    if (logKey.length === 0) {
      return { ok: false, error: { kind: "EmptyInput" } };
    }
    return { ok: true, data: new BreakdownLoggerEnvConfig(logLength as "W" | "M" | "L", logKey) };
  }

  setEnvironmentVariables(): void {
    Deno.env.set("LOG_LENGTH", this.logLength);
    Deno.env.set("LOG_KEY", this.logKey);
  }
}
```

## 全域性原則（Totality Principle）

**詳細な設計指針と実装パターンについては [`totality.ja.md`](./totality.ja.md) を参照**

本プロジェクトでは以下の全域性パターンを適用：
- **Result型**: `{ ok: boolean; data?: T; error?: E }`
- **Discriminated Union**: `{ kind: string; ... }`  
- **Smart Constructor**: `private constructor + static create`

## ドメインサービス

```typescript
class ExecutionStrategyService {
  static determineStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError> {
    const defaultMode = { kind: "single-file" as const, stopOnFirstError: true };
    return ExecutionStrategy.create(config.mode ?? defaultMode, config.fallbackEnabled ?? true);
  }

  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean {
    return error.kind === "TestFailure" && strategy.fallbackEnabled && strategy.mode.kind !== "single-file";
  }
}

class ErrorClassificationService {
  static classifyError(result: ProcessResult): CIError {
    const stderr = result.stderr.toLowerCase();
    if (stderr.includes("type") && stderr.includes("error")) {
      return { kind: "TypeCheckError", files: this.extractFileNames(result.stderr), details: [result.stderr] };
    }
    if (stderr.includes("test") && stderr.includes("failed")) {
      return { kind: "TestFailure", files: this.extractFileNames(result.stderr), errors: [result.stderr] };
    }
    // ... 他のエラー分類
    return { kind: "FileSystemError", operation: "unknown", path: "unknown", cause: result.stderr };
  }
}
```

## 重要な不変条件（Invariants）

1. **実行戦略**: 単一モードのみ有効（Discriminated Union保証）、段階的フォールバック（All → Batch → Single-file）
2. **エラー処理**: 各CI段階での失敗時即停止、エラー分類の完全性、部分関数の禁止
3. **ログ出力**: Debug時のBreakdownLogger環境変数設定、Silent時のエラーのみ表示
4. **ファイル対象**: *_test.ts | *.ts,*.tsx,*.d.ts | deno.json の明確な分類

## アーキテクチャ決定

1. **中核ドメイン分離**: ExecutionStrategy・TestExecutionの独立性、`kind`タグによる状態明確化
2. **エラー処理一元化**: Discriminated Unionによる統一処理、例外からResult型への変換
3. **設定階層化**: CLI引数 → 環境変数 → デフォルト値の優先順位

## 実装チェックリスト

### 🚫 禁止パターン
- `as Type`型変換 → Smart Constructor使用
- オプショナルプロパティ状態表現 → Discriminated Union使用
- 例外制御フロー → Result型使用

### ✅ 推奨パターン
- Discriminated Union: `{ kind: string; ... }` ✅
- Result型: `{ ok: boolean; data?: T; error?: E }` ✅
- Smart Constructor: `private constructor + static create` ✅
- `switch`文による網羅的分岐 ✅

### 品質指標
- [✅] ビジネスルールの型定義反映
- [✅] コンパイル時不正状態検出
- [✅] `switch`文`default`不要（全パターン網羅）
- [✅] 関数戻り値の予測可能性
