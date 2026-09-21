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

/** Загрузка файла идёт дольше обычного запроса. */
const UPLOAD_TIMEOUT_MS = 60_000;

async function api(
  botToken: string,
  method: string,
  body: unknown,
  timeoutMs = TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      // Для файла заголовок с границей формы выставляет сам fetch.
      ...(body instanceof FormData ? {} : { headers: { "Content-Type": "application/json" } }),
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChannelSendError(`Telegram не ответил за ${Math.round(timeoutMs / 1000)} секунд`);
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

/** Фото Telegram принимает до 10 МБ, остальное — до 50 МБ. */
const PHOTO_LIMIT = 10 * 1024 * 1024;
/** Caption у медиа Telegram короче обычного текста. */
const CAPTION_LIMIT = 1024;

type MediaMethod = { method: "sendPhoto" | "sendVideo" | "sendAudio" | "sendDocument"; field: string };

/**
 * Каким методом слать файл. Всё, что Telegram не умеет показать как фото, видео или музыку
 * (svg, gif, ogg, большие картинки), уходит документом: так файл дойдёт как есть.
 */
export function mediaMethodFor(mimeType: string, size: number): MediaMethod {
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if ((mime === "image/jpeg" || mime === "image/png") && size <= PHOTO_LIMIT) {
    return { method: "sendPhoto", field: "photo" };
  }
  if (mime === "video/mp4") {
    return { method: "sendVideo", field: "video" };
  }
  if (mime === "audio/mpeg" || mime === "audio/mp4") {
    return { method: "sendAudio", field: "audio" };
  }
  return { method: "sendDocument", field: "document" };
}

/** Отправляет файл (фото, видео, аудио или документ) с подписью. */
export async function sendMedia(
  botToken: string,
  chatId: string,
  file: { bytes: Uint8Array; mimeType: string; filename: string },
  caption: string | null,
): Promise<{ messageId: string }> {
  const { method, field } = mediaMethodFor(file.mimeType, file.bytes.byteLength);

  const form = new FormData();
  form.append("chat_id", chatId);
  // Копия в обычный ArrayBuffer: Blob не принимает буфер, за которым может стоять SharedArrayBuffer.
  form.append(field, new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.filename);
  if (caption) {
    form.append("caption", caption.length > CAPTION_LIMIT ? caption.slice(0, CAPTION_LIMIT) : caption);
  }

  const result = await api(botToken, method, form, UPLOAD_TIMEOUT_MS);
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

/** Показывает в чате «печатает…» (Telegram гасит его сам через 5 секунд или с новым сообщением). */
export async function sendTypingAction(botToken: string, chatId: string): Promise<void> {
  await api(botToken, "sendChatAction", { chat_id: chatId, action: "typing" });
}
