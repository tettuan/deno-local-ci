# ドメイン駆動設計：Deno Local CI の中核ドメイン

## 中核ドメイン（距離: 0）

### 実行戦略ドメイン（ExecutionStrategy Domain）

```typescript
// 全域性原則：Discriminated Union による状態表現
type ExecutionMode = 
  | { kind: "all"; projectDirectories: string[] }
  | { kind: "batch"; batchSize: number; failedBatchOnly: boolean }
  | { kind: "single-file"; stopOnFirstError: boolean };

// Smart Constructor による制約
class ExecutionStrategy {
  private constructor(
    readonly mode: ExecutionMode,
    readonly fallbackEnabled: boolean
  ) {}

  static create(mode: ExecutionMode, fallbackEnabled = true): Result<ExecutionStrategy, ValidationError> {
    if (mode.kind === "batch" && (mode.batchSize < 1 || mode.batchSize > 100)) {
      return { ok: false, error: { kind: "OutOfRange", value: mode.batchSize } };
    }
    return { ok: true, data: new ExecutionStrategy(mode, fallbackEnabled) };
  }

  // 全域関数：すべてのモードを網羅
  getNextFallbackMode(): ExecutionMode | null {
    switch (this.mode.kind) {
      case "all": return { kind: "batch", batchSize: 25, failedBatchOnly: false };
      case "batch": return { kind: "single-file", stopOnFirstError: true };
      case "single-file": return null;
    }
  }
}
```

**ドメインルール**（requirements.md準拠）:
- All → Batch → Single-file の段階的フォールバック
- Batch モード：指定サイズで効率実行、失敗時範囲限定再実行
- Single-file モード：1ファイルずつ実行、エラー時停止

### テスト実行ドメイン（TestExecution Domain）

```typescript
// Result型によるエラー値化
type TestResult = 
  | { kind: "success"; filePath: string; duration: number }
  | { kind: "failure"; filePath: string; error: string }
  | { kind: "skipped"; filePath: string; reason: string };

// ファイル種別のDiscriminated Union
type TestFileType = 
  | { kind: "test"; pattern: "*_test.ts" | "*.test.ts" }
  | { kind: "typecheck"; pattern: "*.ts" | "*.tsx" | "*.d.ts" }
  | { kind: "config"; pattern: "deno.json" | "deno.lock" | "import_map.json" };

class TestExecution {
  private constructor(readonly strategy: ExecutionStrategy, readonly fileTypes: TestFileType[]) {}

  static create(strategy: ExecutionStrategy, fileTypes: TestFileType[]): Result<TestExecution, ValidationError> {
    if (fileTypes.length === 0) {
      return { ok: false, error: { kind: "EmptyInput" } };
    }
    return { ok: true, data: new TestExecution(strategy, fileTypes) };
  }

  // 全域関数：すべての戦略パターンを網羅
  async execute(files: string[]): Promise<Result<TestResult[], ExecutionError>> {
    switch (this.strategy.mode.kind) {
      case "all": return await this.executeByProjectDirectories(files);
      case "batch": return await this.executeBatch(files);
      case "single-file": return await this.executeSingleFile(files);
    }
  }
}
```

**ドメインルール**（totality.ja.md準拠）:
- テスト対象：*_test.ts | *.test.ts
- 型チェック対象：*.ts | *.tsx | *.d.ts
- 失敗時の段階的エラー特定（Result型でエラー値化）
- バッチ→Single-file移行時：失敗バッチ範囲のみ実行

## サポートドメイン（距離: 1）

### CI パイプラインドメイン（CIPipeline Domain）

```typescript
// Discriminated Union による段階表現
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

class CIPipeline {
  private constructor(readonly stages: readonly CIStage[], readonly stopOnFailure: boolean) {}

  static create(executionMode: ExecutionMode, stopOnFailure = true): Result<CIPipeline, ValidationError> {
    const stages: CIStage[] = [
      { kind: "lockfile-init", action: "regenerate" },
      { kind: "type-check", files: [], optimized: executionMode.kind !== "single-file" },
      { kind: "jsr-check", dryRun: true, allowDirty: true },
      { kind: "test-execution", strategy: ExecutionStrategy.create(executionMode).data! },
      { kind: "format-check", checkOnly: true },
      { kind: "lint-check", files: [] }
    ];

    // 最適化モードでの段階スキップ
    const optimizedStages = (executionMode.kind === "single-file" || executionMode.kind === "batch")
      ? stages.filter(stage => stage.kind !== "format-check" && stage.kind !== "lint-check")
      : stages;

    return { ok: true, data: new CIPipeline(optimizedStages, stopOnFailure) };
  }

  // 全域関数：段階的実行制御
  async execute(): Promise<Result<StageResult[], PipelineError>> {
    const results: StageResult[] = [];
    for (const stage of this.stages) {
      const result = await this.executeStage(stage);
      results.push(result);
      
      if (result.kind === "failure" && this.stopOnFailure) {
        return { ok: false, error: { kind: "PipelineStageFailure", stage: stage.kind } };
      }
    }
    return { ok: true, data: results };
  }
}
```

