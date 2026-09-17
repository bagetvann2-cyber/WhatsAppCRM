import { env } from "@/lib/env";
import { messageEvents } from "@/lib/events";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import { notifyConversationUpdate } from "@/lib/notify";
import { enqueueProcessMessage } from "@/lib/queue";
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

    // Вложение, отписка, автоответ и ИИ-бот могут дёргать внешние API
    // (WhatsApp, Claude) — это не должно задерживать ответ Meta на вебхук,
    // поэтому обработка уходит воркеру через очередь (src/lib/inbound-pipeline.ts).
    await enqueueProcessMessage({
      messageId: result.messageId,
      conversationId: result.conversationId,
      organizationId: result.organizationId,
      channelId: result.channelId,
      to: message.from,
      text: message.text,
      hasMedia: Boolean(message.media),
    });
  }

  for (const status of statuses) {
    await applyStatusUpdate(status);
  }

  if (statuses.length > 0) {
    await notifyConversationUpdate(null);
  }

  return new Response("OK", { status: 200 });
}
