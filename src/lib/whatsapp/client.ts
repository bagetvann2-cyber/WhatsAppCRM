import { env } from "@/lib/env";

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
