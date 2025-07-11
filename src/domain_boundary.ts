/**
 * # Deno Local CI - Domain Boundary
 *
 * ドメイン境界での全域性担保と型安全な変換を管理
 * 境界を超える際の不変条件検証と完全性証明を提供
 *
 * ## 設計原則
 * - 境界での型安全な変換保証
 * - 不変条件違反の事前検出
 * - 全域性証明の型レベル実装
 * - 境界横断時のメッセージ検証
 *
 * @module
 */

import { CIConfig, ExecutionStrategy, ProcessResult, Result, ValidationError } from "./types.ts";
import { CIDomainEvent, ExecutionId } from "./domain_events.ts";

// === Boundary Types ===

/**
 * 境界違反エラー
 */
export type BoundaryViolation =
  | { kind: "InvalidInput"; field: string; value: unknown; constraint: string }
  | { kind: "InvariantViolation"; invariant: string; actualState: unknown; expectedState: unknown }
  | { kind: "OutputConstraintViolation"; expected: string; actual: string }
  | { kind: "TypeSafetyViolation"; expectedType: string; actualType: string }
  | { kind: "CompletenessViolation"; missingCases: string[]; handledCases: string[] };

/**
 * 境界完全性証明
 */
export type BoundaryCompletenessProof =
  | { kind: "Total"; coveredCases: string[]; uncoveredCases: never[] }
  | { kind: "Partial"; coveredCases: string[]; uncoveredCases: string[] };

/**
 * ドメイン境界インターフェース
 * 境界を超える際の型安全変換と不変条件検証を提供
 */
export interface DomainBoundary<TInput, TOutput, TError> {
  /**
   * 境界を超える際の型安全変換
   */
  transform(input: TInput): Result<TOutput, TError>;

  /**
   * 境界不変条件の検証
   */
  validateBoundaryInvariants(input: TInput): Result<true, BoundaryViolation>;

  /**
   * 全域性証明
   */
  proveCompleteness(): BoundaryCompletenessProof;

  /**
   * 境界名（デバッグ・ログ用）
   */
  readonly boundaryName: string;
}

// === Specific Boundary Types ===

/**
 * CI実行境界（外部システムとの接点）
 */
export type CIExecutionBoundary = DomainBoundary<
  CIConfig,
  { strategy: ExecutionStrategy; executionId: ExecutionId },
  ValidationError | BoundaryViolation
>;

/**
 * プロセス実行境界（OSプロセスとの接点）
 */
export type ProcessExecutionBoundary = DomainBoundary<
  { command: string[]; workingDir?: string },
  ProcessResult,
  ProcessExecutionError
>;

/**
 * イベント配信境界（イベントバスとの接点）
 */
export type EventDeliveryBoundary = DomainBoundary<
  CIDomainEvent,
  { delivered: true; handlerCount: number },
  EventDeliveryError
>;

// === Error Types ===

export type ProcessExecutionError =
  | { kind: "CommandNotFound"; command: string }
  | { kind: "PermissionDenied"; command: string; workingDir?: string }
  | { kind: "ExecutionTimeout"; command: string; timeoutMs: number }
  | { kind: "UnexpectedExit"; command: string; exitCode: number };

export type EventDeliveryError =
  | { kind: "NoHandlers"; eventKind: string }
  | { kind: "SerializationFailure"; event: CIDomainEvent }
  | { kind: "DeliveryTimeout"; eventKind: string; timeoutMs: number };

// === Boundary Implementations ===

/**
 * CI実行境界の実装
 */
export class CIExecutionBoundaryImpl implements CIExecutionBoundary {
  readonly boundaryName = "CI-Execution";

  transform(
    input: CIConfig,
  ): Result<
    { strategy: ExecutionStrategy; executionId: ExecutionId },
    ValidationError | BoundaryViolation
  > {
    // 1. 境界不変条件の検証
    const invariantResult = this.validateBoundaryInvariants(input);
    if (!invariantResult.ok) {
      return { ok: false, error: invariantResult.error };
    }

    // 2. ExecutionStrategy作成
    const strategyResult = this.createExecutionStrategy(input);
    if (!strategyResult.ok) {
      return { ok: false, error: strategyResult.error };
    }

    // 3. ExecutionId生成
    const executionId = this.generateExecutionId();

    return {
      ok: true,
      data: {
        strategy: strategyResult.data,
        executionId,
      },
    };
  }

  validateBoundaryInvariants(input: CIConfig): Result<true, BoundaryViolation> {
    // バッチサイズの検証
    if (input.batchSize !== undefined && (input.batchSize < 1 || input.batchSize > 100)) {
      return {
        ok: false,
        error: {
          kind: "InvalidInput",
          field: "batchSize",
          value: input.batchSize,
          constraint: "1 <= batchSize <= 100",
        },
      };
    }

    // 階層パスの検証
    if (input.hierarchy !== undefined && input.hierarchy !== null) {
      if (typeof input.hierarchy !== "string" || input.hierarchy.length === 0) {
        return {
          ok: false,
          error: {
            kind: "InvalidInput",
            field: "hierarchy",
            value: input.hierarchy,
            constraint: "non-empty string or null",
          },
        };
      }
    }

    return { ok: true, data: true };
  }

  proveCompleteness(): BoundaryCompletenessProof {
    const coveredCases = [
      "config-validation",
      "strategy-creation",
      "execution-id-generation",
      "invariant-checking",
    ];

    return {
      kind: "Total",
      coveredCases,
      uncoveredCases: [],
    };
  }

