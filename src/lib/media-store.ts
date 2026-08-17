import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { extensionFor } from "@/lib/media";
import { downloadMedia, fetchMediaMeta } from "@/lib/whatsapp/media";

/**
 * Копии вложений на диске. Meta удаляет файлы через 30 дней, а переписка в CRM
 * живёт годами — без своей копии старый диалог превращается в набор битых
 * ссылок. Имя копии — идентификатор сообщения: он уникален и не угадывается.
 */

function mediaRoot(): string {
  return resolve(process.cwd(), env.mediaDir());
}

/** Имя всегда собираем сами, но перед обращением к диску всё равно обрезаем путь. */
function safePath(name: string): string {
  return join(mediaRoot(), basename(name));
}

export async function writeMediaFile(name: string, bytes: Uint8Array): Promise<void> {
  await mkdir(mediaRoot(), { recursive: true });
  await writeFile(safePath(name), bytes);
}

export async function readMediaFile(name: string): Promise<Buffer | null> {
  try {
    return await readFile(safePath(name));
  } catch {
    return null;
  }
}

/**
 * Сообщение с вложением, доступное этой компании. organizationId в условии
 * выборки, а не в проверке после: чужой файл не найдётся, даже если знать id.
 */
export async function findMediaMessage(organizationId: string, messageId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversation: { organizationId } },
    select: {
      id: true,
      type: true,
      mediaId: true,
      mediaPath: true,
      mimeType: true,
      filename: true,
      voice: true,
      timestamp: true,
    },
  });

  if (!message || (!message.mediaPath && !message.mediaId)) {
    return null;
  }
  return message;
}

export type MediaResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Гарантирует, что копия файла лежит у нас. Вызывается и при приёме вебхука,
 * и при первом открытии вложения — второй раз ничего не качает.
 *
 * Ошибку не бросает: вложение, которое не скачалось, не должно ронять ни приём
 * сообщения, ни отрисовку переписки.
 */
export async function ensureMediaFile(messageId: string): Promise<MediaResult> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, mediaId: true, mediaPath: true, mimeType: true, filename: true },
  });

  if (!message) {
    return { ok: false, error: "Сообщение не найдено" };
  }

  if (message.mediaPath && (await readMediaFile(message.mediaPath))) {
    return { ok: true, name: message.mediaPath };
  }

  if (!message.mediaId) {
    return { ok: false, error: "У сообщения нет вложения" };
  }

  try {
    const meta = await fetchMediaMeta(message.mediaId);
    const { bytes, mimeType } = await downloadMedia(meta.url, env.mediaMaxBytes());

    const type = message.mimeType ?? meta.mimeType ?? mimeType;
    const name = `${message.id}.${extensionFor(type, message.filename)}`;
    await writeMediaFile(name, bytes);

    await prisma.message.update({
      where: { id: message.id },
      data: {
        mediaPath: name,
        mediaSize: bytes.byteLength,
        mimeType: type,
        mediaError: null,
      },
    });

    return { ok: true, name };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Не удалось скачать файл";

    await prisma.message.update({
      where: { id: message.id },
      data: { mediaError: reason },
    });

    return { ok: false, error: reason };
  }
}

/** Сохраняет файл, который отправил оператор: качать его у Meta незачем. */
export async function storeOutgoingMedia(input: {
  messageId: string;
  bytes: Uint8Array;
  mimeType: string;
  filename: string | null;
}): Promise<void> {
  const name = `${input.messageId}.${extensionFor(input.mimeType, input.filename)}`;
  await writeMediaFile(name, input.bytes);

  await prisma.message.update({
    where: { id: input.messageId },
    data: { mediaPath: name, mediaSize: input.bytes.byteLength },
  });
}
