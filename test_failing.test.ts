// 意図的にテストを失敗させるファイル
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("simple failing test", () => {
  assertEquals(1 + 1, 3, "This should fail");
});

Deno.test("another failing test", () => {
  assertEquals("hello", "world", "This should also fail");
});
