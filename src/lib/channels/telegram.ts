import type { Channel } from "@/generated/prisma/client";
import { decryptJson } from "@/lib/crypto";
import { sendMedia, sendMessage, sendTypingAction, type TelegramCredentials } from "@/lib/telegram/client";
import { ChannelSendError, type ChannelAdapter } from "./types";

export type { TelegramCredentials } from "@/lib/telegram/client";

export function telegramCredentials(channel: Pick<Channel, "credentialsEncrypted">): TelegramCredentials {
  if (!channel.credentialsEncrypted) {
    throw new ChannelSendError("У канала Telegram не заданы секреты — подключение не завершено");
  }
  return decryptJson<TelegramCredentials>(channel.credentialsEncrypted);
}

export const telegramAdapter: ChannelAdapter = {
  async sendText({ channel, to, text }) {
    const { botToken } = telegramCredentials(channel);
    const { messageId } = await sendMessage(botToken, to, text);
    return { externalMessageId: messageId };
  },

  async sendMedia({ channel, to, file, caption, voice }) {
    const { botToken } = telegramCredentials(channel);
    const { messageId } = await sendMedia(botToken, to, file, caption, voice);
    return { externalMessageId: messageId };
  },

  async sendTyping({ channel, to }) {
    await sendTypingAction(telegramCredentials(channel).botToken, to);
  },
};
