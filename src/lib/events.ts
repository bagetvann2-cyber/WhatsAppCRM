import { EventEmitter } from "node:events";

const globalForEvents = globalThis as unknown as { messageEvents?: EventEmitter };

/** Шина событий в пределах процесса: вебхук уведомляет открытые SSE-соединения. */
export const messageEvents = globalForEvents.messageEvents ?? new EventEmitter();
messageEvents.setMaxListeners(100);

if (process.env.NODE_ENV !== "production") {
  globalForEvents.messageEvents = messageEvents;
}
