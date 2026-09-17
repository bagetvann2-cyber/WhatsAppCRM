import { prisma } from "@/lib/db";
import { startTrial } from "@/lib/billing-store";
import { applyRecipientStatus } from "@/lib/broadcasts";
import type { ChannelType } from "@/generated/prisma/client";
import type { IncomingMedia } from "@/lib/whatsapp/parse";

const WINDOW_HOURS = 24;

/**
 * Входящее сообщение независимо от канала. WhatsApp и Telegram сохраняются
 * в общую переписку через один и тот же путь — каждый вебхук лишь приводит
 * свой payload к этой форме (см. src/app/api/webhook/route.ts и
 * src/lib/telegram/parse.ts).
 */
export type ChannelIncomingMessage = {
  channelType: ChannelType;
  /** Ключ поиска канала в паре с channelType: phone_number_id у WhatsApp, id бота у Telegram. */
  channelExternalId: string;
  externalMessageId: string;
  from: string;
  profileName: string | null;
  type: string;
  /** Для вложения — подпись к файлу. */
  text: string | null;
  media: IncomingMedia | null;
  timestamp: Date;
};

export type ChannelStatusUpdate = {
  externalMessageId: string;
  status: string;
  timestamp: Date;
};

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
 * Сохраняет входящее сообщение любого канала. Канал определяется по паре
 * (channelType, channelExternalId) — phone_number_id у WhatsApp, id бота
 * у Telegram — это единственная связь входящего сообщения с конкретным
 * каналом платформы.
 *
 * Повторная доставка того же externalMessageId не создаёт дубликат — Meta
 * шлёт вебхук повторно при любом ответе кроме 200.
 */
export async function saveIncomingMessage(message: ChannelIncomingMessage): Promise<IngestResult> {
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: message.channelType, externalId: message.channelExternalId } },
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
    where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: message.externalMessageId } },
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
      externalMessageId: message.externalMessageId,
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
export async function applyStatusUpdate(update: ChannelStatusUpdate): Promise<void> {
  await prisma.message.updateMany({
    where: { externalMessageId: update.externalMessageId },
    data: { status: update.status },
  });

  // Тот же externalMessageId может принадлежать сообщению рассылки — тогда обновляем и отчёт.
  await applyRecipientStatus(update.externalMessageId, update.status);
}
