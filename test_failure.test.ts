// 失敗するテストファイル
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("failing test", () => {
  assertEquals(1, 2, "This should fail with detailed output");
});

Deno.test("another failing test", () => {
  assertEquals("hello", "world", "This should also fail");
});
