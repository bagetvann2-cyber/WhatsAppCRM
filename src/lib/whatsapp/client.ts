import { env } from "@/lib/env";
import { ChannelSendError } from "@/lib/channels/types";

export type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
  /// WABA — аккаунт компании в Meta. Нужен только для операций с шаблонами.
  wabaId?: string;
  /// PIN двухфакторки номера, выбранный при регистрации через Embedded Signup.
  /// Для отправки сообщений не нужен — хранится на случай повторной регистрации.
  pin?: string;
};

/** Meta режет сообщение длиннее — проще обрезать самим, чем разбирать её ошибку. */
const TEXT_LIMIT = 4096;
/** Клиент ждёт секунды, а не минуты: долгий зависший запрос хуже быстрой ошибки. */
const TIMEOUT_MS = 15_000;

async function graphFetch(url: string, accessToken: string, body: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChannelSendError("WhatsApp не ответил за 15 секунд");
    }
    throw new ChannelSendError(error instanceof Error ? error.message : "Не удалось обратиться к WhatsApp");
  } finally {
    clearTimeout(timer);
  }

  const data = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new ChannelSendError(data.error?.message ?? `Graph API вернул ${response.status}`);
  }
  return data;
}

/**
 * Отправляет шаблон на модерацию Meta. Возвращает её идентификатор и стартовый
 * статус — обычно PENDING, но простые служебные шаблоны иногда одобряются сразу.
 */
export async function submitTemplate(
  creds: WhatsAppCredentials,
  payload: unknown,
): Promise<{ metaId: string; status: string }> {
  if (!creds.wabaId) {
    throw new ChannelSendError("У канала не задан идентификатор WABA — некуда отправить шаблон");
  }

  const url = `https://graph.facebook.com/${env.graphVersion()}/${creds.wabaId}/message_templates`;
  const data = (await graphFetch(url, creds.accessToken, payload)) as { id?: string; status?: string };

  if (!data.id) {
    throw new ChannelSendError("Graph API не вернул идентификатор шаблона");
  }

  return { metaId: data.id, status: data.status ?? "PENDING" };
}

/**
 * Отправляет одобренный шаблон. В отличие от текста, работает и вне
 * 24-часового окна — это единственный способ написать клиенту первым.
 */
export async function sendTemplateMessage(
  creds: WhatsAppCredentials,
  to: string,
  template: { name: string; language: string },
  values: string[],
): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${creds.phoneNumberId}/messages`;

  const components =
    values.length > 0
      ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }]
      : [];

  const data = (await graphFetch(url, creds.accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  })) as { messages?: { id: string }[] };

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new ChannelSendError("Graph API не вернул идентификатор сообщения");
  }

  return { wamid };
}

/** Отправляет текстовое сообщение. Работает только внутри 24-часового окна. */
export async function sendTextMessage(
  creds: WhatsAppCredentials,
  to: string,
  text: string,
): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${creds.phoneNumberId}/messages`;
  const body = text.length > TEXT_LIMIT ? text.slice(0, TEXT_LIMIT) : text;

  const data = (await graphFetch(url, creds.accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  })) as { messages?: { id: string }[] };

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new ChannelSendError("Graph API не вернул идентификатор сообщения");
  }

  return { wamid };
}
