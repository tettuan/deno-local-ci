# Deno Local CI ドメイン設計

## ユビキタス言語

**ExecutionStrategy**: All → Batch → Single-file フォールバック、階層指定対応
**Stage-Internal Fallback**: Batchエラー時、該当範囲のみSingle-file実行
**CI Stage**: Type → JSR → Test → Lint → Format（エラー時停止、階層指定時JSRスキップ）
**File Type**: test(*_test.ts, *.test.ts) | typecheck(*.ts, *.tsx, *.d.ts) | config(deno.json等)
**BreakdownLogger**: LOG_LENGTH(W/M/L), LOG_KEY設定
**エラー分類**: TestFailure（復旧可能）| 他（致命的・即停止）

## 中核ドメイン（Core Domain）

```typescript
type ExecutionMode =
  | { kind: "all"; projectDirectories: string[]; targetHierarchy?: string }
  | { kind: "batch"; batchSize: number; failedBatchOnly: boolean; targetHierarchy?: string }
  | { kind: "single-file"; stopOnFirstError: boolean; targetHierarchy?: string };

class ExecutionStrategy {
  private constructor(readonly mode: ExecutionMode, readonly fallbackEnabled: boolean) {}
  static create(mode: ExecutionMode, fallbackEnabled = true): Result<ExecutionStrategy, ValidationError>;
  getNextFallbackMode(): ExecutionMode | null;
  isHierarchySpecified(): boolean;
}

type TestResult = { kind: "success" | "failure" | "skipped"; filePath: string; /* ... */ };
type TestFileType = { kind: "test" | "typecheck" | "config"; pattern: string };
```

## サポートドメイン（Support Domain）

```typescript
type CIStage = 
  | { kind: "type-check" | "lint-check" | "format-check"; files: string[]; targetHierarchy?: string }
  | { kind: "jsr-check"; dryRun: boolean; allowDirty: boolean; skipWhenHierarchySpecified: boolean }
  | { kind: "test-execution"; strategy: ExecutionStrategy }
  | { kind: "lockfile-init"; action: "regenerate" };

type StageResult = { kind: "success" | "failure" | "skipped"; stage: CIStage; /* ... */ };

type CIError = 
  | { kind: "TestFailure"; files: string[]; errors: string[] }
  | { kind: "TypeCheckError" | "JSRError" | "FormatError" | "LintError" | "ConfigurationError" | "FileSystemError" | "HierarchyNotFoundError"; /* ... */ };
```

## ドメインサービス

```typescript
class ExecutionStrategyService {
  static determineStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError>;
  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean;
}

class StageInternalFallbackService {
  static createFallbackStrategy(currentStrategy: ExecutionStrategy, failedBatch?): Result<ExecutionStrategy, ValidationError>;
  static shouldRetryWithFallback(error: CIError, stage: CIStage): boolean;
}

class ErrorClassificationService {
  static classifyError(result: ProcessResult, context?: { hierarchy?: string }): CIError;
}

class CIPipelineOrchestrator {
  static readonly STAGE_ORDER = ["type-check", "jsr-check", "test-execution", "lint-check", "format-check"];
  static getNextStage(currentStage): CIStage["kind"] | null;
  static shouldStopPipeline(error: CIError): boolean;
  static shouldSkipStage(stage: CIStage, strategy: ExecutionStrategy): boolean;
}

class HierarchyTargetingService {
  static filterFilesByHierarchy(files: string[], targetHierarchy?: string): string[];
  static validateHierarchyExists(hierarchy: string): Result<string, CIError>;
  static buildCommandWithHierarchy(baseCommand: string[], hierarchy?: string): string[];
}
```

## 重要な不変条件・アーキテクチャ決定

**実行戦略**: All → Batch → Single-file段階的フォールバック、階層指定時JSR自動スキップ
**エラー処理**: TestFailureのみフォールバック対象、他は即停止
**中核ドメイン分離**: ExecutionStrategy・CI段階・段階内フォールバック独立性
**型安全**: Discriminated Union、Result型、Smart Constructor適用（詳細は totality.ja.md 参照）

## 実装原則

**禁止**: `as Type`型変換、オプショナルプロパティ状態表現、例外制御フロー 
**推奨**: Discriminated Union、Result型、Smart Constructor、`switch`文網羅的分岐 
**品質**: ビジネスルール型定義反映、コンパイル時不正状態検出、`default`不要、予測可能戻り値
