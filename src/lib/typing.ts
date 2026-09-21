import type { Channel } from "@/generated/prisma/client";
import { sendChannelTyping } from "@/lib/channels";

/** Столько «печатает» держится у клиента в Telegram; обновляем чуть чаще. */
const TELEGRAM_REFRESH_MS = 4000;
/** Быстрее секунды ответ выглядит как машинный, дольше пяти — как зависший. */
const MIN_TYPING_MS = 1000;
const MAX_TYPING_MS = 5000;
const MS_PER_CHAR = 30;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Сколько «печатать» ответ такой длины с момента, когда показали «печатает…». */
export function humanTypingMs(text: string): number {
  return Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, text.length * MS_PER_CHAR));
}

/**
 * Показывает клиенту «печатает…» и обновляет его, пока не вызван stop().
 * Сбой индикатора ответ бота не задерживает и не ломает.
 * У WhatsApp индикатор держится до 25 секунд сам, обновлять его не нужно.
 */
export function startTyping(input: {
  channel: Channel;
  to: string;
  inboundMessageId: string | null;
}): { stop: () => void; startedAt: number } {
  const startedAt = Date.now();
  void sendChannelTyping(input);

  const timer =
    input.channel.type === "TELEGRAM" ? setInterval(() => void sendChannelTyping(input), TELEGRAM_REFRESH_MS) : null;

  return { startedAt, stop: () => timer && clearInterval(timer) };
}
