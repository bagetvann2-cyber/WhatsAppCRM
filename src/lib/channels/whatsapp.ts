import type { Channel } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { decryptJson } from "@/lib/crypto";
import { sendTextMessage, type WhatsAppCredentials } from "@/lib/whatsapp/client";
import { ChannelSendError, type ChannelAdapter } from "./types";

/**
 * Секреты канала, а если их ещё нет в базе (демо-стенд до переноса) —
 * запасной вариант из env. Только для разработки: в проде у активного
 * канала credentialsEncrypted обязателен.
 */
export function whatsAppCredentials(channel: Pick<Channel, "credentialsEncrypted" | "externalId">): WhatsAppCredentials {
  if (channel.credentialsEncrypted) {
    return decryptJson<WhatsAppCredentials>(channel.credentialsEncrypted);
  }
  return { accessToken: env.token(), phoneNumberId: channel.externalId ?? env.phoneNumberId() };
}

export const whatsAppAdapter: ChannelAdapter = {
  async sendText({ channel, to, text }) {
    if (!channel.externalId) {
      throw new ChannelSendError("У канала WhatsApp не задан номер — подключение не завершено");
    }

    const { wamid } = await sendTextMessage(whatsAppCredentials(channel), to, text);
    return { externalMessageId: wamid };
  },
};
