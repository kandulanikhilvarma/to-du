// The device queue: queue-core logic over MMKV. MMKV writes are synchronous,
// so an SOS is durably recorded before the UI advances, not after an await
// that a dying battery may never resolve.

import { createMMKV } from "react-native-mmkv";
import { createQueue } from "./queue-core";

export type { FlushResult, QueuedItem } from "./queue-core";
export { backoffMs, resolvedInQueue } from "./queue-core";

const queue = createQueue(createMMKV({ id: "todu.queue" }));

export const enqueue = queue.enqueue;
export const flush = queue.flush;
export const pending = queue.pending;
export const size = queue.size;
