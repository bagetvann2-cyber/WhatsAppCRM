import { prisma } from "@/lib/db";
import type { IncomingMessage, StatusUpdate } from "@/lib/whatsapp/parse";

const WINDOW_HOURS = 24;

/**
 * Сохраняет входящее сообщение. Повторная доставка того же wamid
 * не создаёт дубликат — Meta шлёт вебхук повторно при любом ответе кроме 200.
 */
export async function saveIncomingMessage(
  message: IncomingMessage,
): Promise<{ conversationId: string; created: boolean }> {
  const contact = await prisma.contact.upsert({
    where: { waId: message.from },
    update: message.profileName ? { name: message.profileName } : {},
    create: { waId: message.from, name: message.profileName },
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
      contactId: contact.id,
      phoneNumberId: message.phoneNumberId,
      lastMessageAt: message.timestamp,
      windowExpiresAt,
    },
  });

  const existing = await prisma.message.findUnique({ where: { wamid: message.wamid } });
  if (existing) {
    return { conversationId: conversation.id, created: false };
  }

  await prisma.message.create({
    data: {
      wamid: message.wamid,
      conversationId: conversation.id,
      direction: "INBOUND",
      type: message.type,
      text: message.text,
      timestamp: message.timestamp,
    },
  });

  return { conversationId: conversation.id, created: true };
}

/** Обновляет статус доставки. Статус может прийти раньше, чем мы узнали о сообщении. */
export async function applyStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.message.updateMany({
    where: { wamid: update.wamid },
    data: { status: update.status },
  });
}
