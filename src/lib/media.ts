/**
 * Чистые правила вокруг вложений: как их называть, чем открывать, каким
 * расширением сохранять. Без обращений к диску и сети — файл импортируют
 * и серверные страницы, и браузерный композер.
 */

export type MediaKind = "image" | "video" | "audio" | "document";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};

const KIND_LABELS: Record<MediaKind, string> = {
  image: "Фото",
  video: "Видео",
  audio: "Аудио",
  document: "Документ",
};

/** Тип сообщения Meta важнее mime: стикер приходит как image/webp, но это стикер. */
export function mediaKind(messageType: string, mimeType: string | null): MediaKind {
  if (messageType === "sticker" || messageType === "image") {
    return "image";
  }
  if (messageType === "video" || messageType === "audio" || messageType === "document") {
    return messageType;
  }

  const mime = mimeType?.split(";")[0].trim() ?? "";
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  return "document";
}

/** Расширение для нашей копии: браузер и ОС узнают файл по нему, а не по mime. */
export function extensionFor(mimeType: string | null, filename: string | null): string {
  const fromName = filename?.split(".").pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }

  const mime = mimeType?.split(";")[0].trim().toLowerCase() ?? "";
  return EXTENSIONS[mime] ?? "bin";
}

/** Размер словами: оператору важно понять, качать сейчас или потом. */
export function sizeLabel(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} КБ`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Подпись вложения в списке диалогов: «Фото», «Голосовое», имя документа. */
export function mediaLabel(input: {
  type: string;
  mimeType: string | null;
  filename: string | null;
  voice: boolean;
}): string {
  if (input.voice) {
    return "Голосовое сообщение";
  }
  if (input.type === "sticker") {
    return "Стикер";
  }

  const kind = mediaKind(input.type, input.mimeType);
  if (kind === "document" && input.filename) {
    return input.filename;
  }
  return KIND_LABELS[kind];
}

/**
 * Имя файла для скачивания. Meta не всегда присылает своё, а «file.bin»
 * в папке «Загрузки» — худшее, что можно отдать оператору.
 */
export function downloadName(input: {
  filename: string | null;
  type: string;
  mimeType: string | null;
  voice: boolean;
  timestamp: Date;
}): string {
  if (input.filename) {
    return input.filename;
  }

  const stamp = input.timestamp
    .toISOString()
    .slice(0, 16)
    .replace("T", "-")
    .replace(":", "-");

  const kind = input.voice ? "voice" : mediaKind(input.type, input.mimeType);
  return `${kind}-${stamp}.${extensionFor(input.mimeType, null)}`;
}
