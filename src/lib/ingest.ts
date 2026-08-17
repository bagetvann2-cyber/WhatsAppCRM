import { prisma } from "@/lib/db";
import { applyRecipientStatus } from "@/lib/broadcasts";
import type { IncomingMessage, StatusUpdate } from "@/lib/whatsapp/parse";

const WINDOW_HOURS = 24;

export type IngestResult =
  | {
      stored: true;
      conversationId: string;
      created: boolean;
      organizationId: string;
      /** Идентификатор сохранённого сообщения — по нему качается вложение. */
      messageId: string;
    }
  | { stored: false; reason: "unknown-number" };

/**
 * Сохраняет входящее сообщение. Компания определяется по phone_number_id:
 * Meta присылает его в каждом вебхуке, и это единственная связь входящего
 * сообщения с конкретным клиентом платформы.
 *
 * Повторная доставка того же wamid не создаёт дубликат — Meta шлёт вебхук
 * повторно при любом ответе кроме 200.
 */
export async function saveIncomingMessage(message: IncomingMessage): Promise<IngestResult> {
  const number = await prisma.whatsappNumber.findUnique({
    where: { phoneNumberId: message.phoneNumberId },
  });

  // Вебхук на номер, которого мы не знаем: чужое приложение или номер уже отключён.
  // Молча пропускаем — иначе чужие данные попадут в чужую организацию.
  if (!number) {
    return { stored: false, reason: "unknown-number" };
  }

  const organizationId = number.organizationId;

  const contact = await prisma.contact.upsert({
    where: { organizationId_waId: { organizationId, waId: message.from } },
    update: message.profileName ? { name: message.profileName } : {},
    create: { organizationId, waId: message.from, name: message.profileName },
  });

  const windowExpiresAt = new Date(message.timestamp.getTime() + WINDOW_HOURS * 3600 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_phoneNumberId: {
        contactId: contact.id,
        phoneNumberId: message.phoneNumberId,
      },
    },
    update: { lastMessageAt: message.timestamp, windowExpiresAt },
    create: {
      organizationId,
      contactId: contact.id,
      phoneNumberId: message.phoneNumberId,
      lastMessageAt: message.timestamp,
      windowExpiresAt,
    },
  });

  const existing = await prisma.message.findUnique({ where: { wamid: message.wamid } });
  if (existing) {
    return {
      stored: true,
      conversationId: conversation.id,
      created: false,
      organizationId,
      messageId: existing.id,
    };
  }

  const created = await prisma.message.create({
    data: {
      wamid: message.wamid,
      conversationId: conversation.id,
      direction: "INBOUND",
      type: message.type,
      text: message.text,
      timestamp: message.timestamp,
      ...(message.media
        ? {
            mediaId: message.media.mediaId,
            mimeType: message.media.mimeType,
            filename: message.media.filename,
            mediaSize: message.media.size,
            voice: message.media.voice,
          }
        : {}),
    },
  });

  return {
    stored: true,
    conversationId: conversation.id,
    created: true,
    organizationId,
    messageId: created.id,
  };
}

/** Обновляет статус доставки. Статус может прийти раньше, чем мы узнали о сообщении. */
export async function applyStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.message.updateMany({
    where: { wamid: update.wamid },
    data: { status: update.status },
  });

  // Тот же wamid может принадлежать сообщению рассылки — тогда обновляем и отчёт.
  await applyRecipientStatus(update.wamid, update.status);
}
