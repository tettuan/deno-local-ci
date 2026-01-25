/**
 * Deno Local CI - File System Service
 *
 * ファイルシステム操作とパス管理の責務
 * 型安全なファイル操作とディレクトリ走査
 */

import { basename, dirname, join, relative, resolve } from "@std/path";
import { createError } from "./types.ts";
import type { Result, TestFileInfo, ValidationError } from "./types.ts";
import { FileClassificationService } from "./domain_services.ts";

/**
 * ファイルシステム操作サービス
 */
export class FileSystemService {
  private constructor() {}

  /**
   * ディレクトリの存在確認
   */
  static async directoryExists(path: string): Promise<boolean> {
    try {
      const stat = await Deno.stat(path);
      return stat.isDirectory;
    } catch {
      return false;
    }
  }

  /**
   * ファイルの存在確認
   */
  static async fileExists(path: string): Promise<boolean> {
    try {
      const stat = await Deno.stat(path);
      return stat.isFile;
    } catch {
      return false;
    }
  }

  /**
   * ディレクトリ作成
   */
  static async ensureDirectory(
    path: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      await Deno.mkdir(path, { recursive: true });
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "mkdir",
          path,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to create directory: ${path}`),
      };
    }
  }

  /**
   * ファイル読み取り
   */
  static async readTextFile(
    path: string,
  ): Promise<Result<string, ValidationError & { message: string }>> {
    try {
      const content = await Deno.readTextFile(path);
      return { ok: true, data: content };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "readFile",
          path,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to read file: ${path}`),
      };
    }
  }

  /**
   * ファイル書き込み
   */
  static async writeTextFile(
    path: string,
    content: string,
  ): Promise<Result<void, ValidationError & { message: string }>> {
    try {
      // ディレクトリが存在しない場合は作成
      const dir = dirname(path);
      if (!(await this.directoryExists(dir))) {
        const dirResult = await this.ensureDirectory(dir);
        if (!dirResult.ok) return dirResult;
      }

      await Deno.writeTextFile(path, content);
      return { ok: true, data: undefined };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "writeFile",
          path,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to write file: ${path}`),
      };
    }
  }
}

/**
 * プロジェクトファイル発見サービス
 */
export class ProjectFileDiscovery {
  private constructor() {}

  /**
   * プロジェクトルート検出
   */
  static async findProjectRoot(
    startPath: string = Deno.cwd(),
  ): Promise<Result<string, ValidationError & { message: string }>> {
    let currentPath = resolve(startPath);

    while (true) {
      // deno.json または deno.jsonc の存在確認
      const denoJsonPath = join(currentPath, "deno.json");
      const denoJsoncPath = join(currentPath, "deno.jsonc");

      if (
        await FileSystemService.fileExists(denoJsonPath) ||
        await FileSystemService.fileExists(denoJsoncPath)
      ) {
        return { ok: true, data: currentPath };
      }

      const parentPath = dirname(currentPath);
      if (parentPath === currentPath) {
        // ルートディレクトリに到達
        break;
      }
      currentPath = parentPath;
    }

    return {
      ok: false,
      error: createError({
        kind: "FileSystemError",
        operation: "findProjectRoot",
        path: startPath,
        cause: "No deno.json or deno.jsonc found",
      }, `Project root not found starting from: ${startPath}`),
    };
  }

  /**
   * Discover and categorize project files according to architecture design.
   *
   * Returns TestFileInfo containing all categorized files for CI processing.
   *
   * @param root - Project root directory
   * @param hierarchy - Optional hierarchy restriction (null = project-wide)
   * @returns TestFileInfo with categorized file arrays
   */
  static async discoverProjectFiles(
    root: string,
    hierarchy?: string | null,
  ): Promise<Result<TestFileInfo, ValidationError & { message: string }>> {
    try {
      const targetDirectory = hierarchy ? join(root, hierarchy) : root;

      // Check if target directory exists
      if (!(await FileSystemService.directoryExists(targetDirectory))) {
        return {
          ok: false,
          error: createError({
            kind: "FileSystemError",
            operation: "discoverProjectFiles",
            path: targetDirectory,
            cause: "Target directory does not exist",
          }, `Directory not found: ${targetDirectory}`),
        };
      }

      // Find all relevant files
      const allFilesResult = await this.findAllFiles(targetDirectory);
      if (!allFilesResult.ok) {
        return allFilesResult;
      }

      // Classify files using domain service
      const classified = FileClassificationService.classifyFiles(allFilesResult.data);

      const fileInfo: TestFileInfo = {
        testFiles: classified.testFiles,
        typeCheckFiles: classified.typeCheckFiles,
        allFiles: allFilesResult.data,
        projectRoot: root,
        hierarchy: hierarchy || null,
      };

      return { ok: true, data: fileInfo };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "discoverProjectFiles",
          path: hierarchy ? join(root, hierarchy) : root,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to discover project files`),
      };
    }
  }

  /**
   * Find all relevant files in the target directory.
   */
  private static async findAllFiles(
    targetDirectory: string,
  ): Promise<Result<string[], ValidationError & { message: string }>> {
    const patterns = [
      "**/*.ts",
      "**/*.tsx",
      "**/*.d.ts",
      "**/deno.json",
      "**/deno.lock",
      "**/import_map.json",
    ];

    try {
      const allFiles: string[] = [];

      for (const pattern of patterns) {
        const foundFiles = await this.globFiles(targetDirectory, pattern);
        if (foundFiles.ok) {
          allFiles.push(...foundFiles.data);
        }
      }

      // Remove duplicates and sort
      const uniqueFiles = [...new Set(allFiles)].sort();
      return { ok: true, data: uniqueFiles };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "findAllFiles",
          path: targetDirectory,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to find files in: ${targetDirectory}`),
      };
    }
  }

  /**
   * テストファイル発見
   */
  static async findTestFiles(
    rootPath: string,
    patterns: string[] = ["**/*_test.ts", "**/*.test.ts"],
  ): Promise<Result<string[], ValidationError & { message: string }>> {
    try {
      const files: string[] = [];

      for (const pattern of patterns) {
        const foundFiles = await this.globFiles(rootPath, pattern);
        if (foundFiles.ok) {
          files.push(...foundFiles.data);
        }
      }

      // 重複排除とソート
      const uniqueFiles = [...new Set(files)].sort();
      return { ok: true, data: uniqueFiles };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "findTestFiles",
          path: rootPath,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to find test files in: ${rootPath}`),
      };
    }
  }

  /**
   * TypeScriptファイル発見
   */
  static async findTypeScriptFiles(
    rootPath: string,
    includeTests: boolean = false,
  ): Promise<Result<string[], ValidationError & { message: string }>> {
    try {
      const patterns = includeTests
        ? ["**/*.ts", "**/*.tsx", "**/*.d.ts"]
        : ["**/*.ts", "**/*.tsx", "**/*.d.ts", "!**/*_test.ts", "!**/*.test.ts"];

      const files: string[] = [];

      for (const pattern of patterns) {
        const foundFiles = await this.globFiles(rootPath, pattern);
        if (foundFiles.ok) {
          files.push(...foundFiles.data);
        }
      }

      const uniqueFiles = [...new Set(files)].sort();
      return { ok: true, data: uniqueFiles };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "findTypeScriptFiles",
          path: rootPath,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to find TypeScript files in: ${rootPath}`),
      };
    }
  }

  /**
   * グロブパターンによるファイル検索
   */
  private static async globFiles(
    rootPath: string,
    pattern: string,
  ): Promise<Result<string[], ValidationError & { message: string }>> {
    try {
      const files: string[] = [];
      const isNegativePattern = pattern.startsWith("!");
      const actualPattern = isNegativePattern ? pattern.slice(1) : pattern;

      // シンプルなグロブ実装（**/*.ts パターンのみサポート）
      if (actualPattern.includes("**/*")) {
        const extension = actualPattern.split("**/*")[1];
        const foundFiles = await this.walkDirectory(rootPath, extension);
        if (foundFiles.ok) {
          files.push(...foundFiles.data);
        }
      }

      return { ok: true, data: files };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "globFiles",
          path: rootPath,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to glob files: ${pattern}`),
      };
    }
  }

  /**
   * ディレクトリ再帰走査
   */
  private static async walkDirectory(
    dirPath: string,
    extension: string,
  ): Promise<Result<string[], ValidationError & { message: string }>> {
    try {
      const files: string[] = [];

      for await (const entry of Deno.readDir(dirPath)) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory && !entry.name.startsWith(".")) {
          const subFiles = await this.walkDirectory(fullPath, extension);
          if (subFiles.ok) {
            files.push(...subFiles.data);
          }
        } else if (entry.isFile && entry.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }

      return { ok: true, data: files };
    } catch (error) {
      return {
        ok: false,
        error: createError({
          kind: "FileSystemError",
          operation: "walkDirectory",
          path: dirPath,
          cause: error instanceof Error ? error.message : String(error),
        }, `Failed to walk directory: ${dirPath}`),
      };
    }
  }

  /**
   * 相対パス変換
   */
  static getRelativePath(from: string, to: string): string {
    return relative(from, to);
  }

  /**
   * ベースネーム取得
   */
  static getBasename(path: string): string {
    return basename(path);
  }

  /**
   * ディレクトリ名取得
   */
  static getDirname(path: string): string {
    return dirname(path);
  }
}
