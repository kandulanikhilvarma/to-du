import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueue, resolvedInQueue, type KeyValue } from "./queue-core.ts";

function memory(): KeyValue {
  const map = new Map<string, string>();
  return {
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    remove: (k) => map.delete(k),
  };
}

test("items sent successfully leave the queue", async () => {
  const q = createQueue(memory());
  q.enqueue("event", { n: 1 });
  const out = await q.flush(async () => true);
  assert.deepEqual(out, { sent: 1, remaining: 0 });
  assert.equal(q.size(), 0);
});

test("failed items stay with an incremented attempt count", async () => {
  const q = createQueue(memory());
  q.enqueue("event", { n: 1 });
  await q.flush(async () => false);
  assert.equal(q.pending()[0]?.attempts, 1);
});

test("an item enqueued during a flush is not lost", async () => {
  const q = createQueue(memory());
  q.enqueue("event", { n: 1 });
  await q.flush(async () => {
    q.enqueue("ping", { n: 2 });
    return true;
  });
  assert.deepEqual(q.pending().map((i) => i.kind), ["ping"]);
});

test("overlapping flushes never send an item twice", async () => {
  const q = createQueue(memory());
  q.enqueue("event", { n: 1 });
  let sends = 0;
  const slow = async () => {
    sends += 1;
    await new Promise((r) => setTimeout(r, 20));
    return true;
  };
  await Promise.all([q.flush(slow), q.flush(slow)]);
  assert.equal(sends, 1);
});

test("a queued resolve marks only its own SOS as already over", () => {
  const q = createQueue(memory());
  q.enqueue("event", { clientId: "a" });
  q.enqueue("resolve", { clientId: "a" });
  q.enqueue("event", { clientId: "b" });
  assert.equal(resolvedInQueue(q.pending(), "a"), true);
  assert.equal(resolvedInQueue(q.pending(), "b"), false);
});

test("a corrupt stored queue is dropped, not thrown", () => {
  const kv = memory();
  kv.set("pending", "{not json");
  const q = createQueue(kv);
  assert.equal(q.size(), 0);
});
