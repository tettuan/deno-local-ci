/**
 * Deno Local CI - Process Runner
 *
 * 外部プロセス実行とDenoコマンドの責務を担う
 * 型安全なプロセス実行とエラーハンドリング
 */

import { createError, ProcessResult, Result, TestStats, ValidationError } from "./types.ts";

/**
 * テスト出力からサマリー行を抽出（シンプル版）
 */
export function extractTestSummaryLine(output: string): string | undefined {
  const lines = output.split("\n");

  // "passed" と "failed" が含まれる行、または "ok |" で始まる行を探す
  for (const line of lines) {
    if (
      (line.includes("passed") && line.includes("failed")) ||
      line.trim().startsWith("ok |") ||
      line.trim().match(/^(PASSED|FAILED)\s*\|/)
    ) {
      // 先頭の空白や特殊文字を除去して返す
      return line.trim();
    }
  }

  return undefined;
}

/**
 * テスト実行結果の出力解析クラス
 */
class TestOutputAnalyzer {
  private constructor() {}

  /**
   * deno test 出力からテスト統計を抽出
   * Smart Constructor パターンでテスト出力の型安全な解析
   */
  static analyzeTestOutput(stdout: string, stderr: string): TestStats {
    const output = stdout + stderr;

    // パターン1: "ok | 76 passed | 0 failed" (最終サマリー) - より厳密なマッチング
    const summaryPattern = /ok\s*\|\s*(\d+)\s+passed\s*\|\s*(\d+)\s+failed/;
    const summaryMatch = output.match(summaryPattern);
    if (summaryMatch) {
      const passed = parseInt(summaryMatch[1], 10);
      const failed = parseInt(summaryMatch[2], 10);
      return {
        filesRun: this.extractFileCount(output),
        testsRun: passed + failed,
        testsPassed: passed,
        testsFailed: failed,
      };
    }

    // パターン2: 個別テスト結果から集計
    const testMatches = output.match(/running (\d+) tests? from/g);
    const fileCount = testMatches ? testMatches.length : 0;

    // パスしたテスト数をカウント
    const passedMatches = output.match(/\.\.\. ok/g);
    const passed = passedMatches ? passedMatches.length : 0;

    // 失敗したテスト数をカウント
    const failedMatches = output.match(/\.\.\. FAILED/g);
    const failed = failedMatches ? failedMatches.length : 0;

    return {
      filesRun: fileCount,
      testsRun: passed + failed,
      testsPassed: passed,
      testsFailed: failed,
    };
  } /**
   * テストファイル数を抽出
   */

  private static extractFileCount(output: string): number {
    // "running N tests from ./path/to/file.test.ts" パターンをカウント
    const fileMatches = output.match(/running \d+ tests? from [./]/g);
    return fileMatches ? fileMatches.length : 0;
  }
}

/**
 * プロセス実行サービス
 */
export class ProcessRunner {
  private constructor() {}

  /**
   * 単一コマンド実行
   */
  static async runCommand(
    command: string,
    args: string[] = [],
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const startTime = performance.now();

    try {
      const cmd = new Deno.Command(command, {
        args,
        cwd: options.cwd,
        env: { ...Deno.env.toObject(), ...options.env },
        stdout: "piped",
        stderr: "piped",
      });

      const process = cmd.spawn();

      // タイムアウト処理
      let timeoutId: number | undefined;
      const timeoutPromise = options.timeout
        ? new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            process.kill("SIGTERM");
            reject(new Error(`Command timeout after ${options.timeout}ms`));
          }, options.timeout);
        })
        : null;

      try {
        const result = timeoutPromise
          ? await Promise.race([process.output(), timeoutPromise])
          : await process.output();

        if (timeoutId) clearTimeout(timeoutId);

        const duration = performance.now() - startTime;
        const stdout = new TextDecoder().decode(result.stdout);
        const stderr = new TextDecoder().decode(result.stderr);

        return {
          ok: true,
          data: {
            success: result.success,
            code: result.code,
            stdout,
            stderr,
            duration,
          },
        };
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);

        return {
          ok: false,
          error: createError({
            kind: "ParseError",
            input: `${command} ${args.join(" ")}`,
          }, `Process execution failed: ${error instanceof Error ? error.message : String(error)}`),
        };
      }
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "ParseError",
          input: `${command} ${args.join(" ")}`,
        }, `Failed to start process: ${error instanceof Error ? error.message : String(error)}`),
      };
    }
  }

  /**
   * 並列コマンド実行
   */
  static async runCommandsInParallel(
    commands: Array<{ command: string; args: string[]; cwd?: string }>,
    options: {
      maxConcurrency?: number;
      timeout?: number;
      env?: Record<string, string>;
    } = {},
  ): Promise<ProcessResult[]> {
    const maxConcurrency = options.maxConcurrency || 5;
    const results: ProcessResult[] = [];

    for (let i = 0; i < commands.length; i += maxConcurrency) {
      const batch = commands.slice(i, i + maxConcurrency);
      const batchPromises = batch.map((cmd) =>
        this.runCommand(cmd.command, cmd.args, {
          cwd: cmd.cwd,
          timeout: options.timeout,
          env: options.env,
        })
      );

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.ok) {
          results.push(result.data);
        } else {
          // エラーの場合も結果として追加（失敗したプロセス結果）
          results.push({
            success: false,
            code: -1,
            stdout: "",
            stderr: result.error.message,
            duration: 0,
          });
        }
      }
    }

    return results;
  }
}

