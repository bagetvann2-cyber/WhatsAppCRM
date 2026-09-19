import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

/**
 * Очередь фоновой обработки входящих сообщений. Вебхук должен ответить Meta
 * быстро (иначе она посчитает доставку неуспешной и повторит её) — поэтому
 * всё, что может занять время (скачивание вложения, обращение к WhatsApp API,
 * запрос к Claude), уходит воркеру через pg-boss вместо того, чтобы
 * выполняться внутри запроса.
 */
export const QUEUE_PROCESS_MESSAGE = "process-message";

export type ProcessMessageJob = {
  messageId: string;
  conversationId: string;
  organizationId: string;
  channelId: string;
  /** Адресат в терминах канала: номер телефона у WhatsApp, chat_id у Telegram. */
  to: string;
  text: string | null;
  hasMedia: boolean;
};

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossReady?: Promise<PgBoss> };

async function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.boss) {
    globalForBoss.boss = new PgBoss(env.databaseUrl());
    globalForBoss.boss.on("error", (error) => console.error("pg-boss:", error));
  }
  if (!globalForBoss.bossReady) {
    globalForBoss.bossReady = globalForBoss.boss
      .start()
      .then(async (boss) => {
        await boss.createQueue(QUEUE_PROCESS_MESSAGE);
        return boss;
      });
  }
  return globalForBoss.bossReady;
}

/** Ставит сообщение в очередь на обработку. singletonKey защищает от повторной
 * постановки того же сообщения в очередь при повторной доставке вебхука. */
export async function enqueueProcessMessage(job: ProcessMessageJob): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE_PROCESS_MESSAGE, job, {
    singletonKey: job.messageId,
    group: { id: job.conversationId },
  });
}

/** Подписывает воркер на очередь. Резолвится сразу после подписки — обработка идёт в фоне.
 * Разные диалоги идут параллельно (до 5), сообщения одного диалога — строго по одному,
 * иначе два ответа бота на подряд идущие сообщения клиента перепутаются. */
export async function workProcessMessage(
  handler: (job: ProcessMessageJob) => Promise<void>,
): Promise<void> {
  const boss = await getBoss();
  await boss.work<ProcessMessageJob>(
    QUEUE_PROCESS_MESSAGE,
    { localConcurrency: 5, localGroupConcurrency: 1 },
    async ([job]) => {
      await handler(job.data);
    },
  );
}
