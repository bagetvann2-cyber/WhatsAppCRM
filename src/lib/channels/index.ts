import type { Channel } from "@/generated/prisma/client";
import type { ChannelAdapter } from "./types";
import { whatsAppAdapter } from "./whatsapp";
import { telegramAdapter } from "./telegram";
import { simulatorAdapter } from "./simulator";

export { ChannelSendError } from "./types";
export type { ChannelAdapter, ChannelSendResult } from "./types";

/**
 * Адаптер по типу канала. Telegram Business отправляет иначе, чем свой бот
 * (через business_connection_id) — появится отдельным случаем, когда до
 * него дойдёт очередь; пока в базе такие каналы не создаются.
 */
export function adapterFor(channel: Pick<Channel, "type">): ChannelAdapter {
  switch (channel.type) {
    case "WHATSAPP":
      return whatsAppAdapter;
    case "TELEGRAM":
      return telegramAdapter;
    case "SIMULATOR":
      return simulatorAdapter;
    default:
      throw new Error(`Неизвестный тип канала: ${channel.type}`);
  }
}

export async function sendChannelText(input: { channel: Channel; to: string; text: string }) {
  return adapterFor(input.channel).sendText(input);
}

/** «Печатает…» — приятная мелочь, а не часть доставки: любая ошибка глотается. */
export async function sendChannelTyping(input: {
  channel: Channel;
  to: string;
  inboundMessageId: string | null;
}): Promise<void> {
  try {
    await adapterFor(input.channel).sendTyping?.(input);
  } catch {
    // Нет индикатора — ответ всё равно уйдёт.
  }
}
