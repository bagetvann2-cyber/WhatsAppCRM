import { env } from "@/lib/env";
import { messageEvents } from "@/lib/events";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import { isValidSignature } from "@/lib/signature";
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

  const { messages, statuses } = parseWebhook(payload);

  for (const message of messages) {
    const { conversationId, created } = await saveIncomingMessage(message);
    if (created) {
      messageEvents.emit("update", { conversationId });
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
