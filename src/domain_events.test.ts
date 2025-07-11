/**
 * # Domain Events Test
 *
 * ドメインイベントとイベントバスの機能テスト
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { type CIDomainEvent, CIEventBus, ExecutionIdFactory } from "../src/domain_events.ts";
import { TimestampFactory } from "../src/compressed_theorem_types.ts";

Deno.test("ExecutionIdFactory - generate valid UUID", () => {
  const id = ExecutionIdFactory.generate();
  assertExists(id);
  assertEquals(typeof id, "string");

  // UUID v4 format check
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assertEquals(uuidPattern.test(id), true);
});

Deno.test("ExecutionIdFactory - fromString validation", () => {
  // Valid UUID
  const validUuid = "123e4567-e89b-42d3-a456-426614174000";
  const validResult = ExecutionIdFactory.fromString(validUuid);
  assertEquals(validResult.ok, true);

  // Invalid UUID
  const invalidUuid = "invalid-uuid";
  const invalidResult = ExecutionIdFactory.fromString(invalidUuid);
  assertEquals(invalidResult.ok, false);
  if (!invalidResult.ok) {
    assertEquals(invalidResult.error.kind, "PatternMismatch");
  }
});

Deno.test("CIEventBus - basic event subscription and publishing", async () => {
  const eventBus = new CIEventBus();
  let eventReceived = false;

  // Subscribe to StageStarted events
  eventBus.subscribe(
    "StageStarted",
    (_event) => {
      eventReceived = true;
    },
    "test-handler",
    "test-context",
  );

  // Publish an event
  const testEvent: CIDomainEvent = {
    kind: "StageStarted",
    stage: "test-execution",
    timestamp: TimestampFactory.now(),
    executionId: ExecutionIdFactory.generate(),
  };

  await eventBus.publish(testEvent);

  // Verify event was received
  assertEquals(eventReceived, true);
});

Deno.test("CIEventBus - multiple handlers for same event", async () => {
  const eventBus = new CIEventBus();
  const receivedEvents: CIDomainEvent[] = [];

  // Subscribe multiple handlers
  eventBus.subscribe(
    "StageCompleted",
    (event) => {
      receivedEvents.push(event);
    },
    "handler-1",
    "context-1",
  );

  eventBus.subscribe(
    "StageCompleted",
    (event) => {
      receivedEvents.push(event);
    },
    "handler-2",
    "context-2",
  );

  // Publish event
  const testEvent: CIDomainEvent = {
    kind: "StageCompleted",
    stage: "type-check",
    result: {
      kind: "success",
      stage: { kind: "type-check", files: [], optimized: true, hierarchy: null },
      duration: 1000,
    },
    timestamp: TimestampFactory.now(),
    executionId: ExecutionIdFactory.generate(),
    duration: 1000,
  };

  await eventBus.publish(testEvent);

  // Both handlers should have received the event
  assertEquals(receivedEvents.length, 2);
  assertEquals(receivedEvents[0].kind, "StageCompleted");
  assertEquals(receivedEvents[1].kind, "StageCompleted");
});

Deno.test("CIEventBus - boundary guarantee with timeout", async () => {
  const eventBus = new CIEventBus();

  // Register a handler that should succeed within timeout
  eventBus.subscribe(
    "StageFailed",
    async () => {
      // Simulate fast handler (well within timeout)
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
    "fast-handler",
    "test-context",
    50, // 50ms timeout
  );

  const testEvent: CIDomainEvent = {
    kind: "StageFailed",
    stage: "lint-check",
    error: { kind: "LintError", files: ["test.ts"], details: ["error"] },
    timestamp: TimestampFactory.now(),
    executionId: ExecutionIdFactory.generate(),
  };

  const result = await eventBus.publishWithBoundaryGuarantee(testEvent);

  // Should succeed as handler completes within timeout
  assertEquals(result.ok, true);
});

Deno.test("CIEventBus - handler count tracking", () => {
  const eventBus = new CIEventBus();

  assertEquals(eventBus.getHandlerCount(), 0);

  eventBus.subscribe("StageStarted", () => {}, "handler-1", "context-1");
  assertEquals(eventBus.getHandlerCount("StageStarted"), 1);
  assertEquals(eventBus.getHandlerCount(), 1);

  eventBus.subscribe("StageStarted", () => {}, "handler-2", "context-1");
  assertEquals(eventBus.getHandlerCount("StageStarted"), 2);
  assertEquals(eventBus.getHandlerCount(), 2);

  eventBus.subscribe("StageCompleted", () => {}, "handler-3", "context-2");
  assertEquals(eventBus.getHandlerCount("StageCompleted"), 1);
  assertEquals(eventBus.getHandlerCount(), 3);
});

Deno.test("Domain Event type completeness", () => {
  // Test that all required event types are properly typed
  const executionId = ExecutionIdFactory.generate();
  const timestamp = TimestampFactory.now();

  const events: CIDomainEvent[] = [
    {
      kind: "StageStarted",
      stage: "test-execution",
      timestamp,
      executionId,
    },
    {
      kind: "StageCompleted",
      stage: "type-check",
      result: {
        kind: "success",
        stage: { kind: "type-check", files: [], optimized: true, hierarchy: null },
        duration: 1000,
      },
      timestamp,
      executionId,
      duration: 1000,
    },
    {
      kind: "StageFailed",
      stage: "lint-check",
      error: { kind: "LintError", files: [], details: [] },
      timestamp,
      executionId,
    },
    {
      kind: "PipelineStopped",
      reason: { kind: "ConfigurationError", field: "test", value: "test" },
      completedStages: [],
      timestamp,
      executionId,
      totalDuration: 5000,
    },
    {
      kind: "HierarchyTargeted",
      hierarchy: "./src/",
      affectedFiles: ["src/test.ts"],
      timestamp,
      executionId,
    },
  ];

  // Verify all events are properly typed
  events.forEach((event) => {
    assertExists(event.kind);
    assertExists(event.executionId);
    assertExists(event.timestamp);
  });

  assertEquals(events.length, 5);
});
