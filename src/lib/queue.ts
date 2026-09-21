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
/** Ответ ИИ-помощника — отдельное задание с задержкой: клиент часто пишет фразу в несколько сообщений. */
export const QUEUE_RUN_BOT = "run-bot";
/** Сколько ждать тишины от клиента, прежде чем бот ответит на всю серию сообщений. */
export const BOT_DEBOUNCE_SECONDS = 6;

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
        await boss.createQueue(QUEUE_RUN_BOT);
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

/** Ставит ответ бота на это сообщение с задержкой. Каждое новое сообщение клиента ставит своё
 * задание: при запуске устаревшие пропускаются (см. runBotForMessage), отвечает последнее. */
export async function enqueueRunBot(job: ProcessMessageJob, delaySeconds = BOT_DEBOUNCE_SECONDS): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE_RUN_BOT, job, {
    singletonKey: `bot:${job.messageId}`,
    startAfter: delaySeconds,
    group: { id: job.conversationId },
  });
}

export async function workRunBot(handler: (job: ProcessMessageJob) => Promise<void>): Promise<void> {
  const boss = await getBoss();
  await boss.work<ProcessMessageJob>(
    QUEUE_RUN_BOT,
    { localConcurrency: 5, localGroupConcurrency: 1 },
    async ([job]) => {
      await handler(job.data);
    },
  );
}