/**
 * Deno専用コマンド実行サービス
 */
export class DenoCommandRunner {
  private constructor() {}

  /**
   * Deno型チェック実行（階層指定サポート）
   * 全域性原則：特定ファイルが指定された場合は、階層に関係なく、その特定ファイルのみチェック
   */
  static async typeCheck(
    files: string[] = [],
    options: { remote?: boolean; noCheck?: boolean; hierarchy?: string | null } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["check"];

    if (options.remote) args.push("--remote");
    if (options.noCheck) args.push("--no-check");

    // 型安全な実行戦略の決定
    if (files.length > 0) {
      // 特定ファイルが指定されている場合は、常にそのファイルのみチェック
      args.push(...files);
    } else if (options.hierarchy) {
      // ファイル指定がなく、階層のみ指定されている場合
      args.push(options.hierarchy);
    }
    // files.length === 0 && !options.hierarchy の場合は引数なし（プロジェクト全体）

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * Denoテスト実行（階層指定サポート）
   * 全域性原則：単一ファイルが指定された場合は、階層に関係なく、その特定ファイルのみ実行
   * テスト統計解析機能付き
   */
  static async test(
    files: string[] = [],
    options: {
      filter?: string;
      parallel?: boolean;
      coverage?: boolean;
      permissions?: string[];
      hierarchy?: string | null;
    } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["test"];

    // 権限設定
    const defaultPermissions = [
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "--allow-env",
    ];
    args.push(...(options.permissions || defaultPermissions));

    if (options.filter) {
      args.push("--filter", options.filter);
    }

    if (options.parallel) {
      args.push("--parallel");
    }

    if (options.coverage) {
      args.push("--coverage");
    }

    // 型安全な実行戦略の決定
    // 1. 特定ファイルが指定されている場合：そのファイルを優先実行（single-file/batchモード対応）
    // 2. 階層のみが指定されている場合：階層全体を実行（allモード対応）
    if (files.length > 0) {
      // 特定ファイルが指定されている場合は、常にそのファイルのみ実行
      args.push(...files);
    } else if (options.hierarchy) {
      // ファイル指定がなく、階層のみ指定されている場合
      args.push(options.hierarchy);
    }
    // files.length === 0 && !options.hierarchy の場合は引数なし（プロジェクト全体）

    const result = await ProcessRunner.runCommand("deno", args);

    // テスト実行結果の場合、統計情報を解析して追加
    if (result.ok) {
      const testStats = TestOutputAnalyzer.analyzeTestOutput(
        result.data.stdout,
        result.data.stderr,
      );

      return {
        ok: true,
        data: {
          ...result.data,
          testStats,
        },
      };
    }

    return result;
  }

  /**
   * Denoリント実行（階層指定サポート）
   * 全域性原則：特定ファイルが指定された場合は、階層に関係なく、その特定ファイルのみリント
   */
  static async lint(
    files: string[] = [],
    options: { rules?: string[]; ignore?: string[]; hierarchy?: string | null } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["lint"];

    if (options.rules && options.rules.length > 0) {
      args.push("--rules-tags", options.rules.join(","));
    }

    if (options.ignore && options.ignore.length > 0) {
      for (const ignorePattern of options.ignore) {
        args.push("--ignore", ignorePattern);
      }
    }

    // 型安全な実行戦略の決定
    if (files.length > 0) {
      // 特定ファイルが指定されている場合は、常にそのファイルのみリント
      args.push(...files);
    } else if (options.hierarchy) {
      // ファイル指定がなく、階層のみ指定されている場合
      args.push(options.hierarchy);
    }
    // files.length === 0 && !options.hierarchy の場合は引数なし（プロジェクト全体）

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * Denoフォーマット実行（階層指定サポート）
   * 全域性原則：特定ファイルが指定された場合は、階層に関係なく、その特定ファイルのみフォーマット
   */
  static async format(
    files: string[] = [],
    options: { check?: boolean; indentWidth?: number; hierarchy?: string | null } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["fmt"];

    if (options.check) {
      args.push("--check");
    }

    if (options.indentWidth) {
      args.push("--indent-width", options.indentWidth.toString());
    }

    // 型安全な実行戦略の決定
    if (files.length > 0) {
      // 特定ファイルが指定されている場合は、常にそのファイルのみフォーマット
      args.push(...files);
    } else if (options.hierarchy) {
      // ファイル指定がなく、階層のみ指定されている場合
      args.push(options.hierarchy);
    }
    // files.length === 0 && !options.hierarchy の場合は引数なし（プロジェクト全体）

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * JSR公開チェック（階層指定時はスキップされる）
   */
  static async jsrCheck(
    options: { dryRun?: boolean; allowDirty?: boolean; hierarchy?: string | null } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    // 階層が指定されている場合はスキップ（要求事項に基づく）
    if (options.hierarchy) {
      return {
        ok: false,
        error: createError({
          kind: "EmptyInput",
        }, "JSR check is skipped when hierarchy is specified"),
      };
    }

    const args = ["publish"];

    if (options.dryRun !== false) {
      args.push("--dry-run");
    }

    if (options.allowDirty) {
      args.push("--allow-dirty");
    }

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * lockfile再生成
   */
  static async regenerateLockfile(): Promise<
    Result<ProcessResult, ValidationError & { message: string }>
  > {
    return await ProcessRunner.runCommand("deno", ["cache", "--reload", "mod.ts"]);
  }
}
