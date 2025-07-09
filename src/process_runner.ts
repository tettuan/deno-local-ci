/**
 * Deno Local CI - Process Runner
 *
 * 外部プロセス実行とDenoコマンドの責務を担う
 * 型安全なプロセス実行とエラーハンドリング
 */

import { createError, ProcessResult, Result, ValidationError } from "./types.ts";

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
   * Deno型チェック実行
   */
  static async typeCheck(
    files: string[] = [],
    options: { remote?: boolean; noCheck?: boolean } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["check"];

    if (options.remote) args.push("--remote");
    if (options.noCheck) args.push("--no-check");

    args.push(...files);

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * Denoテスト実行
   */
  static async test(
    files: string[] = [],
    options: {
      filter?: string;
      parallel?: boolean;
      coverage?: boolean;
      permissions?: string[];
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

    args.push(...files);

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * Denoリント実行
   */
  static async lint(
    files: string[] = [],
    options: { rules?: string[]; ignore?: string[] } = {},
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

    args.push(...files);

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * Denoフォーマット実行
   */
  static async format(
    files: string[] = [],
    options: { check?: boolean; indentWidth?: number } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
    const args = ["fmt"];

    if (options.check) {
      args.push("--check");
    }

    if (options.indentWidth) {
      args.push("--indent-width", options.indentWidth.toString());
    }

    args.push(...files);

    return await ProcessRunner.runCommand("deno", args);
  }

  /**
   * JSR公開チェック
   */
  static async jsrCheck(
    options: { dryRun?: boolean; allowDirty?: boolean } = {},
  ): Promise<Result<ProcessResult, ValidationError & { message: string }>> {
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
