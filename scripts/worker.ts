/**
 * Воркер очереди входящих сообщений: докачка вложений, отписка, автоответ,
 * ИИ-бот — всё, что вебхук раньше делал синхронно (src/lib/inbound-pipeline.ts).
 * Отдельный долгоживущий процесс, поднимается через pm2 вместе с сервером.
 *
 * Запуск:
 *   npm run worker
 */
import { processInboundMessage, runBotForMessage } from "@/lib/inbound-pipeline";
import { sendBroadcast } from "@/lib/broadcasts";
import { stopQueue, workProcessMessage, workRunBot, workRunBroadcast } from "@/lib/queue";

async function main() {
  await workProcessMessage(processInboundMessage);
  await workRunBot(runBotForMessage);
  await workRunBroadcast((job) => sendBroadcast(job.organizationId, job.broadcastId));
  console.log("worker: слушаю очереди process-message, run-bot и run-broadcast");
}

// pm2 при выкладке шлёт SIGINT: даём pg-boss закрыться, иначе задания остаются «активными»
// и подхватываются заново только по таймауту.
let stopping = false;
async function shutdown() {
  if (stopping) {
    return;
  }
  stopping = true;
  try {
    await stopQueue();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
