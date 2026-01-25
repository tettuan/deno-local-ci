/**
 * Deno Local CI - History Store
 *
 * Execution history persistence per system.md Section 5.
 * Stores results in .ci-local/history.json for `ci status` and `ci retry` support.
 *
 * @module
 */

import { join } from "@std/path";
import { FileSystemService } from "./file_system.ts";
import {
  createError,
  type ExecutionRecord,
  type HistoryFile,
  type Result,
  type StageExecutionRecord,
  type ValidationError,
} from "./types.ts";

/** Default maximum number of execution records to keep */
const DEFAULT_MAX_RECORDS = 50;

/** History file name */
const HISTORY_FILE_NAME = "history.json";

/** CI local directory name */
const CI_LOCAL_DIR = ".ci-local";

/**
 * History Store Service
 *
 * Manages execution history persistence in .ci-local/history.json.
 * Provides methods for saving, loading, and querying execution records.
 */
export class HistoryStore {
  private readonly historyPath: string;
  private readonly ciLocalDir: string;
  private readonly maxRecords: number;

  private constructor(
    projectRoot: string,
    maxRecords: number = DEFAULT_MAX_RECORDS,
  ) {
    this.maxRecords = maxRecords;
    this.ciLocalDir = join(projectRoot, CI_LOCAL_DIR);
    this.historyPath = join(this.ciLocalDir, HISTORY_FILE_NAME);
  }

  /**
   * Create a HistoryStore instance for the given project root.
   */
  static create(
    projectRoot: string,
    maxRecords: number = DEFAULT_MAX_RECORDS,
  ): Result<HistoryStore, ValidationError & { message: string }> {
    if (!projectRoot || String.prototype.trim.call(projectRoot) === "") {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "Project root cannot be empty"),
      };
    }

    return { ok: true, data: new HistoryStore(projectRoot, maxRecords) };
  }

  /**
   * Ensure .ci-local directory exists.
   */
  ensureCILocalDir(): Promise<Result<void, ValidationError & { message: string }>> {
    return FileSystemService.ensureDirectory(this.ciLocalDir);
  }

  /**
   * Load history from file.
   * Returns empty history if file doesn't exist.
   */
  async load(): Promise<Result<HistoryFile, ValidationError & { message: string }>> {
    // Check if file exists
    if (!(await FileSystemService.fileExists(this.historyPath))) {
      // Return empty history
      return {
        ok: true,
        data: {
          version: 1,
          executions: [],
          maxRecords: this.maxRecords,
        },
      };
    }

    // Read file
    const readResult = await FileSystemService.readTextFile(this.historyPath);
    if (!readResult.ok) {
      return readResult;
    }

    // Parse JSON
    try {
      const parsed = JSON.parse(readResult.data) as HistoryFile;

      // Validate structure
      if (typeof parsed.version !== "number" || !Array.isArray(parsed.executions)) {
        return {
          ok: false,
          error: createError({
            kind: "ParseError",
            input: "history.json",
          }, "Invalid history file format"),
        };
      }

      return { ok: true, data: parsed };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: createError({
          kind: "ParseError",
          input: "history.json",
        }, `Failed to parse history file: ${errorMessage}`),
      };
    }
  }

  /**
   * Save execution record to history.
   * Prepends new record and trims old records to maxRecords limit.
   */
  async save(
    record: ExecutionRecord,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    // Ensure directory exists
    const dirResult = await this.ensureCILocalDir();
    if (!dirResult.ok) {
      return dirResult;
    }

    // Load existing history
    const loadResult = await this.load();
    if (!loadResult.ok) {
      return loadResult;
    }

    const history = loadResult.data;

    // Prepend new record (newest first)
    Array.prototype.unshift.call(history.executions, record);

    // Trim to max records
    if (history.executions.length > this.maxRecords) {
      history.executions = Array.prototype.slice.call(history.executions, 0, this.maxRecords);
    }

    // Update max records
    history.maxRecords = this.maxRecords;

    // Write back
    const content = JSON.stringify(history, null, 2);
    return FileSystemService.writeTextFile(this.historyPath, content);
  }

  /**
   * Get the latest execution record.
   */
  async getLatest(): Promise<
    Result<ExecutionRecord | null, ValidationError & { message: string }>
  > {
    const loadResult = await this.load();
    if (!loadResult.ok) {
      return loadResult;
    }

    const history = loadResult.data;
    const latest = history.executions.length > 0 ? history.executions[0] : null;

    return { ok: true, data: latest };
  }

  /**
   * Get the last N execution records.
   */
  async getRecent(
    count: number = 10,
  ): Promise<Result<ExecutionRecord[], ValidationError & { message: string }>> {
    const loadResult = await this.load();
    if (!loadResult.ok) {
      return loadResult;
    }

    const records = Array.prototype.slice.call(loadResult.data.executions, 0, count);
    return { ok: true, data: records };
  }

  /**
   * Get failed executions for retry support.
   */
  async getFailedExecutions(): Promise<
    Result<ExecutionRecord[], ValidationError & { message: string }>
  > {
    const loadResult = await this.load();
    if (!loadResult.ok) {
      return loadResult;
    }

    const failed = Array.prototype.filter.call(
      loadResult.data.executions,
      (e: ExecutionRecord) => !e.success,
    );
    return { ok: true, data: failed };
  }

  /**
   * Clear all history.
   */
  async clear(): Promise<Result<void, ValidationError & { message: string }>> {
    const emptyHistory: HistoryFile = {
      version: 1,
      executions: [],
      maxRecords: this.maxRecords,
    };

    const dirResult = await this.ensureCILocalDir();
    if (!dirResult.ok) {
      return dirResult;
    }

    const content = JSON.stringify(emptyHistory, null, 2);
    return FileSystemService.writeTextFile(this.historyPath, content);
  }

  /**
   * Get the path to the history file.
   */
  getHistoryPath(): string {
    return this.historyPath;
  }

  /**
   * Get the path to the .ci-local directory.
   */
  getCILocalDir(): string {
    return this.ciLocalDir;
  }
}

