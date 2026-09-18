import type { Channel, Conversation } from "@/generated/prisma/client";

/**
 * Открыто ли окно свободного ответа. У WhatsApp и Telegram Business это
 * 24 часа с последнего сообщения клиента (Conversation.windowExpiresAt
 * считается одинаково для всех каналов при сохранении входящего). Свой бот
 * Telegram и симулятор такого ограничения не знают.
 */
export function isReplyWindowOpen(
  channel: Pick<Channel, "connectionMethod">,
  conversation: Pick<Conversation, "windowExpiresAt">,
): boolean {
  if (channel.connectionMethod === "TG_OWN_BOT" || channel.connectionMethod === "SIMULATOR") {
    return true;
  }

  return conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();
}
