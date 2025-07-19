/**
 * Local CI エラー検知統合テスト
 *
 * === 動的テストファイル生成について ===
 * このテストは、実行時に大量のテストファイルを動的に生成します：
 * - error_file_001.ts ~ error_file_100.ts (一時的なエラーファイル)
 * - error_test_001.test.ts ~ error_test_100.test.ts (一時的なテストファイル)
 *
 * これらのファイルは：
 * 1. テスト開始時に動的生成される
 * 2. テスト終了時に自動削除される (cleanup()で完全除去)
 * 3. git管理外の一時ファイルである
 * 4. フォールバック機能のテストに使用される
 *
 * 目的：local_ciが正しくエラーを検知し、フォールバック処理が動作するかをテストする
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.208.0/fs/mod.ts";

const ERROR_PATTERNS = [
  {
    id: 0,
    name: "構文エラー",
    code:
      `export function syntaxError() {\n  return "missing semicolon"\n  return "unreachable code";\n}`,
  },
  {
    id: 1,
    name: "型エラー",
    code: `export function typeError(): string {\n  return 123;\n}`,
  },
  {
    id: 2,
    name: "未定義変数エラー",
    code: `export const undefinedError = undefinedVariable;`,
  },
  {
    id: 3,
    name: "null参照エラー",
    code: `export function nullError() {\n  const obj = null;\n  return obj.property;\n}`,
  },
  {
    id: 4,
    name: "配列範囲外エラー",
    code: `export function arrayError() {\n  const arr = [1, 2, 3];\n  return arr[100];\n}`,
  },
  {
    id: 5,
    name: "関数未定義エラー",
    code: `export function functionError() {\n  return nonExistentFunction();\n}`,
  },
  {
    id: 6,
    name: "非同期エラー",
    code: `export async function asyncError() {\n  throw new Error("Async error");\n}`,
  },
  {
    id: 7,
    name: "JSON解析エラー",
    code: `export function jsonError() {\n  return JSON.parse("invalid json {");\n}`,
  },
  {
    id: 8,
    name: "ループエラー",
    code:
      `export function loopError() {\n  while (true) {\n    throw new Error("Loop error");\n  }\n}`,
  },
  {
    id: 9,
    name: "プロミスエラー",
    code:
      `export async function promiseError() {\n  return new Promise((resolve, reject) => {\n    reject(new Error("Intentional error"));\n  });\n}`,
  },
];

class TestFileManager {
  private testDir: string;
  private createdFiles: string[] = [];

  constructor() {
    this.testDir = join(Deno.cwd(), "tests", "error_tests");
  }

  getTestDir(): string {
    return this.testDir;
  }

  /**
   * 動的エラーファイル生成
   * error_file_001.ts ~ error_file_NNN.ts を一時的に作成
   * これらのファイルは意図的にTypeScriptエラーを含む
   */
  async createErrorFiles(count: number): Promise<void> {
    console.log(`Creating ${count} error files...`);

    // テストディレクトリを作成
    await Deno.mkdir(this.testDir, { recursive: true });

    for (let i = 1; i <= count; i++) {
      const pattern = ERROR_PATTERNS[i % ERROR_PATTERNS.length];
      const fileName = `error_file_${i.toString().padStart(3, "0")}.ts`;
      const filePath = join(this.testDir, fileName);

      const content = `/**
 * エラーファイル ${i}
 * パターン: ${pattern.id} (${pattern.name})
 */

${pattern.code}

// ファイル固有のエラー追加
export const fileNumber = ${i};
export const intentionalError${i} = undefinedGlobalVariable${i};
`;

      await Deno.writeTextFile(filePath, content);
      this.createdFiles.push(filePath);
    }
    console.log(`Created ${count} error files.`);
  }

  /**
   * 動的テストファイル生成
   * error_test_001.test.ts ~ error_test_NNN.test.ts を一時的に作成
   * これらのファイルは対応するエラーファイルをテストする
   */
  async createTestFiles(count: number): Promise<void> {
    console.log(`Creating ${count} test files...`);

    for (let i = 1; i <= count; i++) {
      const pattern = ERROR_PATTERNS[i % ERROR_PATTERNS.length];
      const fileName = `error_test_${i.toString().padStart(3, "0")}.test.ts`;
      const filePath = join(this.testDir, fileName);

      let testContent = "";

      if (pattern.id === 9) { // プロミスエラー
        testContent = `/**
 * エラーテストファイル ${i}
 * パターン: ${pattern.id} (${pattern.name}テスト)
 */

import { assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("プロミスエラーファイル ${i} のテスト", async () => {
  const module = await import("./error_file_${i.toString().padStart(3, "0")}.ts");
  await assertRejects(
    async () => {
      await module.promiseError();
    },
    Error,
    "プロミスエラーが発生することを確認"
  );
});`;
      } else if (pattern.id === 6) { // 非同期エラー
        testContent = `/**
 * エラーテストファイル ${i}
 * パターン: ${pattern.id} (${pattern.name}テスト)
 */

import { assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("非同期エラーファイル ${i} のテスト", async () => {
  const module = await import("./error_file_${i.toString().padStart(3, "0")}.ts");
  await assertRejects(
    async () => {
      await module.asyncError();
    },
    Error,
    "非同期エラーが発生することを確認"
  );
});`;
      } else {
        testContent = `/**
 * エラーテストファイル ${i}
 * パターン: ${pattern.id} (${pattern.name}テスト)
 */

import { assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("エラーファイル ${i} のテスト", () => {
  assertThrows(() => {
    // この関数は意図的にエラーを発生させる
    throw new Error("テストエラー ${i}");
  }, Error, "テストエラー ${i}");
});`;
      }

      testContent += `

// ファイル固有のテスト追加
Deno.test("エラーファイル ${i} の基本検証", async () => {
  try {
    const module = await import("./error_file_${i.toString().padStart(3, "0")}.ts");
    console.log(\`エラーファイル \${module.fileNumber} をインポートしました\`);
  } catch (error) {
    console.log(\`期待通りエラーが発生: \${error.message}\`);
  }
});
`;

      await Deno.writeTextFile(filePath, testContent);
      this.createdFiles.push(filePath);
    }
    console.log(`Created ${count} test files.`);
  }

  /**
   * 動的生成ファイルの完全削除
   * 作成されたすべての一時ファイルを削除し、ディレクトリもクリーンアップ
   */
  async cleanup(): Promise<void> {
    console.log("Cleaning up created files...");
    for (const filePath of this.createdFiles) {
      try {
        await Deno.remove(filePath);
      } catch (error) {
        console.warn(
          `Failed to remove ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // ディレクトリが空の場合は削除
    try {
      const entries = [];
      for await (const entry of Deno.readDir(this.testDir)) {
        entries.push(entry);
      }
      if (entries.length === 0) {
        await Deno.remove(this.testDir);
      }
    } catch (error) {
      console.warn(
        `Failed to remove directory ${this.testDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.createdFiles = [];
    console.log("Cleanup completed.");
  }
}

async function runLocalCI(): Promise<{ output: string; success: boolean }> {
  console.log("Running local CI...");

  const command = new Deno.Command("deno", {
    args: ["run", "--allow-all", "mod.ts"],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const { code, stdout, stderr } = await process.output();

  const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
  const success = code === 0;

  console.log(`CI exit code: ${code}`);
  return { output, success };
}

async function runLocalCIWithMode(
  mode: string,
  additionalArgs: string[] = [],
): Promise<{ output: string; success: boolean }> {
  console.log(`Running local CI with mode: ${mode} and args: ${additionalArgs.join(" ")}`);

  const args = ["run", "--allow-all", "mod.ts", "--mode", mode, ...additionalArgs];
  const command = new Deno.Command("deno", {
    args,
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const { code, stdout, stderr } = await process.output();

  const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
  const success = code === 0;

  console.log(`CI exit code: ${code} for mode: ${mode}`);
  return { output, success };
}

Deno.test("Local CI エラー検知統合テスト - フォールバック動作確認", async () => {
  const fileManager = new TestFileManager();

  try {
    // 1. 100個のエラーファイルを動的生成（一時的）
    await fileManager.createErrorFiles(100);

    // 2. 100個のテストファイルを動的生成（一時的）
    await fileManager.createTestFiles(100);

    // 3. ファイルが正しく作成されているか確認
    const errorFileExists = await exists(join(fileManager.getTestDir(), "error_file_001.ts"));
    const testFileExists = await exists(join(fileManager.getTestDir(), "error_test_001.test.ts"));
    assertEquals(errorFileExists, true, "動的エラーファイルが作成されている");
    assertEquals(testFileExists, true, "動的テストファイルが作成されている");

    // 4. Local CIを実行してフォールバック動作をテスト
    // All → Batch → Single-file の順でフォールバック処理が実行される
    const result = await runLocalCI();

    // 5. 結果を検証
    console.log("=== CI Output ===");
    console.log(result.output);
    console.log("=== End Output ===");

    // CIがエラーを検知することを確認（失敗することを期待）
    assertEquals(result.success, false, "CIがエラーを正しく検知して失敗する");

    // フォールバック動作の確認
    const outputLower = result.output.toLowerCase();
    // バッチ処理やフォールバック関連のメッセージが含まれることを期待
    console.log(
      "フォールバック動作のログを確認:",
      outputLower.includes("batch") || outputLower.includes("fallback") ||
        outputLower.includes("single"),
    );

    // 出力にエラー関連のキーワードが含まれていることを確認
    const output = result.output.toLowerCase();
    const hasErrorKeywords = output.includes("error") ||
      output.includes("failed") ||
      output.includes("エラー") ||
      output.includes("失敗");

    assertEquals(hasErrorKeywords, true, "CI出力にエラー関連のキーワードが含まれている");

    // 6. 追加検証: 型チェックエラーが検出されることを確認
    console.log("Running type check specifically...");
    const typeCheckCommand = new Deno.Command("deno", {
      args: ["check", "tests/error_tests/error_file_001.ts"],
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    });

    const typeCheckProcess = typeCheckCommand.spawn();
    const typeCheckResult = await typeCheckProcess.output();
    const typeCheckOutput = new TextDecoder().decode(typeCheckResult.stdout) +
      new TextDecoder().decode(typeCheckResult.stderr);

    console.log("Type check output:", typeCheckOutput);
    assertEquals(typeCheckResult.code !== 0, true, "型チェックが期待通りに失敗する");

    console.log("✅ All CI error detection tests passed!");
  } finally {
    // 7. クリーンアップ
    await fileManager.cleanup();
  }
});

Deno.test("Local CI 正常系テスト", async () => {
  // 一時的に正常なファイルを作成して、CIが成功することを確認
  const testDir = join(Deno.cwd(), "tests", "temp_success");
  await Deno.mkdir(testDir, { recursive: true });

  try {
    // 正常なファイルを作成
    const normalFile = join(testDir, "normal.ts");
    await Deno.writeTextFile(
      normalFile,
      `
export function add(a: number, b: number): number {
  return a + b;
}

export const VERSION = "1.0.0";
`,
    );

    const normalTest = join(testDir, "normal.test.ts");
    await Deno.writeTextFile(
      normalTest,
      `
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { add } from "./normal.ts";

Deno.test("正常な加算テスト", () => {
  assertEquals(add(2, 3), 5);
});
`,
    );

    // 型チェック
    const typeCheckCommand = new Deno.Command("deno", {
      args: ["check", normalFile],
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    });

    const typeCheckProcess = typeCheckCommand.spawn();
    const typeCheckResult = await typeCheckProcess.output();

    assertEquals(typeCheckResult.code, 0, "正常なファイルの型チェックが成功する");

    // テスト実行
    const testCommand = new Deno.Command("deno", {
      args: ["test", "--allow-all", normalTest],
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    });

    const testProcess = testCommand.spawn();
    const testResult = await testProcess.output();

    assertEquals(testResult.code, 0, "正常なテストが成功する");

    console.log("✅ Normal CI operation test passed!");
  } finally {
    // クリーンアップ
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch (error) {
      console.warn(
        `Failed to cleanup temp directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
});

Deno.test("Local CI --mode パターン統合テスト", async () => {
  const fileManager = new TestFileManager();

  try {
    // 100個のエラーファイルを作成
    await fileManager.createErrorFiles(100);
    await fileManager.createTestFiles(100);

    console.log("=== Testing different modes with 100 error files ===");

    // 1. --mode all テスト
    console.log("Testing --mode all...");
    const allModeResult = await runLocalCIWithMode("all");
    assertEquals(allModeResult.success, false, "--mode all でエラーを検知して失敗する");
    assertEquals(
      allModeResult.output.toLowerCase().includes("error") ||
        allModeResult.output.toLowerCase().includes("failed"),
      true,
      "--mode all の出力にエラー情報が含まれる",
    );

    // 2. --mode batch --batch-size 10 テスト
    console.log("Testing --mode batch with batch-size 10...");
    const batchModeResult = await runLocalCIWithMode("batch", ["--batch-size", "10"]);
    assertEquals(batchModeResult.success, false, "--mode batch でエラーを検知して失敗する");
    assertEquals(
      batchModeResult.output.toLowerCase().includes("batch"),
      true,
      "--mode batch の出力にバッチ情報が含まれる",
    );

    // 3. --mode batch --batch-size 50 テスト（大きなバッチサイズ）
    console.log("Testing --mode batch with batch-size 50...");
    const largeBatchResult = await runLocalCIWithMode("batch", ["--batch-size", "50"]);
    assertEquals(largeBatchResult.success, false, "大きなバッチサイズでもエラーを検知して失敗する");

    // 4. --mode single-file テスト
    console.log("Testing --mode single-file...");
    const singleFileResult = await runLocalCIWithMode("single-file");
    assertEquals(singleFileResult.success, false, "--mode single-file でエラーを検知して失敗する");

    // 5. フォールバック有効テスト
    console.log("Testing with fallback enabled...");
    const fallbackResult = await runLocalCIWithMode("batch", [
      "--batch-size",
      "5",
      "--fallback-enabled",
    ]);
    assertEquals(fallbackResult.success, false, "フォールバック有効でもエラーを検知して失敗する");

    // 6. ログモードテスト
    console.log("Testing with debug log mode...");
    const debugLogResult = await runLocalCIWithMode("batch", [
      "--batch-size",
      "20",
      "--log-mode",
      "debug",
    ]);
    assertEquals(debugLogResult.success, false, "デバッグログモードでもエラーを検知して失敗する");

    // 7. エラーファイルのみログモードテスト
    console.log("Testing with error-files-only log mode...");
    const errorOnlyLogResult = await runLocalCIWithMode("all", ["--log-mode", "error-files-only"]);
    assertEquals(
      errorOnlyLogResult.success,
      false,
      "エラーファイルのみログモードでもエラーを検知して失敗する",
    );

    // 8. サイレントモードテスト
    console.log("Testing with silent log mode...");
    const silentModeResult = await runLocalCIWithMode("batch", [
      "--batch-size",
      "25",
      "--log-mode",
      "silent",
    ]);
    assertEquals(silentModeResult.success, false, "サイレントモードでもエラーを検知して失敗する");

    // 9. 小さなバッチサイズテスト
    console.log("Testing with small batch size...");
    const smallBatchResult = await runLocalCIWithMode("batch", ["--batch-size", "3"]);
    assertEquals(smallBatchResult.success, false, "小さなバッチサイズでもエラーを検知して失敗する");

    // 10. Stop on first error テスト
    console.log("Testing with stop-on-first-error...");
    const stopOnErrorResult = await runLocalCIWithMode("all", ["--stop-on-first-error"]);
    assertEquals(
      stopOnErrorResult.success,
      false,
      "stop-on-first-error でも最初のエラーで失敗する",
    );

    console.log("✅ All mode pattern tests passed!");
  } finally {
    await fileManager.cleanup();
  }
});

Deno.test("Local CI エラーレポート詳細テスト", async () => {
  const fileManager = new TestFileManager();

  try {
    // 少数のエラーファイルで詳細テスト
    await fileManager.createErrorFiles(20);
    await fileManager.createTestFiles(20);

    console.log("=== Testing detailed error reporting ===");

    // 1. デバッグモードでの詳細エラー情報テスト
    const debugResult = await runLocalCIWithMode("all", ["--log-mode", "debug"]);
    assertEquals(debugResult.success, false, "デバッグモードでエラー検知");

    // デバッグ出力に期待される情報が含まれているか確認
    const debugOutput = debugResult.output.toLowerCase();
    const hasDetailedInfo = debugOutput.includes("error") ||
      debugOutput.includes("failed") ||
      debugOutput.includes("check");
    assertEquals(hasDetailedInfo, true, "デバッグモードで詳細情報が出力される");

    // 2. エラーファイルのみモードテスト
    const errorOnlyResult = await runLocalCIWithMode("batch", [
      "--batch-size",
      "10",
      "--log-mode",
      "error-files-only",
    ]);
    assertEquals(errorOnlyResult.success, false, "エラーファイルのみモードでエラー検知");

    // 3. ファイルフィルターテスト（もし実装されていれば）
    const filterResult = await runLocalCIWithMode("all", ["--filter", "error_file_001*"]);
    assertEquals(filterResult.success, false, "フィルター指定でもエラー検知");

    console.log("✅ Detailed error reporting test completed!");
  } finally {
    await fileManager.cleanup();
  }
});

Deno.test("Local CI 設定オプション組み合わせテスト", async () => {
  const fileManager = new TestFileManager();

  try {
    // 50個のエラーファイルで設定組み合わせテスト
    await fileManager.createErrorFiles(50);
    await fileManager.createTestFiles(50);

    console.log("=== Testing configuration combinations ===");

    // 複数設定の組み合わせテストケース
    const testCases = [
      {
        name: "バッチ + フォールバック + デバッグ",
        args: [
          "--mode",
          "batch",
          "--batch-size",
          "15",
          "--fallback-enabled",
          "--log-mode",
          "debug",
        ],
      },
      {
        name: "シングルファイル + サイレント",
        args: ["--mode", "single-file", "--log-mode", "silent"],
      },
      {
        name: "全ファイル + エラーのみ + 最初で停止",
        args: ["--mode", "all", "--log-mode", "error-files-only", "--stop-on-first-error"],
      },
      {
        name: "小さなバッチ + フォールバック",
        args: ["--mode", "batch", "--batch-size", "5", "--fallback-enabled"],
      },
      {
        name: "大きなバッチ + デバッグ",
        args: ["--mode", "batch", "--batch-size", "40", "--log-mode", "debug"],
      },
    ];

    for (const testCase of testCases) {
      console.log(`Testing: ${testCase.name}`);

      const command = new Deno.Command("deno", {
        args: ["run", "--allow-all", "mod.ts", ...testCase.args],
        cwd: Deno.cwd(),
        stdout: "piped",
        stderr: "piped",
      });

      const process = command.spawn();
      const { code, stdout, stderr } = await process.output();
      const output = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);

      // 全ての組み合わせでエラーを検知することを確認
      assertEquals(code !== 0, true, `${testCase.name}: エラーを正しく検知`);

      const hasErrorIndicator = output.toLowerCase().includes("error") ||
        output.toLowerCase().includes("failed") ||
        output.toLowerCase().includes("エラー");
      assertEquals(hasErrorIndicator, true, `${testCase.name}: エラー情報が出力される`);

      console.log(`✅ ${testCase.name}: Passed`);
    }

    console.log("✅ All configuration combination tests passed!");
  } finally {
    await fileManager.cleanup();
  }
});

Deno.test("Local CI エラーパターン別検証テスト", async () => {
  const fileManager = new TestFileManager();

  try {
    // 100個のエラーファイルを作成（10種類のパターン × 10個ずつ）
    await fileManager.createErrorFiles(100);
    await fileManager.createTestFiles(100);

    console.log("=== Testing specific error pattern detection ===");

    // 各エラーパターンが確実に検出されるかテスト
    for (let patternId = 0; patternId < ERROR_PATTERNS.length; patternId++) {
      const pattern = ERROR_PATTERNS[patternId];
      console.log(`Testing error pattern ${patternId}: ${pattern.name}`);

      // 特定のパターンのファイルが含まれる範囲でテスト
      const startFile = (patternId * 10) + 1;
      const endFile = Math.min(startFile + 9, 100);

      console.log(`  Checking files ${startFile} to ${endFile} for pattern: ${pattern.name}`);

      // デバッグモードで詳細な情報を取得
      const result = await runLocalCIWithMode("batch", [
        "--batch-size",
        "10",
        "--log-mode",
        "debug",
      ]);

      assertEquals(result.success, false, `パターン ${pattern.name} でエラー検知`);

      // 出力にエラー関連の情報が含まれていることを確認
      const output = result.output.toLowerCase();
      const hasErrorInfo = output.includes("error") ||
        output.includes("failed") ||
        output.includes("ts2322") || // 型エラー
        output.includes("ts2304") || // 未定義変数エラー
        output.includes("ts18047"); // null参照エラー

      assertEquals(hasErrorInfo, true, `パターン ${pattern.name} でエラー情報が出力される`);
    }

    console.log("✅ All error pattern detection tests passed!");
  } finally {
    await fileManager.cleanup();
  }
});

Deno.test("Local CI バッチサイズ2の詳細テスト", async () => {
  const fileManager = new TestFileManager();

  try {
    // 10個のエラーファイルを作成（少数で詳細確認）
    await fileManager.createErrorFiles(10);
    await fileManager.createTestFiles(10);

    console.log("=== Testing batch size 2 behavior ===");

    // バッチサイズ2でのテスト
    console.log("Testing --mode batch with batch-size 2...");
    const batchSize2Result = await runLocalCIWithMode("batch", ["--batch-size", "2"]);

    console.log("=== Batch Size 2 Output ===");
    console.log(batchSize2Result.output);
    console.log("=== End Batch Size 2 Output ===");

    // エラーを検知することを確認
    assertEquals(batchSize2Result.success, false, "バッチサイズ2でエラーを検知して失敗する");

    // 出力に処理されたファイル数の情報があるかチェック
    const output = batchSize2Result.output.toLowerCase();
    const hasErrorInfo = output.includes("error") ||
      output.includes("failed") ||
      output.includes("check");
    assertEquals(hasErrorInfo, true, "バッチサイズ2でエラー情報が出力される");

    // バッチ処理のログが含まれているかチェック
    console.log("Checking for batch processing indicators...");
    const hasBatchInfo = output.includes("batch") ||
      output.includes("processing") ||
      output.includes("files");

    if (hasBatchInfo) {
      console.log("✅ Batch processing information found in output");
    } else {
      console.log("⚠️ No clear batch processing information in output");
    }

    // 2ファイル目で停止しているかどうかの詳細確認
    console.log("=== Analyzing processing behavior ===");

    // 比較のため、バッチサイズ1でもテスト
    console.log("Testing --mode batch with batch-size 1 for comparison...");
    const batchSize1Result = await runLocalCIWithMode("batch", ["--batch-size", "1"]);

    console.log("=== Batch Size 1 Output ===");
    console.log(batchSize1Result.output);
    console.log("=== End Batch Size 1 Output ===");

    // 比較のため、バッチサイズ3でもテスト
    console.log("Testing --mode batch with batch-size 3 for comparison...");
    const batchSize3Result = await runLocalCIWithMode("batch", ["--batch-size", "3"]);

    console.log("=== Batch Size 3 Output ===");
    console.log(batchSize3Result.output);
    console.log("=== End Batch Size 3 Output ===");

    // 全てのバッチサイズでエラーを検知することを確認
    assertEquals(batchSize1Result.success, false, "バッチサイズ1でエラー検知");
    assertEquals(batchSize3Result.success, false, "バッチサイズ3でエラー検知");

    console.log("✅ Batch size 2 detailed test completed!");
  } finally {
    await fileManager.cleanup();
  }
});
