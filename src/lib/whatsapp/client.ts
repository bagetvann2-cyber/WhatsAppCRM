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

/**
 * Отправляет одобренный шаблон. В отличие от текста, работает и вне
 * 24-часового окна — это единственный способ написать клиенту первым.
 */
export async function sendTemplateMessage(
  to: string,
  template: { name: string; language: string },
  values: string[],
): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${env.phoneNumberId()}/messages`;

  const components =
    values.length > 0
      ? [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }]
      : [];

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
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(components.length > 0 ? { components } : {}),
      },
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
