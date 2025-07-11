# Deno Local CI ドメイン設計

## ユビキタス言語

**ExecutionStrategy**: All → Batch → Single-file フォールバック、階層指定対応
**Stage-Internal Fallback**: Batchエラー時、該当範囲のみSingle-file実行
**CI Stage**: Type → JSR → Test → Lint → Format（エラー時停止、階層指定時JSRスキップ）
**File Type**: test(*_test.ts, *.test.ts) | typecheck(*.ts, *.tsx, *.d.ts) | config(deno.json等)
**BreakdownLogger**: LOG_LENGTH(W/M/L), LOG_KEY設定
**エラー分類**: TestFailure（復旧可能）| 他（致命的・即停止）
**ドメインイベント**: CI段階の状態変化・エラー発生を表現するイベント
**イベントバス**: 境界を超えたメッセージ配信基盤
**定理表現**: 型システムによる圧縮された不変条件の表現

## 中核ドメイン（Core Domain）

```typescript
type ExecutionMode =
  | { kind: "all"; projectDirectories: string[]; targetHierarchy?: string }
  | { kind: "batch"; batchSize: number; failedBatchOnly: boolean; targetHierarchy?: string }
  | { kind: "single-file"; stopOnFirstError: boolean; targetHierarchy?: string };

// 圧縮技術による定理表現：型レベル制約
type BatchSizeConstraint = number & { __brand: "ValidBatchSize" }; // 1 <= n <= 100
type HierarchyPath = string & { __brand: "ValidHierarchy" }; // 存在確認済みパス
type ExecutionId = string & { __brand: "ExecutionId" }; // UUID形式

// Smart Constructor with 定理証明
class ExecutionStrategy {
  private constructor(
    readonly mode: ExecutionMode, 
    readonly fallbackEnabled: boolean,
    readonly executionId: ExecutionId
  ) {}
  
  static create(mode: ExecutionMode, fallbackEnabled = true): Result<ExecutionStrategy, ValidationError>;
  getNextFallbackMode(): ExecutionMode | null;
  isHierarchySpecified(): boolean;
  
  // 型レベル不変条件：フォールバック戦略の完全性証明
  proveFallbackCompleteness(): FallbackProof;
}

// 全域性を保証する代数的データ型
type FallbackProof = 
  | { kind: "Complete"; allModesExhausted: true }
  | { kind: "Partial"; remainingModes: ExecutionMode["kind"][] };

type TestResult = { kind: "success" | "failure" | "skipped"; filePath: string; executionId: ExecutionId };
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

## ドメインイベント（Domain Events）

```typescript
// CI実行中に発生するドメインイベント
type CIDomainEvent =
  | { kind: "StageStarted"; stage: CIStage["kind"]; timestamp: number; executionId: string }
  | { kind: "StageCompleted"; stage: CIStage["kind"]; result: StageResult; timestamp: number; executionId: string }
  | { kind: "StageFailed"; stage: CIStage["kind"]; error: CIError; timestamp: number; executionId: string }
  | { kind: "FallbackTriggered"; fromStrategy: ExecutionStrategy; toStrategy: ExecutionStrategy; reason: CIError; executionId: string }
  | { kind: "PipelineStopped"; reason: CIError; completedStages: StageResult[]; timestamp: number; executionId: string }
  | { kind: "HierarchyTargeted"; hierarchy: string; affectedFiles: string[]; timestamp: number; executionId: string };

// イベントハンドラー
type EventHandler<T extends CIDomainEvent> = (event: T) => Promise<void> | void;

// イベントバス（境界を超えたメッセージング）
class CIEventBus {
  private handlers = new Map<CIDomainEvent["kind"], EventHandler<any>[]>();
  
  subscribe<T extends CIDomainEvent>(
    eventKind: T["kind"], 
    handler: EventHandler<T>
  ): void;
  
  publish(event: CIDomainEvent): Promise<void>;
  
  // 境界を超えたメッセージ配信保証
  publishWithBoundaryGuarantee(event: CIDomainEvent): Promise<Result<void, MessageDeliveryError>>;
}

// メッセージ配信エラー
type MessageDeliveryError =
  | { kind: "HandlerTimeout"; eventKind: string; handlerName: string }
  | { kind: "BoundaryViolation"; sourceContext: string; targetContext: string }
  | { kind: "SerializationError"; event: CIDomainEvent };
```

## ドメインサービス

```typescript
class ExecutionStrategyService {
  static determineStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError>;
  static shouldFallback(strategy: ExecutionStrategy, error: CIError): boolean;
  
  // イベント発行を含む戦略決定
  static determineStrategyWithEvents(
    config: CIConfig, 
    eventBus: CIEventBus
  ): Promise<Result<ExecutionStrategy, ValidationError>>;
}

class StageInternalFallbackService {
  static createFallbackStrategy(currentStrategy: ExecutionStrategy, failedBatch?): Result<ExecutionStrategy, ValidationError>;
  static shouldRetryWithFallback(error: CIError, stage: CIStage): boolean;
  
  // イベント駆動フォールバック
  static triggerFallbackWithEvents(
    currentStrategy: ExecutionStrategy,
    error: CIError,
    eventBus: CIEventBus
  ): Promise<Result<ExecutionStrategy, ValidationError>>;
}

class ErrorClassificationService {
  static classifyError(result: ProcessResult, context?: { hierarchy?: string }): CIError;
  
  // エラー分類時のイベント発行
  static classifyErrorWithEvents(
    result: ProcessResult,
    eventBus: CIEventBus,
    executionId: ExecutionId
  ): Promise<CIError>;
}

