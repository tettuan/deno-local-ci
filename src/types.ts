/**
 * # Deno Local CI - Core Type Definitions
 *
 * Comprehensive type system for type-safe CI execution based on totality principles.
 * Implements discriminated unions, Result types, and smart constructors for robust type safety.
 *
 * ## Design Principles
 * - **Type Safety**: Complete type coverage with no `any` types
 * - **Error Values**: All errors are represented as values, not exceptions
 * - **Discriminated Unions**: Precise state modeling with exhaustive pattern matching
 * - **Smart Constructors**: Validated construction preventing invalid states
 * - **Immutability**: All types are immutable by design
 *
 * @module
 */

// === Result Type for Error Value Handling ===

/**
 * Generic Result type for error handling without exceptions.
 *
 * Represents either a successful result with data or a failure with error information.
 * This pattern eliminates the need for try-catch blocks and makes error handling explicit.
 *
 * @template T - The type of successful result data
 * @template E - The type of error information
 *
 * @example
 * ```typescript
 * function parseNumber(input: string): Result<number, string> {
 *   const num = parseInt(input);
 *   return isNaN(num)
 *     ? { ok: false, error: "Invalid number" }
 *     : { ok: true, data: num };
 * }
 *
 * const result = parseNumber("42");
 * if (result.ok) {
 *   console.log(result.data); // TypeScript knows this is number
 * } else {
 *   console.error(result.error); // TypeScript knows this is string
 * }
 * ```
 */
export type Result<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E };

// === Common Error Type Definitions ===

/**
 * Comprehensive validation error types for input validation across the system.
 *
 * Uses discriminated unions to provide precise error classification with context.
 * Each error variant includes relevant information for error reporting and debugging.
 *
 * @example
 * ```typescript
 * function validateBatchSize(size: number): Result<number, ValidationError> {
 *   if (size < 1 || size > 100) {
 *     return {
 *       ok: false,
 *       error: { kind: "OutOfRange", value: size, min: 1, max: 100 }
 *     };
 *   }
 *   return { ok: true, data: size };
 * }
 * ```
 */
export type ValidationError =
  | { kind: "OutOfRange"; value: unknown; min?: number; max?: number }
  | { kind: "InvalidRegex"; pattern: string }
  | { kind: "PatternMismatch"; value: string; pattern: string }
  | { kind: "ParseError"; input: string }
  | { kind: "EmptyInput" }
  | { kind: "TooLong"; value: string; maxLength: number }
  | { kind: "FileSystemError"; operation: string; path: string; cause: string };

// === CI Execution Strategy Domain ===

/**
 * Execution mode configuration for the CI pipeline.
 *
 * Defines how tests and checks should be executed, with different modes
 * optimized for different scenarios and performance characteristics.
 *
 * @example
 * ```typescript
 * // Batch mode for balanced performance and isolation
 * const batchMode: ExecutionMode = {
 *   kind: "batch",
 *   batchSize: 25,
 *   failedBatchOnly: false
 * };
 *
 * // Single-file mode for maximum isolation and debugging
 * const singleFileMode: ExecutionMode = {
 *   kind: "single-file",
 *   stopOnFirstError: true
 * };
 * ```
 */
export type ExecutionMode =
  | { kind: "all"; projectDirectories: string[] }
  | { kind: "batch"; batchSize: number; failedBatchOnly: boolean }
  | { kind: "single-file"; stopOnFirstError: boolean };

// === CI Stage and Error Type Definitions ===
export type CIStage =
  | { kind: "lockfile-init"; action: "regenerate" }
  | { kind: "type-check"; files: string[]; optimized: boolean }
  | { kind: "jsr-check"; dryRun: boolean; allowDirty: boolean }
  | { kind: "test-execution"; strategy: ExecutionStrategy }
  | { kind: "lint-check"; files: string[] }
  | { kind: "format-check"; checkOnly: boolean };

export type StageResult =
  | { kind: "success"; stage: CIStage; duration: number }
  | { kind: "failure"; stage: CIStage; error: string; shouldStop: true }
  | { kind: "skipped"; stage: CIStage; reason: string };

export type CIError =
  | { kind: "TypeCheckError"; files: string[]; details: string[] }
  | { kind: "TestFailure"; files: string[]; errors: string[] }
  | { kind: "JSRError"; output: string; suggestion: string }
  | { kind: "FormatError"; files: string[]; fixCommand: string }
  | { kind: "LintError"; files: string[]; details: string[] }
  | { kind: "ConfigurationError"; field: string; value: unknown }
  | { kind: "FileSystemError"; operation: string; path: string; cause: string };

