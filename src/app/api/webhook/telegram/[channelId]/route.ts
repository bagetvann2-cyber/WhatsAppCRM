import { prisma } from "@/lib/db";
import { telegramCredentials } from "@/lib/channels/telegram";
import { messageEvents } from "@/lib/events";
import { saveIncomingMessage } from "@/lib/ingest";
import { enqueueProcessMessage } from "@/lib/queue";
import { parseTelegramUpdate } from "@/lib/telegram/parse";

/**
 * Вебхук на конкретного Telegram-бота. В отличие от Meta, Telegram не шлёт
 * подпись — секрет из setWebhook сверяется с заголовком
 * x-telegram-bot-api-secret-token (см. src/lib/telegram/client.ts).
 *
 * У свободного бота вложение пока не докачивается: media.ts (скачивание
 * файлов у Meta) на Telegram не портирован — сообщение с вложением
 * сохраняется, но hasMedia в очередь не уходит, чтобы воркер не пытался
 * скачать telegram file_id через WhatsApp API.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/webhook/telegram/[channelId]">,
): Promise<Response> {
  const { channelId } = await context.params;

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.type !== "TELEGRAM" || !channel.externalId) {
    return new Response("Not found", { status: 404 });
  }

  let secret: string;
  try {
    secret = telegramCredentials(channel).webhookSecret;
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return new Response("OK", { status: 200 });
  }

  const message = parseTelegramUpdate(payload, channel.externalId);
  if (!message) {
    return new Response("OK", { status: 200 });
  }

  const result = await saveIncomingMessage(message);
  if (result.stored && result.created) {
    messageEvents.emit("update", { conversationId: result.conversationId });

    await enqueueProcessMessage({
      messageId: result.messageId,
      conversationId: result.conversationId,
      organizationId: result.organizationId,
      channelId: result.channelId,
      to: message.from,
      text: message.text,
      hasMedia: false,
    });
  }

  return new Response("OK", { status: 200 });
}
