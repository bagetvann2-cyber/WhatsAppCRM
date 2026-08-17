import { prisma } from "@/lib/db";

/**
 * Отказ от рассылок. Отписка касается только рекламы: подтверждение записи
 * и ответ на вопрос клиенту всё равно уходят — он отписывался от рассылки,
 * а не от общения с компанией.
 */

/**
 * Слова, по которым клиент отписывается сам. Meta показывает на маркетинговых
 * шаблонах кнопку «Stop promotions», но её текст приходит обычным сообщением,
 * поэтому список покрывает и кнопку, и написанное руками — на трёх языках.
 */
const STOP_WORDS = [
  "стоп",
  "отпишите",
  "отписка",
  "отписаться",
  "отписаться от рассылки",
  "не присылайте",
  "не пишите мне",
  "тоқта",
  "жазылымнан бас тарту",
  "stop",
  "unsubscribe",
  "stop promotions",
];

/**
 * Сообщение — это отписка? Сравниваем по всему тексту, а не по вхождению:
 * во фразе «стоп, а сколько стоит?» слово «стоп» отпиской не является.
 */
export function isUnsubscribeRequest(text: string | null): boolean {
  if (!text) {
    return false;
  }

  const clean = text
    .toLowerCase()
    .replace(/[.!,;:)("'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return STOP_WORDS.includes(clean);
}

export const UNSUBSCRIBE_CONFIRMATION =
  "Вы отписаны от рассылок. Писать вам с предложениями больше не будем — но если что-то понадобится, просто напишите нам сюда.";

/** Ставит или снимает отказ. Возвращает false, если контакт не наш. */
export async function setUnsubscribed(input: {
  organizationId: string;
  contactId: string;
  unsubscribed: boolean;
  source: string;
}): Promise<boolean> {
  const updated = await prisma.contact.updateMany({
    where: { id: input.contactId, organizationId: input.organizationId },
    data: input.unsubscribed
      ? { unsubscribedAt: new Date(), unsubscribeSource: input.source }
      : { unsubscribedAt: null, unsubscribeSource: null },
  });

  return updated.count > 0;
}

/**
 * Обрабатывает входящее сообщение как возможную отписку.
 * Возвращает true, если это была она: тогда ни автоответ, ни ИИ-помощник
 * в диалог не вмешиваются — клиенту нужен один понятный ответ, а не три.
 */
export async function handleUnsubscribeMessage(input: {
  organizationId: string;
  conversationId: string;
  text: string | null;
}): Promise<boolean> {
  if (!isUnsubscribeRequest(input.text)) {
    return false;
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, organizationId: input.organizationId },
    select: { contactId: true },
  });

  if (!conversation) {
    return false;
  }

  await setUnsubscribed({
    organizationId: input.organizationId,
    contactId: conversation.contactId,
    unsubscribed: true,
    source: "написал сам",
  });

  return true;
}

/** Сколько контактов сегмента не получат рекламную рассылку. */
export async function countUnsubscribed(organizationId: string): Promise<number> {
  return prisma.contact.count({
    where: { organizationId, unsubscribedAt: { not: null } },
  });
}
