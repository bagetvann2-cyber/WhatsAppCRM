import { env } from "@/lib/env";

/**
 * Отправляет шаблон на модерацию Meta. Возвращает её идентификатор и стартовый
 * статус — обычно PENDING, но простые служебные шаблоны иногда одобряются сразу.
 */
export async function submitTemplate(
  wabaId: string,
  payload: unknown,
): Promise<{ metaId: string; status: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${wabaId}/message_templates`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Graph API вернул ${response.status}`);
  }
  if (!data.id) {
    throw new Error("Graph API не вернул идентификатор шаблона");
  }

  return { metaId: data.id, status: data.status ?? "PENDING" };
}

/** Отправляет текстовое сообщение. Работает только внутри 24-часового окна. */
export async function sendTextMessage(to: string, text: string): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${env.phoneNumberId()}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  const data = (await response.json()) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Graph API вернул ${response.status}`);
  }

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new Error("Graph API не вернул идентификатор сообщения");
  }

  return { wamid };
}
