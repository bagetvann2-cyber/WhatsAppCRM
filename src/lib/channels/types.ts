import type { Channel } from "@/generated/prisma/client";

/** Ошибка отправки через канал — текст уже пригоден для показа оператору. */
export class ChannelSendError extends Error {}

export type ChannelSendResult = { externalMessageId: string };

/**
 * Общий интерфейс отправки для WhatsApp, Telegram и симулятора. Окно 24 часов
 * адаптер не проверяет — это делает вызывающий код через isReplyWindowOpen,
 * до того как платить за обращение к API канала.
 */
export interface ChannelAdapter {
  sendText(input: { channel: Channel; to: string; text: string }): Promise<ChannelSendResult>;
  /** Отправка файла. Есть не у каждого канала: у WhatsApp она пока идёт отдельным путём в роуте сообщений. */
  sendMedia?(input: {
    channel: Channel;
    to: string;
    file: { bytes: Uint8Array; mimeType: string; filename: string };
    caption: string | null;
    /** Записанное голосовое: канал покажет его как голосовое, если умеет. */
    voice?: boolean;
  }): Promise<ChannelSendResult>;
  /** Индикатор «печатает…». У канала может не быть — тогда просто не реализуется. */
  sendTyping?(input: { channel: Channel; to: string; inboundMessageId: string | null }): Promise<void>;
}
