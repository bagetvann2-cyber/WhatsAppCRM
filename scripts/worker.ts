/**
 * Воркер очереди входящих сообщений: докачка вложений, отписка, автоответ,
 * ИИ-бот — всё, что вебхук раньше делал синхронно (src/lib/inbound-pipeline.ts).
 * Отдельный долгоживущий процесс, поднимается через pm2 вместе с сервером.
 *
 * Запуск:
 *   npm run worker
 */
import { processInboundMessage, runBotForMessage } from "@/lib/inbound-pipeline";
import { workProcessMessage, workRunBot } from "@/lib/queue";

async function main() {
  await workProcessMessage(processInboundMessage);
  await workRunBot(runBotForMessage);
  console.log("worker: слушаю очереди process-message и run-bot");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
