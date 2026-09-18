import { Client } from "pg";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { messageEvents } from "@/lib/events";

/**
 * Мост между процессами: воркер обрабатывает сообщение в отдельном процессе
 * от Next.js-сервера, поэтому его messageEvents.emit туда не долетит. Плечо
 * передачи — Postgres NOTIFY: воркер публикует, сервер (через
 * startMessageEventsListener) слушает и уже сам эмитит в свой messageEvents,
 * который слушают SSE-соединения (src/app/api/stream/route.ts).
 */
const CHANNEL = "message_events";

/** Эмитит локально (для SSE-соединений в этом же процессе) и публикует всем остальным. */
export async function notifyConversationUpdate(conversationId: string | null): Promise<void> {
  messageEvents.emit("update", { conversationId });
  await prisma.$executeRaw`SELECT pg_notify(${CHANNEL}, ${conversationId ?? ""})`;
}

let listenClient: Client | undefined;

/** Поднимает выделенное подключение LISTEN. Вызывать один раз на процесс Next.js-сервера. */
export async function startMessageEventsListener(): Promise<void> {
  if (listenClient) {
    return;
  }

  const client = new Client({ connectionString: env.databaseUrl() });
  listenClient = client;

  client.on("notification", (message) => {
    messageEvents.emit("update", { conversationId: message.payload || null });
  });
  // Обрыв слушающего подключения не должен ронять процесс — переподключение
  // не критично: SSE и так держит keep-alive пинг раз в 25с у клиента.
  client.on("error", (error) => console.error("message_events listener:", error));

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
}
