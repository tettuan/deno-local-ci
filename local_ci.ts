/**
 * Deno Local CI - Direct Execution Entry Point
 *
 * プロジェクト用のCI実行スクリプト
 * main関数をインポートして実行
 */

import { main } from "./mod.ts";

// 直接実行時にmain関数を呼び出し
if (import.meta.main) {
  await main(Deno.args);
}
