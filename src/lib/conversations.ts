import { prisma } from "@/lib/db";

/**
 * Список диалогов для боковой панели. Пустой запрос возвращает всё,
 * непустой ищет по имени, номеру и тексту переписки — оператор помнит
 * либо кто написал, либо о чём был разговор.
 */
export async function listConversations(query?: string) {
  const q = query?.trim();

  return prisma.conversation.findMany({
    where: q
      ? {
          OR: [
            { contact: { name: { contains: q, mode: "insensitive" } } },
            { contact: { waId: { contains: q } } },
            { messages: { some: { text: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });
}

export type ConversationListItem = Awaited<ReturnType<typeof listConversations>>[number];

/** Один диалог целиком, со всей перепиской по возрастанию времени. */
export async function getConversation(id: string) {
  return prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
  });
}

export type ConversationThread = NonNullable<Awaited<ReturnType<typeof getConversation>>>;
export type ThreadMessage = ConversationThread["messages"][number];
