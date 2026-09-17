import { ChannelSendError } from "@/lib/channels/types";

export type TelegramCredentials = {
  botToken: string;
  /** Сравнивается с заголовком x-telegram-bot-api-secret-token на вебхуке. */
  webhookSecret: string;
};

/** Telegram режет сообщение длиннее — обрезаем сами, как и для WhatsApp. */
const TEXT_LIMIT = 4096;
/** Клиент ждёт секунды, а не минуты: долгий зависший запрос хуже быстрой ошибки. */
const TIMEOUT_MS = 15_000;

async function api(botToken: string, method: string, body: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChannelSendError("Telegram не ответил за 15 секунд");
    }
    throw new ChannelSendError(error instanceof Error ? error.message : "Не удалось обратиться к Telegram");
  } finally {
    clearTimeout(timer);
  }

  const data = (await response.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) {
    throw new ChannelSendError(data.description ?? `Telegram Bot API вернул ${response.status}`);
  }
  return data.result as Record<string, unknown>;
}

/** Проверяет токен и возвращает личность бота — используется при подключении канала. */
export async function getMe(botToken: string): Promise<{ id: string; username: string | null }> {
  const result = await api(botToken, "getMe", {});
  const id = result.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new ChannelSendError("Telegram не вернул идентификатор бота");
  }
  return { id: String(id), username: typeof result.username === "string" ? result.username : null };
}

/** Отправляет текстовое сообщение. У своего бота Telegram нет ограничения на 24-часовое окно. */
export async function sendMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<{ messageId: string }> {
  const body = text.length > TEXT_LIMIT ? text.slice(0, TEXT_LIMIT) : text;
  const result = await api(botToken, "sendMessage", { chat_id: chatId, text: body });

  const messageId = result.message_id;
  if (typeof messageId !== "number") {
    throw new ChannelSendError("Telegram не вернул идентификатор сообщения");
  }
  return { messageId: String(messageId) };
}

/**
 * Регистрирует вебхук на конкретный URL с секретным токеном — Telegram будет
 * присылать его в заголовке x-telegram-bot-api-secret-token с каждым апдейтом,
 * это и есть проверка подлинности запроса (подписи, как у Meta, у Telegram нет).
 */
export async function setWebhook(botToken: string, url: string, secretToken: string): Promise<void> {
  await api(botToken, "setWebhook", { url, secret_token: secretToken });
}