class CIPipelineOrchestrator {
  static readonly STAGE_ORDER = ["type-check", "jsr-check", "test-execution", "lint-check", "format-check"];
  static getNextStage(currentStage): CIStage["kind"] | null;
  static shouldStopPipeline(error: CIError): boolean;
  static shouldSkipStage(stage: CIStage, strategy: ExecutionStrategy): boolean;
  
  // イベント駆動パイプライン実行
  static executeStageWithEvents(
    stage: CIStage,
    eventBus: CIEventBus,
    executionId: ExecutionId
  ): Promise<StageResult>;
}

class HierarchyTargetingService {
  static filterFilesByHierarchy(files: string[], targetHierarchy?: string): string[];
  static validateHierarchyExists(hierarchy: string): Result<string, CIError>;
  static buildCommandWithHierarchy(baseCommand: string[], hierarchy?: string): string[];
  
  // 階層指定時のイベント発行
  static applyHierarchyWithEvents(
    files: string[],
    hierarchy: string,
    eventBus: CIEventBus,
    executionId: ExecutionId
  ): Promise<Result<string[], CIError>>;
}

// 新規：境界横断サービス
class BoundaryIntegrationService {
  static validateCrossContextMessage<T>(
    message: T,
    sourceContext: string,
    targetContext: string
  ): Result<T, BoundaryViolation>;
  
  static ensureTotalityAtBoundary<TInput, TOutput>(
    input: TInput,
    transformation: (input: TInput) => TOutput,
    completenessProof: BoundaryCompletenessProof
  ): Result<TOutput, BoundaryViolation>;
}
```

## 境界コンテキスト間の型安全インターフェース

```typescript
// ドメイン境界での全域性担保
interface DomainBoundary<TInput, TOutput, TError> {
  // 境界を超える際の型安全変換
  transform(input: TInput): Result<TOutput, TError>;
  // 境界不変条件の検証
  validateBoundaryInvariants(input: TInput): Result<true, BoundaryViolation>;
  // 全域性証明
  proveCompleteness(): BoundaryCompletenessProof;
}

// CI実行境界（外部システムとの接点）
type CIExecutionBoundary = DomainBoundary<
  CIConfig,
  CIExecutionResult,
  ConfigurationError | ExecutionError
>;

// プロセス実行境界（OSプロセスとの接点）
type ProcessExecutionBoundary = DomainBoundary<
  ProcessCommand,
  ProcessResult,
  ProcessError
>;

type BoundaryViolation =
  | { kind: "InvalidInput"; field: string; value: unknown; constraint: string }
  | { kind: "InvariantViolation"; invariant: string; actualState: unknown }
  | { kind: "OutputConstraintViolation"; expected: string; actual: string };

type BoundaryCompletenessProof =
  | { kind: "Total"; coveredCases: string[]; uncoveredCases: never[] }
  | { kind: "Partial"; coveredCases: string[]; uncoveredCases: string[] };
```

## 重要な不変条件・アーキテクチャ決定

**実行戦略**: All → Batch → Single-file段階的フォールバック、階層指定時JSR自動スキップ
**エラー処理**: TestFailureのみフォールバック対象、他は即停止
**中核ドメイン分離**: ExecutionStrategy・CI段階・段階内フォールバック独立性
**型安全**: Discriminated Union、Result型、Smart Constructor適用（詳細は totality.ja.md 参照）
**イベント駆動**: 全ての状態変化をドメインイベントとして表現・配信
**境界全域性**: ドメイン境界において型レベルでの完全性を保証
**定理表現**: 型システムによる圧縮された不変条件とその証明

### ドメインイベント不変条件
- 全てのCI段階状態変化はイベントとして記録される
- イベントは時系列順序を保持し、executionIdで追跡可能
- 境界を超えるメッセージ配信は配信保証機能付き
- エラー発生時は必ずイベントが発行される

### 境界全域性不変条件
- 全てのドメイン境界で型安全な変換が保証される
- 境界横断時の不変条件違反は型レベルで検出される
- 未処理ケースは型システムによって排除される
- 境界での完全性証明が必須

### 圧縮定理表現不変条件
- ビジネスルールは型制約として表現される
- Smart Constructorは不正状態の構築を阻止する
- 代数的データ型により状態空間を完全に分割する
- 実行時エラーの可能性を型レベルで最小化する

## 実装原則

**禁止**: `as Type`型変換、オプショナルプロパティ状態表現、例外制御フロー 
**推奨**: Discriminated Union、Result型、Smart Constructor、`switch`文網羅的分岐 
**品質**: ビジネスルール型定義反映、コンパイル時不正状態検出、`default`不要、予測可能戻り値

### イベント駆動設計原則
**必須**: 全状態変化のイベント化、境界横断メッセージング、配信保証実装
**推奨**: Event Sourcing パターン、CQRS 分離、非同期イベント処理
**品質**: イベント順序保証、重複配信防止、Dead Letter Queue 実装

### 境界全域性原則
**必須**: 境界での型安全変換、不変条件検証、完全性証明
**推奨**: Phantom Types 活用、型レベル制約、境界テスト自動生成
**品質**: 境界違反の静的検出、実行時チェック最小化、明確なエラーメッセージ

### 圧縮定理表現原則
**必須**: ビジネスルールの型制約化、不正状態の型レベル排除、代数的データ型活用
**推奨**: Branded Types、Smart Constructor パターン、型レベル計算
**品質**: 自己文書化型、コンパイル時検証最大化、実行時オーバーヘッド最小化