// === テスト結果・ファイル型定義 ===
export type TestResult =
  | { kind: "success"; filePath: string; duration: number }
  | { kind: "failure"; filePath: string; error: string }
  | { kind: "skipped"; filePath: string; reason: string };

export type TestFileType =
  | { kind: "test"; pattern: "*_test.ts" | "*.test.ts" }
  | { kind: "typecheck"; pattern: "*.ts" | "*.tsx" | "*.d.ts" }
  | { kind: "config"; pattern: "deno.json" | "deno.lock" | "import_map.json" };

// === ログ・診断機能 ===
export type LogMode =
  | { kind: "normal"; showSections: true }
  | { kind: "silent"; errorsOnly: true }
  | { kind: "debug"; verboseLevel: "high"; breakdownLoggerEnv: BreakdownLoggerEnvConfig }
  | { kind: "error-files-only"; implicitSilent: true };

// === プロセス実行結果 ===
export type ProcessResult = {
  success: boolean;
  code: number;
  stdout: string;
  stderr: string;
  duration: number;
};

// === CI設定 ===
export type CIConfig = {
  mode?: ExecutionMode;
  fallbackEnabled?: boolean;
  batchSize?: number;
  logMode?: LogMode;
  breakdownLoggerConfig?: BreakdownLoggerEnvConfig;
  stopOnFirstError?: boolean;
  allowDirty?: boolean;
};

// === Smart Constructor Classes ===

/**
 * 実行戦略 - バッチサイズ制約とフォールバック機能
 */
export class ExecutionStrategy {
  private constructor(
    readonly mode: ExecutionMode,
    readonly fallbackEnabled: boolean,
  ) {}

  static create(
    mode: ExecutionMode,
    fallbackEnabled = true,
  ): Result<ExecutionStrategy, ValidationError & { message: string }> {
    if (mode.kind === "batch" && (mode.batchSize < 1 || mode.batchSize > 100)) {
      return {
        ok: false,
        error: createError({
          kind: "OutOfRange",
          value: mode.batchSize,
          min: 1,
          max: 100,
        }),
      };
    }
    return { ok: true, data: new ExecutionStrategy(mode, fallbackEnabled) };
  }

  getNextFallbackMode(): ExecutionMode | null {
    switch (this.mode.kind) {
      case "all":
        return { kind: "batch", batchSize: 25, failedBatchOnly: false };
      case "batch":
        return { kind: "single-file", stopOnFirstError: true };
      case "single-file":
        return null;
    }
  }
}

/**
 * BreakdownLogger環境変数設定
 */
export class BreakdownLoggerEnvConfig {
  private constructor(
    readonly logLength: "W" | "M" | "L",
    readonly logKey: string,
  ) {}

  static create(
    logLength: string,
    logKey: string,
  ): Result<BreakdownLoggerEnvConfig, ValidationError & { message: string }> {
    if (!["W", "M", "L"].includes(logLength)) {
      return {
        ok: false,
        error: createError({
          kind: "PatternMismatch",
          value: logLength,
          pattern: "W|M|L",
        }),
      };
    }
    if (logKey.length === 0) {
      return {
        ok: false,
        error: createError({ kind: "EmptyInput" }),
      };
    }
    return {
      ok: true,
      data: new BreakdownLoggerEnvConfig(logLength as "W" | "M" | "L", logKey),
    };
  }

  setEnvironmentVariables(): void {
    Deno.env.set("LOG_LENGTH", this.logLength);
    Deno.env.set("LOG_KEY", this.logKey);
  }
}

// === エラー作成ヘルパー ===
export const createError = (
  error: ValidationError,
  customMessage?: string,
): ValidationError & { message: string } => ({
  ...error,
  message: customMessage || getDefaultMessage(error),
});

const getDefaultMessage = (error: ValidationError): string => {
  switch (error.kind) {
    case "OutOfRange":
      return `Value ${error.value} is out of range ${error.min ?? "?"}-${error.max ?? "?"}`;
    case "InvalidRegex":
      return `Invalid regex pattern: ${error.pattern}`;
    case "PatternMismatch":
      return `Value "${error.value}" does not match pattern ${error.pattern}`;
    case "ParseError":
      return `Cannot parse "${error.input}"`;
    case "EmptyInput":
      return "Input cannot be empty";
    case "TooLong":
      return `Value "${error.value}" exceeds maximum length of ${error.maxLength}`;
    case "FileSystemError":
      return `File system error in ${error.operation} at ${error.path}: ${error.cause}`;
  }
};
