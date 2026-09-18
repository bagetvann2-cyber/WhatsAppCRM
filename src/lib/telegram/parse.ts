import type { ChannelIncomingMessage } from "@/lib/ingest";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Поля с вложением у Telegram — каждое несёт свой file_id, voice — отдельно от остального аудио. */
const MEDIA_FIELDS = ["document", "voice", "video", "audio", "sticker"] as const;

function readMedia(message: Record<string, unknown>): {
  type: string;
  media: ChannelIncomingMessage["media"];
} {
  const photos = message.photo;
  if (Array.isArray(photos) && photos.length > 0) {
    // Telegram присылает все размеры фото — берём последний (самый крупный).
    const largest = asRecord(photos[photos.length - 1]);
    const fileId = asText(largest.file_id);
    if (fileId) {
      return {
        type: "image",
        media: { mediaId: fileId, mimeType: null, filename: null, size: Number(largest.file_size) || null, voice: false },
      };
    }
  }

  for (const field of MEDIA_FIELDS) {
    const payload = asRecord(message[field]);
    const fileId = asText(payload.file_id);
    if (fileId) {
      return {
        type: field === "voice" ? "audio" : field,
        media: {
          mediaId: fileId,
          mimeType: asText(payload.mime_type),
          filename: asText(payload.file_name),
          size: typeof payload.file_size === "number" ? payload.file_size : null,
          voice: field === "voice",
        },
      };
    }
  }

  return { type: "text", media: null };
}

/**
 * Разбирает один Update Telegram Bot API в общую форму входящего сообщения.
 * channelExternalId (id бота) сюда не приходит в самом апдейте — его знает
 * вебхук по URL (src/app/api/webhook/telegram/[channelId]/route.ts) и
 * передаёт отдельным параметром.
 *
 * Только личные сообщения в чат с ботом: группы, каналы и правки сообщений
 * пока не поддерживаем — не нужны для MVP свободного бота-ассистента.
 * Доставка получателю у Telegram Bot API не отслеживается — статусов нет.
 */
export function parseTelegramUpdate(payload: unknown, channelExternalId: string): ChannelIncomingMessage | null {
  const message = asRecord(asRecord(payload).message);
  const messageId = message.message_id;
  const chat = asRecord(message.chat);
  const chatId = chat.id;

  if (typeof messageId !== "number" || (typeof chatId !== "number" && typeof chatId !== "string")) {
    return null;
  }

  const from = asRecord(message.from);
  const nameParts = [asText(from.first_name), asText(from.last_name)].filter(Boolean);
  const { type, media } = readMedia(message);
  const text = asText(message.text) ?? asText(message.caption);

  return {
    channelType: "TELEGRAM",
    channelExternalId,
    externalMessageId: String(messageId),
    from: String(chatId),
    profileName: nameParts.length > 0 ? nameParts.join(" ") : null,
    type,
    text,
    media,
    timestamp: typeof message.date === "number" ? new Date(message.date * 1000) : new Date(),
  };
}