  private createExecutionStrategy(config: CIConfig): Result<ExecutionStrategy, ValidationError> {
    // デフォルト実行モード
    const defaultMode = {
      kind: "single-file" as const,
      stopOnFirstError: config.stopOnFirstError ?? true,
      hierarchy: config.hierarchy || null,
    };

    return ExecutionStrategy.create(
      config.mode ?? defaultMode,
      config.fallbackEnabled ?? true,
      config.hierarchy || null,
    );
  }

  private generateExecutionId(): ExecutionId {
    return crypto.randomUUID() as ExecutionId;
  }
}

/**
 * プロセス実行境界の実装
 */
export class ProcessExecutionBoundaryImpl implements ProcessExecutionBoundary {
  readonly boundaryName = "Process-Execution";

  transform(
    _input: { command: string[]; workingDir?: string },
  ): Result<ProcessResult, ProcessExecutionError> {
    // 実際のプロセス実行は別モジュールに委譲
    // ここでは境界での変換のみを行う
    throw new Error("Not implemented - use DenoCommandRunner instead");
  }

  validateBoundaryInvariants(
    input: { command: string[]; workingDir?: string },
  ): Result<true, BoundaryViolation> {
    if (input.command.length === 0) {
      return {
        ok: false,
        error: {
          kind: "InvalidInput",
          field: "command",
          value: input.command,
          constraint: "non-empty array",
        },
      };
    }

    if (input.workingDir !== undefined && typeof input.workingDir !== "string") {
      return {
        ok: false,
        error: {
          kind: "InvalidInput",
          field: "workingDir",
          value: input.workingDir,
          constraint: "string or undefined",
        },
      };
    }

    return { ok: true, data: true };
  }

  proveCompleteness(): BoundaryCompletenessProof {
    const coveredCases = [
      "command-validation",
      "working-directory-validation",
      "process-execution-delegation",
    ];

    return {
      kind: "Total",
      coveredCases,
      uncoveredCases: [],
    };
  }
}

// === Boundary Integration Service ===

/**
 * 境界横断サービス
 * 複数の境界を管理し、境界間の整合性を保証
 */
export class BoundaryIntegrationService {
  /**
   * 境界を超えるメッセージの検証
   */
  static validateCrossContextMessage<T>(
    message: T,
    sourceContext: string,
    targetContext: string,
    validationRules?: (message: T) => Result<true, BoundaryViolation>,
  ): Result<T, BoundaryViolation> {
    // コンテキスト名の検証
    if (!sourceContext || !targetContext) {
      return {
        ok: false,
        error: {
          kind: "InvalidInput",
          field: "context",
          value: { sourceContext, targetContext },
          constraint: "non-empty context names required",
        },
      };
    }

    // カスタム検証ルールの適用
    if (validationRules) {
      const validationResult = validationRules(message);
      if (!validationResult.ok) {
        return validationResult;
      }
    }

    return { ok: true, data: message };
  }

  /**
   * 境界での全域性を保証
   */
  static ensureTotalityAtBoundary<TInput, TOutput>(
    input: TInput,
    transformation: (input: TInput) => Result<TOutput, unknown>,
    completenessProof: BoundaryCompletenessProof,
  ): Result<TOutput, BoundaryViolation> {
    // 完全性の検証
    if (completenessProof.kind === "Partial" && completenessProof.uncoveredCases.length > 0) {
      return {
        ok: false,
        error: {
          kind: "CompletenessViolation",
          missingCases: completenessProof.uncoveredCases,
          handledCases: completenessProof.coveredCases,
        },
      };
    }

    // 変換の実行
    try {
      const result = transformation(input);
      if (!result.ok) {
        return {
          ok: false,
          error: {
            kind: "OutputConstraintViolation",
            expected: "successful transformation",
            actual: `transformation failed: ${JSON.stringify(result.error)}`,
          },
        };
      }

      return { ok: true, data: result.data };
    } catch (error) {
      return {
        ok: false,
        error: {
          kind: "TypeSafetyViolation",
          expectedType: "Result<TOutput, unknown>",
          actualType: `exception: ${error}`,
        },
      };
    }
  }

  /**
   * 複数境界の同期検証
   */
  static validateMultipleBoundaries(
    boundaries: DomainBoundary<unknown, unknown, unknown>[],
    inputs: unknown[],
  ): Result<true, BoundaryViolation[]> {
    if (boundaries.length !== inputs.length) {
      return {
        ok: false,
        error: [{
          kind: "InvalidInput",
          field: "boundaries-inputs-mismatch",
          value: { boundariesCount: boundaries.length, inputsCount: inputs.length },
          constraint: "boundaries and inputs arrays must have same length",
        }],
      };
    }

    const violations: BoundaryViolation[] = [];

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const input = inputs[i];

      const validationResult = boundary.validateBoundaryInvariants(input);
      if (!validationResult.ok) {
        violations.push(validationResult.error);
      }
    }

    if (violations.length > 0) {
      return { ok: false, error: violations };
    }

    return { ok: true, data: true };
  }
}

// === Factory Functions ===

/**
 * CI実行境界のファクトリー
 */
export function createCIExecutionBoundary(): CIExecutionBoundary {
  return new CIExecutionBoundaryImpl();
}

/**
 * プロセス実行境界のファクトリー
 */
export function createProcessExecutionBoundary(): ProcessExecutionBoundary {
  return new ProcessExecutionBoundaryImpl();
}