/**
 * Helper to create an ExecutionRecord from CI run results.
 */
export function createExecutionRecord(params: {
  success: boolean;
  totalDuration: number;
  stages: StageExecutionRecord[];
  config: {
    mode: string;
    hierarchy: string | null;
    fallbackEnabled: boolean;
    batchSize?: number;
  };
  failedBatchInfo?: { startIndex: number; endIndex: number; files: string[] };
}): ExecutionRecord {
  const id = generateExecutionId();
  const timestamp = new Date().toISOString();

  // Try to get git info
  const git = getGitInfo();

  return {
    id,
    timestamp,
    success: params.success,
    totalDuration: params.totalDuration,
    stages: params.stages,
    config: params.config,
    failedBatchInfo: params.failedBatchInfo,
    git,
  };
}

/**
 * Generate unique execution ID.
 */
function generateExecutionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomUUID().substring(0, 8);
  return `${timestamp}-${random}`;
}

/**
 * Try to get git branch and commit info.
 * Returns undefined values if git info is not available.
 */
function getGitInfo(): { branch?: string; commit?: string } | undefined {
  try {
    // Try to get current branch
    const branchResult = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "null",
    }).outputSync();

    // Try to get current commit
    const commitResult = new Deno.Command("git", {
      args: ["rev-parse", "--short", "HEAD"],
      stdout: "piped",
      stderr: "null",
    }).outputSync();

    if (branchResult.code !== 0 && commitResult.code !== 0) {
      return undefined;
    }

    const decoder = new TextDecoder();
    const branch = branchResult.code === 0
      ? String.prototype.trim.call(decoder.decode(branchResult.stdout))
      : undefined;
    const commit = commitResult.code === 0
      ? String.prototype.trim.call(decoder.decode(commitResult.stdout))
      : undefined;

    return { branch, commit };
  } catch {
    return undefined;
  }
}
