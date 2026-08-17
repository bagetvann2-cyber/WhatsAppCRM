import { env } from "@/lib/env";

/**
 * Работа с файлами Meta. Скачивание идёт в два шага: сначала по id получаем
 * временную ссылку, потом качаем по ней — и обязательно с токеном, без него
 * CDN отвечает 401. Ссылка живёт минуты, поэтому её нигде не храним.
 */

export type MediaMeta = {
  url: string;
  mimeType: string | null;
  size: number | null;
};

/** Отправляемые типы. Meta различает их в теле запроса, а не по mime. */
export type MediaKind = "image" | "video" | "audio" | "document";

async function graphError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? `Graph API вернул ${response.status}`;
}

export async function fetchMediaMeta(mediaId: string): Promise<MediaMeta> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${mediaId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.token()}` },
  });

  if (!response.ok) {
    throw new Error(await graphError(response));
  }

  const data = (await response.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number | string;
  };

  if (!data.url) {
    throw new Error("Graph API не вернул ссылку на файл");
  }

  const size = Number(data.file_size);

  return {
    url: data.url,
    mimeType: data.mime_type ?? null,
    size: Number.isFinite(size) && size > 0 ? size : null,
  };
}

/** Качает файл по временной ссылке. Больше лимита не тянем: память не резиновая. */
export async function downloadMedia(
  url: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.token()}` },
  });

  if (!response.ok) {
    throw new Error(`Не удалось скачать файл: ${response.status}`);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Файл больше ${Math.round(maxBytes / 1024 / 1024)} МБ`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`Файл больше ${Math.round(maxBytes / 1024 / 1024)} МБ`);
  }

  return {
    bytes: new Uint8Array(buffer),
    mimeType: response.headers.get("content-type"),
  };
}

/** Загружает файл в Meta и возвращает id, которым его можно отправить. */
export async function uploadMedia(file: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}): Promise<{ mediaId: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${env.phoneNumberId()}/media`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", file.mimeType);
  form.append("file", new Blob([file.bytes as BlobPart], { type: file.mimeType }), file.filename);

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token()}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(await graphError(response));
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Graph API не вернул идентификатор файла");
  }

  return { mediaId: data.id };
}

/** Отправляет уже загруженный файл. Как и текст, работает внутри 24-часового окна. */
export async function sendMediaMessage(
  to: string,
  kind: MediaKind,
  mediaId: string,
  extra: { caption?: string | null; filename?: string | null } = {},
): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${env.phoneNumberId()}/messages`;

  // Подпись Meta принимает только у картинок, видео и документов;
  // у аудио её нет — отправим текстом отдельным сообщением, если понадобится.
  const payload: Record<string, unknown> = { id: mediaId };
  if (extra.caption && kind !== "audio") {
    payload.caption = extra.caption;
  }
  if (kind === "document" && extra.filename) {
    payload.filename = extra.filename;
  }

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
      type: kind,
      [kind]: payload,
    }),
  });

  if (!response.ok) {
    throw new Error(await graphError(response));
  }

  const data = (await response.json()) as { messages?: { id: string }[] };
  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new Error("Graph API не вернул идентификатор сообщения");
  }

  return { wamid };
}
