// 成功するテストファイル
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("successful test 1", () => {
  assertEquals(1 + 1, 2);
});

Deno.test("successful test 2", () => {
  assertEquals("hello", "hello");
});
