// Store-and-forward queue logic, storage injected so it runs under node tests.
//
// Two invariants the tests pin down:
// - Flushes are serialised. Overlapping callers (reconnect listener plus the
//   SOS path) queue behind each other, so no item is ever sent twice.
// - A flush never writes back a stale snapshot. It re-reads storage at the end
//   and removes only what it sent, so an SOS enqueued mid-flush survives.

export type KeyValue = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => unknown;
};

export type QueuedItem = {
  id: string;
  kind: "event" | "ping" | "resolve" | "relay";
  payload: Record<string, unknown>;
  queuedAt: number;
  attempts: number;
};

export type FlushResult = { sent: number; remaining: number };

const KEY = "pending";

export function createQueue(kv: KeyValue) {
  let chain: Promise<unknown> = Promise.resolve();
  let counter = 0;

  function readAll(): QueuedItem[] {
    const raw = kv.getString(KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as QueuedItem[];
    } catch {
      // A corrupt queue must not brick the SOS path.
      kv.remove(KEY);
      return [];
    }
  }

  function writeAll(items: QueuedItem[]): void {
    kv.set(KEY, JSON.stringify(items));
  }

  function enqueue(kind: QueuedItem["kind"], payload: Record<string, unknown>): QueuedItem {
    counter += 1;
    const item: QueuedItem = {
      id: `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      payload,
      queuedAt: Date.now(),
      attempts: 0,
    };
    writeAll([...readAll(), item]);
    return item;
  }

  async function flushOnce(send: (item: QueuedItem) => Promise<boolean>): Promise<FlushResult> {
    const sent = new Set<string>();
    const failed = new Set<string>();

    for (const item of readAll()) {
      let ok = false;
      try {
        ok = await send(item);
      } catch {
        ok = false;
      }
      (ok ? sent : failed).add(item.id);
    }

    const next = readAll()
      .filter((item) => !sent.has(item.id))
      .map((item) => (failed.has(item.id) ? { ...item, attempts: item.attempts + 1 } : item));
    writeAll(next);
    return { sent: sent.size, remaining: next.length };
  }

  function flush(send: (item: QueuedItem) => Promise<boolean>): Promise<FlushResult> {
    const run = chain.then(() => flushOnce(send));
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    enqueue,
    flush,
    pending: readAll,
    size: () => readAll().length,
  };
}

/** True when a resolve for this SOS is already waiting in the queue: the
 *  person marked safe before the server ever heard of the alert, so it must
 *  reach the server as history, not as a fresh alarm to the circle. */
export function resolvedInQueue(items: QueuedItem[], clientId: string): boolean {
  return items.some((i) => i.kind === "resolve" && i.payload.clientId === clientId);
}

export function backoffMs(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
}