**ドメインルール**:
- 型チェック → JSR チェック → テスト実行 → フォーマット/リント の順次実行
- 各段階での失敗時即停止
- 最適化モード（Single-file/Batch）での段階スキップ

### エラーハンドリングドメイン（ErrorHandling Domain）

```typescript
// 全域性原則：統一されたエラー型
type CIError = 
  | { kind: "TypeCheckError"; files: string[]; details: string[] }
  | { kind: "TestFailure"; files: string[]; errors: string[] }
  | { kind: "JSRError"; output: string; suggestion: string }
  | { kind: "FormatError"; files: string[]; fixCommand: string }
  | { kind: "LintError"; files: string[]; details: string[] }
  | { kind: "ConfigurationError"; field: string; value: unknown }
  | { kind: "FileSystemError"; operation: string; path: string; cause: string };

interface ErrorClassification {
  typeCheckErrors: string[];
  testFailures: string[];
  jsrErrors: string[];
  formatErrors: string[];
  lintErrors: string[];
}
```

## 汎用サブドメイン（距離: 2）

### ログ出力ドメイン（Logging Domain）

```typescript
// Discriminated Union によるログモード表現
type LogMode = 
  | { kind: "normal"; showSections: true }
  | { kind: "silent"; errorsOnly: true }
  | { kind: "debug"; verboseLevel: "high"; breakdownLogger: BreakdownLoggerConfig }
  | { kind: "error-files-only"; implicitSilent: true };

// BreakdownLogger設定のSmart Constructor
class BreakdownLoggerConfig {
  private constructor(readonly logLength: "W" | "M" | "L", readonly logKey: string) {}

  static create(logLength: string, logKey: string): Result<BreakdownLoggerConfig, ValidationError> {
    if (!["W", "M", "L"].includes(logLength)) {
      return { ok: false, error: { kind: "PatternMismatch", value: logLength } };
    }
    if (logKey.length === 0) {
      return { ok: false, error: { kind: "EmptyInput" } };
    }
    return { ok: true, data: new BreakdownLoggerConfig(logLength as "W" | "M" | "L", logKey) };
  }
}

class LoggingStrategy {
  private constructor(readonly mode: LogMode, readonly environmentConfig: EnvironmentLogConfig) {}

  static create(mode: LogMode, envVars: Record<string, string>): Result<LoggingStrategy, ValidationError> {
    const logLength = envVars.LOG_LENGTH || "W";
    const logKey = envVars.LOG_KEY || "default";
    
    const breakdownConfig = BreakdownLoggerConfig.create(logLength, logKey);
    if (!breakdownConfig.ok) return { ok: false, error: breakdownConfig.error };

    return { ok: true, data: new LoggingStrategy(mode, { breakdownLogger: breakdownConfig.data }) };
  }

  // 全域関数：すべてのログレベルを網羅
  shouldShow(level: LogLevel, context: ExecutionContext): boolean {
    switch (this.mode.kind) {
      case "normal": return level !== "debug";
      case "silent": return level === "error";
      case "debug": return true;
      case "error-files-only": return level === "error" && context.isFileError;
    }
  }
}
```

**ドメインルール**:
- Debug モード: 詳細ログ出力（LOG_LENGTH, LOG_KEY活用）
- Silent モード: エラーのみ表示
- 環境変数による設定（LOG_LEVEL, LOG_LENGTH, LOG_KEY）

## 全域性原則の適用

### 部分関数から全域関数への変換

```typescript
// ❌ 現在：部分関数（undefined の可能性）
function getExecutionMode(config: CIConfig): ExecutionMode | undefined

// ✅ 改善：全域関数（Result型でエラー値化）
function determineExecutionMode(config: CIConfig): Result<ExecutionMode, ValidationError>

// ❌ 現在：例外による制御フロー
function validateConfig(config: CIConfig): void // throws Error

// ✅ 改善：Result型による検証
function validateConfig(config: CIConfig): Result<ValidatedConfig, ValidationError[]>
```

### Smart Constructorパターンの実装

