/**
 * # Deno Local CI - Domain Events
 *
 * ドメイン駆動設計に基づくイベント処理システム
 * CI実行中の状態変化と境界を超えたメッセージ送受信を管理
 *
 * ## 設計原則
 * - 全てのCI段階状態変化をイベントとして表現
 * - 境界を超えたメッセージ配信の保証
 * - 型安全なイベントハンドリング
 * - 時系列順序の保持
 *
 * @module
 */

import { CIError, CIStage, ExecutionStrategy, Result, StageResult } from "./types.ts";

// === Domain Event Types ===

/**
 * CI実行ID - 一意識別子として機能
 */
export type ExecutionId = string & { __brand: "ExecutionId" };

/**
 * CI実行中に発生するドメインイベント
 *
 * 全てのイベントはexecutionIdとtimestampを持ち、
 * CI実行の完全な監査証跡を提供する
 */
export type CIDomainEvent =
  | {
    kind: "StageStarted";
    stage: CIStage["kind"];
    timestamp: number;
    executionId: ExecutionId;
    metadata?: Record<string, unknown>;
  }
  | {
    kind: "StageCompleted";
    stage: CIStage["kind"];
    result: StageResult;
    timestamp: number;
    executionId: ExecutionId;
    duration: number;
  }
  | {
    kind: "StageFailed";
    stage: CIStage["kind"];
    error: CIError;
    timestamp: number;
    executionId: ExecutionId;
    context?: Record<string, unknown>;
  }
  | {
    kind: "FallbackTriggered";
    fromStrategy: ExecutionStrategy;
    toStrategy: ExecutionStrategy;
    reason: CIError;
    executionId: ExecutionId;
    timestamp: number;
  }
  | {
    kind: "PipelineStopped";
    reason: CIError;
    completedStages: StageResult[];
    timestamp: number;
    executionId: ExecutionId;
    totalDuration: number;
  }
  | {
    kind: "HierarchyTargeted";
    hierarchy: string;
    affectedFiles: string[];
    timestamp: number;
    executionId: ExecutionId;
  };

// === Event Handler Types ===

/**
 * イベントハンドラー - 型安全なイベント処理
 */
export type EventHandler<T extends CIDomainEvent> = (event: T) => Promise<void> | void;

/**
 * メッセージ配信エラー - 境界を超えた配信の失敗を表現
 */
export type MessageDeliveryError =
  | { kind: "HandlerTimeout"; eventKind: string; handlerName: string; timeoutMs: number }
  | { kind: "BoundaryViolation"; sourceContext: string; targetContext: string; violation: string }
  | { kind: "SerializationError"; event: CIDomainEvent; cause: string }
  | { kind: "DeliveryFailure"; event: CIDomainEvent; attempt: number; maxAttempts: number };

// === Execution ID Factory ===

/**
 * ExecutionID生成ファクトリー
 */
export class ExecutionIdFactory {
  /**
   * 新しいExecutionIDを生成
   * UUIDv4形式で一意性を保証
   */
  static generate(): ExecutionId {
    return crypto.randomUUID() as ExecutionId;
  }

  /**
   * 文字列からExecutionIDを作成（バリデーション付き）
   */
  static fromString(id: string): Result<ExecutionId, ValidationError> {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
      return {
        ok: false,
        error: {
          kind: "PatternMismatch",
          value: id,
          pattern: "UUID v4",
          message: "ExecutionId must be a valid UUID v4",
        },
      };
    }

    return { ok: true, data: id as ExecutionId };
  }
}

// === Event Bus Implementation ===

/**
 * イベントハンドラー登録情報
 */
interface HandlerRegistration<T extends CIDomainEvent> {
  handler: EventHandler<T>;
  name: string;
  context: string;
  timeout?: number;
}

/**
 * CI イベントバス
 *
 * 境界を超えたメッセージ配信を管理し、
 * 配信保証機能を提供する
 */
export class CIEventBus {
  private handlers = new Map<CIDomainEvent["kind"], HandlerRegistration<CIDomainEvent>[]>();
  private readonly defaultTimeout = 5000; // 5秒
  private readonly maxRetryAttempts = 3;

