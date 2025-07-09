# Deno Local CI ドメイン設計

## ユビキタス言語

**ExecutionStrategy**: 各CI段階の実行方法（All → Batch → Single-file フォールバック）
**Stage-Internal Fallback**: Batchモード失敗時、エラー発生バッチ範囲のみを1ファイルずつ実行
**CI Stage**: 型チェック → JSR → テスト → リント → フォーマット（エラー時停止）
**Batch Size**: 並列実行ファイル数（1-100、デフォルト25）
**File Type**: *_test.ts、*.test.ts | *.ts、*.tsx、*.d.ts | deno.json、deno.lock、import_map.json
**BreakdownLogger**: `@tettuan/breakdownlogger`（LOG_LENGTH: W/M/L、LOG_KEY）

**エラー分類**: TestFailure（復旧可能）、TypeCheck/JSR/Format/Lint/Config/FileSystem（致命的・即停止）
**型安全**: Result型、Smart Constructor、Discriminated Union

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

## サポートドメイン（Support Domain）

```typescript
// CI パイプライン - Discriminated Union による段階表現
type CIStage = 
  | { kind: "lockfile-init"; action: "regenerate" }
  | { kind: "type-check"; files: string[]; optimized: boolean }
  | { kind: "jsr-check"; dryRun: boolean; allowDirty: boolean }
  | { kind: "test-execution"; strategy: ExecutionStrategy }
  | { kind: "lint-check"; files: string[] }
  | { kind: "format-check"; checkOnly: boolean };

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

## ドメインサービス

```typescript
class ExecutionStrategyService {
  static determineStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError> {
    const defaultMode = { kind: "single-file" as const, stopOnFirstError: true };
    return ExecutionStrategy.create(config.mode ?? defaultMode, config.fallbackEnabled ?? true);
  }

  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean {
    const fatalErrors = ["TypeCheckError", "JSRError", "FormatError", "LintError", "ConfigurationError", "FileSystemError"];
    if (fatalErrors.includes(error.kind)) return false;
    return error.kind === "TestFailure" && strategy.fallbackEnabled && strategy.mode.kind !== "single-file";
  }
}

class StageInternalFallbackService {
  static createFallbackStrategy(
    currentStrategy: ExecutionStrategy, 
    failedBatch?: { startIndex: number; endIndex: number; files: string[] }
  ): Result<ExecutionStrategy, ValidationError> {
    const nextMode = currentStrategy.getNextFallbackMode();
    if (!nextMode) return { ok: false, error: { kind: "EmptyInput" } };

    if (currentStrategy.mode.kind === "batch" && nextMode.kind === "single-file" && failedBatch) {
      const fallbackMode: ExecutionMode = { kind: "single-file", stopOnFirstError: true };
      return ExecutionStrategy.create(fallbackMode, currentStrategy.fallbackEnabled);
    }
    return ExecutionStrategy.create(nextMode, currentStrategy.fallbackEnabled);
  }

  static shouldRetryWithFallback(error: CIError, stage: CIStage): boolean {
    return error.kind === "TestFailure" && stage.kind === "test-execution";
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
    if (stderr.includes("jsr") || stderr.includes("publish")) {
      return { kind: "JSRError", output: result.stderr, suggestion: "Check JSR compatibility" };
    }
    if (stderr.includes("format")) {
      return { kind: "FormatError", files: this.extractFileNames(result.stderr), fixCommand: "deno fmt" };
    }
    if (stderr.includes("lint")) {
      return { kind: "LintError", files: this.extractFileNames(result.stderr), details: [result.stderr] };
    }
    return { kind: "FileSystemError", operation: "unknown", path: "unknown", cause: result.stderr };
  }

  private static extractFileNames(output: string): string[] {
    const filePattern = /[\w\/\-\.]+\.tsx?/g;
    return output.match(filePattern) || [];
  }
}

class CIPipelineOrchestrator {
  static readonly STAGE_ORDER: Array<CIStage["kind"]> = [
    "type-check", "jsr-check", "test-execution", "lint-check", "format-check"
  ];

  static getNextStage(currentStage: CIStage["kind"]): CIStage["kind"] | null {
    const currentIndex = this.STAGE_ORDER.indexOf(currentStage);
    return currentIndex >= 0 && currentIndex < this.STAGE_ORDER.length - 1 
      ? this.STAGE_ORDER[currentIndex + 1] : null;
  }

  static shouldStopPipeline(error: CIError): boolean {
    return true; // すべてのエラーでパイプライン停止
  }
}
```

## 重要な不変条件・アーキテクチャ決定

**実行戦略**: 単一モード、段階的フォールバック（All → Batch → Single-file）、各CI段階適用
**エラー処理**: 各段階失敗時即停止、TestFailureのみフォールバック、致命的エラー即停止
**ログ出力**: Debug時BreakdownLogger環境変数設定、Silent時エラーのみ
**ファイル対象**: テスト・型チェック・設定ファイルの明確分類

**中核ドメイン分離**: ExecutionStrategy・各CI段階独立性、段階内フォールバック
**エラー処理一元化**: Discriminated Union統一処理、復旧可能/致命的エラー分類
**設定階層化**: CLI引数 → 環境変数 → デフォルト値

## 実装原則

**禁止**: `as Type`型変換、オプショナルプロパティ状態表現、例外制御フロー
**推奨**: Discriminated Union、Result型、Smart Constructor、`switch`文網羅的分岐
**品質**: ビジネスルール型定義反映、コンパイル時不正状態検出、`default`不要、予測可能戻り値
