import type { Channel } from "@/generated/prisma/client";
import type { ChannelAdapter } from "./types";
import { whatsAppAdapter } from "./whatsapp";
import { simulatorAdapter } from "./simulator";

export { ChannelSendError } from "./types";
export type { ChannelAdapter, ChannelSendResult } from "./types";

/**
 * Адаптер по типу канала. Telegram появится в отдельном этапе (Business и
 * свой бот отправляют по-разному) — пока такого канала просто нет в базе.
 */
export function adapterFor(channel: Pick<Channel, "type">): ChannelAdapter {
  switch (channel.type) {
    case "WHATSAPP":
      return whatsAppAdapter;
    case "SIMULATOR":
      return simulatorAdapter;
    case "TELEGRAM":
      throw new Error("Адаптер Telegram ещё не реализован");
    default:
      throw new Error(`Неизвестный тип канала: ${channel.type}`);
  }
}

export async function sendChannelText(input: { channel: Channel; to: string; text: string }) {
  return adapterFor(input.channel).sendText(input);
}
