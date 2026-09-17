import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  handleUnsubscribeMessage,
  UNSUBSCRIBE_CONFIRMATION,
} from "@/lib/unsubscribe";
import { sendChannelText } from "@/lib/channels";
import { runAiBot } from "@/lib/ai-bot-store";
import { runAutomation } from "@/lib/automation-store";
import { messageEvents } from "@/lib/events";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import { ensureMediaFile } from "@/lib/media-store";
import { isValidSignature } from "@/lib/signature";
import { applyTemplateUpdate } from "@/lib/templates-store";
import { parseWebhook } from "@/lib/whatsapp/parse";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === env.verifyToken() && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), env.appSecret())) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Отвечаем 200: повторять такой запрос бессмысленно.
    return new Response("OK", { status: 200 });
  }

  const { messages, statuses, templates } = parseWebhook(payload);

  for (const template of templates) {
    await applyTemplateUpdate(template);
  }

  for (const message of messages) {
    const result = await saveIncomingMessage(message);
    if (!result.stored || !result.created) {
      continue;
    }

    messageEvents.emit("update", { conversationId: result.conversationId });

    // Копию файла забираем сразу: у Meta он живёт 30 дней, а переписка дольше.
    // Не получилось — не беда, вложение докачается при первом открытии.
    if (message.media) {
      await ensureMediaFile(result.messageId);
      messageEvents.emit("update", { conversationId: result.conversationId });
    }

    // Отписка идёт первой и глушит остальных: на «стоп» клиент должен
    // получить один понятный ответ, а не приветствие с рекламой следом.
    const unsubscribed = await handleUnsubscribeMessage({
      organizationId: result.organizationId,
      conversationId: result.conversationId,
      text: message.text,
    });

    if (unsubscribed) {
      try {
        const channel = await prisma.channel.findUniqueOrThrow({ where: { id: result.channelId } });
        const { externalMessageId } = await sendChannelText({
          channel,
          to: message.from,
          text: UNSUBSCRIBE_CONFIRMATION,
        });
        await prisma.message.create({
          data: {
            externalMessageId,
            channelId: result.channelId,
            conversationId: result.conversationId,
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

      messageEvents.emit("update", { conversationId: result.conversationId });
      continue;
    }

    // Сначала автоответы: приветствие и «мы не работаем» — простые и предсказуемые.
    // ИИ-помощник подключается только если они промолчали, иначе клиент
    // получит два ответа подряд на одно сообщение.
    const reply = await runAutomation({
      organizationId: result.organizationId,
      conversationId: result.conversationId,
      to: message.from,
    });

    if (reply) {
      messageEvents.emit("update", { conversationId: result.conversationId });
      continue;
    }

    const bot = await runAiBot({
      organizationId: result.organizationId,
      conversationId: result.conversationId,
      to: message.from,
    });

    if (bot.status === "answered" || bot.status === "handoff") {
      messageEvents.emit("update", { conversationId: result.conversationId });
    }
  }

  for (const status of statuses) {
    await applyStatusUpdate(status);
  }

  if (statuses.length > 0) {
    messageEvents.emit("update", { conversationId: null });
  }

  return new Response("OK", { status: 200 });
}
