import { prisma } from "@/lib/db";
import { sendChannelText } from "@/lib/channels";
import { runAiBot } from "@/lib/ai-bot-store";
import { runAutomation } from "@/lib/automation-store";
import { ensureMediaFile } from "@/lib/media-store";
import { notifyConversationUpdate } from "@/lib/notify";
import type { ProcessMessageJob } from "@/lib/queue";
import { handleUnsubscribeMessage, UNSUBSCRIBE_CONFIRMATION } from "@/lib/unsubscribe";

/**
 * Всё, что вебхук раньше делал синхронно после сохранения входящего
 * сообщения: докачка вложения, отписка, автоответ, ИИ-бот. Вызывается
 * воркером pg-boss (scripts/worker.ts) — не самим вебхуком, чтобы ответ Meta
 * не ждал внешние вызовы (WhatsApp API, Claude).
 */
export async function processInboundMessage(job: ProcessMessageJob): Promise<void> {
  // Копию файла забираем сразу: у Meta он живёт 30 дней, а переписка дольше.
  // Не получилось — не беда, вложение докачается при первом открытии.
  if (job.hasMedia) {
    await ensureMediaFile(job.messageId);
    await notifyConversationUpdate(job.conversationId);
  }

  // Отписка идёт первой и глушит остальных: на «стоп» клиент должен
  // получить один понятный ответ, а не приветствие с рекламой следом.
  const unsubscribed = await handleUnsubscribeMessage({
    organizationId: job.organizationId,
    conversationId: job.conversationId,
    text: job.text,
  });

  if (unsubscribed) {
    try {
      const channel = await prisma.channel.findUniqueOrThrow({ where: { id: job.channelId } });
      const { externalMessageId } = await sendChannelText({
        channel,
        to: job.to,
        text: UNSUBSCRIBE_CONFIRMATION,
      });
      await prisma.message.create({
        data: {
          externalMessageId,
          channelId: job.channelId,
          conversationId: job.conversationId,
          direction: "OUTBOUND",
          type: "text",
          text: UNSUBSCRIBE_CONFIRMATION,
          status: "sent",
          timestamp: new Date(),
        },
      });
    } catch {
      // Подтверждение не ушло — сама отписка уже сохранена, это главное.
    }

    await notifyConversationUpdate(job.conversationId);
    return;
  }

  // Сначала автоответы: приветствие и «мы не работаем» — простые и предсказуемые.
  // ИИ-помощник подключается только если они промолчали, иначе клиент
  // получит два ответа подряд на одно сообщение.
  const reply = await runAutomation({
    organizationId: job.organizationId,
    conversationId: job.conversationId,
    to: job.to,
  });

  if (reply) {
    await notifyConversationUpdate(job.conversationId);
    return;
  }

  const bot = await runAiBot({
    organizationId: job.organizationId,
    conversationId: job.conversationId,
    to: job.to,
  });

  if (bot.status === "answered" || bot.status === "handoff") {
    await notifyConversationUpdate(job.conversationId);
  }
}