  /**
   * イベントハンドラーを登録
   *
   * @param eventKind - 処理するイベントの種別
   * @param handler - イベントハンドラー関数
   * @param name - ハンドラーの名前（デバッグ用）
   * @param context - ハンドラーのコンテキスト（境界識別用）
   * @param timeout - タイムアウト時間（ms）
   */
  subscribe<T extends CIDomainEvent>(
    eventKind: T["kind"],
    handler: EventHandler<T>,
    name: string,
    context: string = "default",
    timeout?: number,
  ): void {
    if (!this.handlers.has(eventKind)) {
      this.handlers.set(eventKind, []);
    }

    const registration: HandlerRegistration<CIDomainEvent> = {
      handler: handler as EventHandler<CIDomainEvent>,
      name,
      context,
      timeout: timeout || this.defaultTimeout,
    };

    this.handlers.get(eventKind)!.push(registration);
  }

  /**
   * イベントを発行（基本版）
   *
   * @param event - 発行するイベント
   */
  async publish(event: CIDomainEvent): Promise<void> {
    const result = await this.publishWithBoundaryGuarantee(event);
    if (!result.ok) {
      console.error("Event publishing failed:", result.error);
      // 基本版では例外を投げずにログ出力のみ
    }
  }

  /**
   * 境界を超えたメッセージ配信保証付きでイベント発行
   *
   * @param event - 発行するイベント
   * @returns 配信結果
   */
  async publishWithBoundaryGuarantee(
    event: CIDomainEvent,
  ): Promise<Result<void, MessageDeliveryError>> {
    const registrations = this.handlers.get(event.kind) || [];

    if (registrations.length === 0) {
      // ハンドラーが登録されていない場合は成功とみなす
      return { ok: true, data: undefined };
    }

    const results = await Promise.allSettled(
      registrations.map((registration) => this.executeHandlerWithRetry(event, registration)),
    );

    // 失敗したハンドラーがあるかチェック
    const failures = results
      .map((result, index) => ({ result, registration: registrations[index] }))
      .filter(({ result }) => result.status === "rejected");

    if (failures.length > 0) {
      return {
        ok: false,
        error: {
          kind: "DeliveryFailure",
          event,
          attempt: this.maxRetryAttempts,
          maxAttempts: this.maxRetryAttempts,
        },
      };
    }

    return { ok: true, data: undefined };
  }

  /**
   * ハンドラーをリトライ機能付きで実行
   */
  private async executeHandlerWithRetry(
    event: CIDomainEvent,
    registration: HandlerRegistration<CIDomainEvent>,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetryAttempts; attempt++) {
      try {
        await this.executeHandlerWithTimeout(event, registration);
        return; // 成功
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetryAttempts) {
          // 指数バックオフでリトライ
          await this.delay(Math.pow(2, attempt) * 100);
        }
      }
    }

    throw lastError;
  }

  /**
   * タイムアウト付きでハンドラーを実行
   */
  private async executeHandlerWithTimeout(
    event: CIDomainEvent,
    registration: HandlerRegistration<CIDomainEvent>,
  ): Promise<void> {
    let timeoutId: number | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Handler timeout after ${registration.timeout}ms`));
      }, registration.timeout);
    });

    const handlerPromise = Promise.resolve(registration.handler(event));

    try {
      await Promise.race([handlerPromise, timeoutPromise]);
    } finally {
      // タイマーをクリア
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * 指定時間待機
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 登録されているハンドラー数を取得
   */
  getHandlerCount(eventKind?: CIDomainEvent["kind"]): number {
    if (eventKind) {
      return this.handlers.get(eventKind)?.length || 0;
    }

    return Array.from(this.handlers.values())
      .reduce((total, handlers) => total + handlers.length, 0);
  }

  /**
   * 全てのハンドラーを削除
   */
  clear(): void {
    this.handlers.clear();
  }
}

// === Validation Error Type (temporary) ===
type ValidationError = {
  kind: string;
  value?: unknown;
  pattern?: string;
  message: string;
};
