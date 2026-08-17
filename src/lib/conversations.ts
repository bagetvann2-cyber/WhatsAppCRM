import { prisma } from "@/lib/db";

/**
 * Список диалогов для боковой панели. Пустой запрос возвращает всё,
 * непустой ищет по имени, номеру и тексту переписки — оператор помнит
 * либо кто написал, либо о чём был разговор.
 *
 * organizationId обязателен: запрос без привязки к компании невозможен
 * по сигнатуре, а не по договорённости.
 */
export async function listConversations(organizationId: string, query?: string) {
  const q = query?.trim();

  return prisma.conversation.findMany({
    where: {
      organizationId,
      ...(q
        ? {
            OR: [
              { contact: { name: { contains: q, mode: "insensitive" } } },
              { contact: { waId: { contains: q } } },
              { messages: { some: { text: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });
}

export type ConversationListItem = Awaited<ReturnType<typeof listConversations>>[number];

/** Один диалог целиком. Чужой диалог не откроется: организация в условии выборки. */
export async function getConversation(organizationId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, organizationId },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
  });
}

export type ConversationThread = NonNullable<Awaited<ReturnType<typeof getConversation>>>;
export type ThreadMessage = ConversationThread["messages"][number];
