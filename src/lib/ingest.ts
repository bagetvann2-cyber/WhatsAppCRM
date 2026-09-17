import { prisma } from "@/lib/db";
import { startTrial } from "@/lib/billing-store";
import { applyRecipientStatus } from "@/lib/broadcasts";
import type { IncomingMessage, StatusUpdate } from "@/lib/whatsapp/parse";

const WINDOW_HOURS = 24;

export type IngestResult =
  | {
      stored: true;
      conversationId: string;
      created: boolean;
      organizationId: string;
      channelId: string;
      /** Идентификатор сохранённого сообщения — по нему качается вложение. */
      messageId: string;
    }
  | { stored: false; reason: "unknown-number" };

/**
 * Сохраняет входящее сообщение WhatsApp. Компания определяется по phone_number_id:
 * Meta присылает его в каждом вебхуке, и это единственная связь входящего
 * сообщения с конкретным каналом платформы.
 *
 * Повторная доставка того же wamid не создаёт дубликат — Meta шлёт вебхук
 * повторно при любом ответе кроме 200.
 */
export async function saveIncomingMessage(message: IncomingMessage): Promise<IngestResult> {
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: "WHATSAPP", externalId: message.phoneNumberId } },
  });

  // Вебхук на номер, которого мы не знаем: чужое приложение или номер уже отключён.
  // Молча пропускаем — иначе чужие данные попадут в чужую организацию.
  if (!channel) {
    return { stored: false, reason: "unknown-number" };
  }

  const organizationId = channel.organizationId;

  // Первое живое сообщение — это и есть подключённый номер. Пробный период
  // начинается здесь, а не при регистрации: клиент не сжигает бесплатные дни,
  // пока разбирается с Meta. Сбой биллинга не должен терять сообщение.
  await startTrial(organizationId).catch(() => {});

  const contact = await prisma.contact.upsert({
    where: { channelId_externalUserId: { channelId: channel.id, externalUserId: message.from } },
    update: message.profileName ? { name: message.profileName } : {},
    create: {
      organizationId,
      channelId: channel.id,
      externalUserId: message.from,
      name: message.profileName,
    },
  });

  const windowExpiresAt = new Date(message.timestamp.getTime() + WINDOW_HOURS * 3600 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: { contactId_channelId: { contactId: contact.id, channelId: channel.id } },
    update: { lastMessageAt: message.timestamp, windowExpiresAt },
    create: {
      organizationId,
      contactId: contact.id,
      channelId: channel.id,
      lastMessageAt: message.timestamp,
      windowExpiresAt,
    },
  });

  const existing = await prisma.message.findUnique({
    where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: message.wamid } },
  });
  if (existing) {
    return {
      stored: true,
      conversationId: conversation.id,
      created: false,
      organizationId,
      channelId: channel.id,
      messageId: existing.id,
    };
  }

  const created = await prisma.message.create({
    data: {
      externalMessageId: message.wamid,
      channelId: channel.id,
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
    channelId: channel.id,
    messageId: created.id,
  };
}

/** Обновляет статус доставки. Статус может прийти раньше, чем мы узнали о сообщении. */
export async function applyStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.message.updateMany({
    where: { externalMessageId: update.wamid },
    data: { status: update.status },
  });

  // Тот же wamid может принадлежать сообщению рассылки — тогда обновляем и отчёт.
  await applyRecipientStatus(update.wamid, update.status);
}