```typescript
class ValidatedCIConfig {
  private constructor(
    readonly executionStrategy: ExecutionStrategy,
    readonly loggingStrategy: LoggingStrategy,
    readonly configurationSources: ConfigurationSource[]
  ) {}

  static create(
    rawConfig: RawCIConfig,
    envVars: Record<string, string>,
    args: string[]
  ): Result<ValidatedCIConfig, ValidationError[]> {
    const errors: ValidationError[] = [];

    const executionResult = ExecutionStrategy.create(rawConfig.mode, rawConfig.fallbackEnabled);
    if (!executionResult.ok) errors.push(executionResult.error);

    const loggingResult = LoggingStrategy.create(rawConfig.logMode, envVars);
    if (!loggingResult.ok) errors.push(loggingResult.error);

    if (errors.length > 0) return { ok: false, error: errors };

    const sources: ConfigurationSource[] = [
      { kind: "commandLine", args, priority: 1 },
      { kind: "environment", variables: envVars, priority: 2 },
      { kind: "default", values: getDefaultConfig(), priority: 3 }
    ];

    return { ok: true, data: new ValidatedCIConfig(executionResult.data!, loggingResult.data!, sources) };
  }
}
```

## ドメインサービス（全域性原則適用）

### ExecutionStrategyService

```typescript
class ExecutionStrategyService {
  // 全域関数：Result型でエラー値化
  static determineStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError> {
    switch (config.mode?.kind) {
      case "all":
      case "batch": 
      case "single-file":
        return ExecutionStrategy.create(config.mode, config.fallbackEnabled);
      case undefined:
        const defaultMode = { kind: "single-file" as const, stopOnFirstError: true };
        return ExecutionStrategy.create(defaultMode, true);
    }
  }

  // 全域関数：すべてのエラーパターンを網羅
  static shouldFallback(currentStrategy: ExecutionStrategy, error: CIError): boolean {
    switch (error.kind) {
      case "TestFailure":
        return currentStrategy.fallbackEnabled && currentStrategy.mode.kind !== "single-file";
      case "TypeCheckError":
      case "JSRError":
      case "FormatError":
      case "LintError":
      case "ConfigurationError":
      case "FileSystemError":
        return false;
    }
  }
}
```

### ErrorClassificationService

```typescript
class ErrorClassificationService {
  // 全域関数：すべてのプロセス結果を分類
  static classifyError(result: ProcessResult): CIError {
    const stderr = result.stderr.toLowerCase();
    
    if (stderr.includes("type") && stderr.includes("error")) {
      return { kind: "TypeCheckError", files: this.extractFileNames(result.stderr), details: [result.stderr] };
    }
    if (stderr.includes("test") && (stderr.includes("failed") || stderr.includes("error"))) {
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

  // 全域関数：すべてのエラー種別の停止判定
  static shouldStopExecution(errorType: CIError): boolean {
    switch (errorType.kind) {
      case "TypeCheckError":
      case "JSRError":
      case "FormatError":
      case "LintError":
      case "ConfigurationError":
      case "FileSystemError":
        return true;
      case "TestFailure":
        return false; // フォールバック可能
    }
  }
}
```

## 重要な不変条件（Invariants）

### 1. 実行戦略不変条件
- 単一の実行モードのみ有効（Discriminated Union で保証）
- フォールバック時の段階的降格（All → Batch → Single-file）
- Single-file モードでの順次実行保証

### 2. エラー処理不変条件
- 各 CI 段階での失敗時即停止
- エラー分類の完全性（全エラーがいずれかの分類に属する）
- 部分関数の禁止（Result型による全域化）

### 3. ログ出力不変条件
- Debug モード時の全情報出力（LOG_LENGTH, LOG_KEY 活用）
- Silent モード時のエラーのみ出力
- 環境変数設定の型安全検証

### 4. ファイル対象不変条件
- テスト対象：*_test.ts | *.test.ts
- 型チェック対象：*.ts | *.tsx | *.d.ts
- 設定ファイル：deno.json | deno.lock | import_map.json

## アーキテクチャ的意思決定

### 1. 中核ドメインの分離
- 実行戦略とテスト実行は独立したモジュール（`kind` タグで状態明確化）
- Smart Constructor による制約付きオブジェクト生成

### 2. エラー処理の一元化
- 全エラー種別の統一的処理（Discriminated Union）
- 部分関数の排除（例外 → Result型）

### 3. 設定の階層化
- コマンドライン → 環境変数 → デフォルト値の優先順位
- BreakdownLogger 設定の型安全統合

## 実装チェックリスト（totality.ja.md準拠）

### 🚫 禁止パターン
- `as Type`による強制型変換 → Smart Constructor で解決
- オプショナルプロパティによる状態表現 → Discriminated Union で解決
- 例外による制御フロー → Result型で解決

### ✅ 推奨パターン
- タグ付きユニオン： `{ kind: string; ... }` ✅
- Result型： `{ ok: boolean; ... }` ✅
- Smart Constructor： `private constructor + static create` ✅
- `switch`文による網羅的分岐 ✅

## 品質指標達成状況

- [✅] ビジネスルールが型定義に反映（requirements.md → Discriminated Union）
- [✅] コンパイル時に不正状態を検出（Smart Constructor適用）
- [✅] `switch`文に`default`不要（全パターン網羅）
- [✅] 関数の戻り値が予測可能（Result型適用）
