/** Вложение приходит без файла: Meta отдаёт только идентификатор. */
export type IncomingMedia = {
  mediaId: string;
  mimeType: string | null;
  filename: string | null;
  size: number | null;
  voice: boolean;
};

export type IncomingMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  phoneNumberId: string;
  type: string;
  /** Для вложения — подпись к файлу. */
  text: string | null;
  media: IncomingMedia | null;
  timestamp: Date;
};

export type StatusUpdate = {
  wamid: string;
  status: string;
  timestamp: Date;
};

/** Решение модерации Meta по шаблону: приходит отдельным полем вебхука. */
export type TemplateUpdate = {
  metaId: string;
  name: string;
  language: string;
  event: string;
  reason: string | null;
};

export type ParsedWebhook = {
  messages: IncomingMessage[];
  statuses: StatusUpdate[];
  templates: TemplateUpdate[];
};

function toDate(seconds: unknown): Date {
  return new Date(Number(seconds) * 1000);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Типы сообщений с файлом. Стикер — та же картинка, только квадратная. */
const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"] as const;

/**
 * Достаёт вложение: у каждого типа своя вложенная секция с одинаковым набором
 * полей. Подпись лежит там же и попадает в text — это и есть текст сообщения.
 */
function readMedia(message: Record<string, unknown>, type: string) {
  if (!MEDIA_TYPES.includes(type as (typeof MEDIA_TYPES)[number])) {
    return { media: null, caption: null };
  }

  const payload = asRecord(message[type]);
  const mediaId = asText(payload.id);
  if (!mediaId) {
    return { media: null, caption: null };
  }

  const size = Number(payload.file_size);

  return {
    media: {
      mediaId,
      mimeType: asText(payload.mime_type),
      filename: asText(payload.filename),
      size: Number.isFinite(size) && size > 0 ? size : null,
      voice: payload.voice === true,
    },
    caption: asText(payload.caption),
  };
}

/**
 * Превращает вложенный payload Meta в плоские списки.
 * Ничего не бросает: на неизвестной структуре возвращает пустой результат,
 * иначе один странный запрос уронил бы приём всех остальных.
 */
export function parseWebhook(payload: unknown): ParsedWebhook {
  const messages: IncomingMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const templates: TemplateUpdate[] = [];

  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);

      if (asRecord(change).field === "message_template_status_update") {
        templates.push({
          metaId: String(value.message_template_id ?? ""),
          name: String(value.message_template_name ?? ""),
          language: String(value.message_template_language ?? ""),
          event: String(value.event ?? ""),
          reason: typeof value.reason === "string" && value.reason !== "NONE" ? value.reason : null,
        });
        continue;
      }

      const metadata = asRecord(value.metadata);
      const phoneNumberId = String(metadata.phone_number_id ?? "");

      const nameByWaId = new Map<string, string | null>();
      for (const contact of asArray(value.contacts)) {
        const record = asRecord(contact);
        const profile = asRecord(record.profile);
        nameByWaId.set(String(record.wa_id ?? ""), (profile.name as string) ?? null);
      }

      for (const raw of asArray(value.messages)) {
        const message = asRecord(raw);
        const from = String(message.from ?? "");
        const type = String(message.type ?? "unknown");
        const text = asRecord(message.text).body;
        const { media, caption } = readMedia(message, type);

        messages.push({
          wamid: String(message.id ?? ""),
          from,
          profileName: nameByWaId.get(from) ?? null,
          phoneNumberId,
          type,
          text: typeof text === "string" ? text : caption,
          media,
          timestamp: toDate(message.timestamp),
        });
      }

      for (const raw of asArray(value.statuses)) {
        const status = asRecord(raw);
        statuses.push({
          wamid: String(status.id ?? ""),
          status: String(status.status ?? ""),
          timestamp: toDate(status.timestamp),
        });
      }
    }
  }

  return { messages, statuses, templates };
}
