import { prisma } from "@/lib/db";

/**
 * Рабочий стол владельца: числа, а не графики. Разбор конкурентов показал,
 * что владельцу бизнеса нужен ответ на вопрос «всё ли в порядке», а не
 * аналитическая панель — поэтому здесь считается то, на что можно среагировать.
 */

export type Dashboard = {
  waitingReply: number;
  conversations: number;
  contacts: number;
  openWindows: number;
  inbound7d: number;
  outbound7d: number;
  numbers: {
    channelId: string;
    phoneNumberId: string | null;
    displayNumber: string | null;
    connected: boolean;
  }[];
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

/**
 * Диалог ждёт ответа, если последнее сообщение в нём — от клиента.
 * Считаем в приложении: «последнее сообщение входящее» одним условием
 * Prisma не выражается, а держать денормализованный флаг ради счётчика —
 * лишний источник рассинхрона.
 */
export async function countWaitingReply(organizationId: string): Promise<number> {
  const conversations = await prisma.conversation.findMany({
    where: { organizationId },
    select: {
      messages: { orderBy: { timestamp: "desc" }, take: 1, select: { direction: true } },
    },
  });

  return conversations.filter((c) => c.messages[0]?.direction === "INBOUND").length;
}

export async function dashboard(organizationId: string): Promise<Dashboard> {
  const week = daysAgo(7);

  const [waitingReply, conversations, contacts, openWindows, inbound7d, outbound7d, numbers] =
    await Promise.all([
      countWaitingReply(organizationId),
      prisma.conversation.count({ where: { organizationId } }),
      prisma.contact.count({ where: { organizationId } }),
      prisma.conversation.count({
        where: { organizationId, windowExpiresAt: { gt: new Date() } },
      }),
      prisma.message.count({
        where: {
          conversation: { organizationId },
          direction: "INBOUND",
          timestamp: { gte: week },
        },
      }),
      prisma.message.count({
        where: {
          conversation: { organizationId },
          direction: "OUTBOUND",
          timestamp: { gte: week },
        },
      }),
      prisma.channel.findMany({
        where: { organizationId, type: "WHATSAPP" },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  return {
    waitingReply,
    conversations,
    contacts,
    openWindows,
    inbound7d,
    outbound7d,
    numbers: numbers.map((channel) => ({
      channelId: channel.id,
      phoneNumberId: channel.externalId,
      displayNumber: channel.externalUsername,
      connected: channel.status === "ACTIVE",
    })),
  };
}

export type OperatorRow = {
  userId: string;
  label: string;
  assigned: number;
  replies: number;
  medianReplyMinutes: number | null;
};

/** Медиана, а не среднее: один забытый на ночь диалог перекашивает среднее. */
export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export type Turn = {
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  timestamp: Date;
  authorId: string | null;
};

export type ResponseTimes = {
  /** Минуты до первого ответа на обращение, по каждому обращению. */
  all: number[];
  byAuthor: Map<string, number[]>;
};

/**
 * Скорость ответа на обращение. Обращением считается входящее сообщение,
 * перед которым мы уже всё ответили: если клиент прислал три сообщения
 * подряд, это одно обращение, а не три — иначе статистика льстит нам.
 *
 * Ответ без автора (автоответ, ИИ-помощник, рассылка) закрывает обращение,
 * но в нагрузку оператора не идёт: робот отвечает мгновенно и всегда.
 */
export function responseTimes(turns: Turn[]): ResponseTimes {
  const byConversation = new Map<string, Turn[]>();
  for (const turn of turns) {
    const list = byConversation.get(turn.conversationId) ?? [];
    list.push(turn);
    byConversation.set(turn.conversationId, list);
  }

  const all: number[] = [];
  const byAuthor = new Map<string, number[]>();

  for (const list of byConversation.values()) {
    const ordered = [...list].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    let waitingSince: Date | null = null;

    for (const turn of ordered) {
      if (turn.direction === "INBOUND") {
        waitingSince ??= turn.timestamp;
        continue;
      }

      if (!waitingSince) {
        continue;
      }

      const minutes = Math.round((turn.timestamp.getTime() - waitingSince.getTime()) / 60000);
      all.push(minutes);

      if (turn.authorId) {
        const list = byAuthor.get(turn.authorId) ?? [];
        list.push(minutes);
        byAuthor.set(turn.authorId, list);
      }

      waitingSince = null;
    }
  }

  return { all, byAuthor };
}

export type Workload = {
  rows: OperatorRow[];
  medianReplyMinutes: number | null;
  answered: number;
};

/** Нагрузка команды за период: кто сколько ведёт, отвечает и как быстро. */
export async function workload(organizationId: string, days = 7): Promise<Workload> {
  const since = daysAgo(days);

  const [members, turns, assigned, replies] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId }, include: { user: true } }),
    prisma.message.findMany({
      where: { conversation: { organizationId }, timestamp: { gte: since } },
      select: { conversationId: true, direction: true, timestamp: true, authorId: true },
      orderBy: { timestamp: "asc" },
    }),
    prisma.conversation.groupBy({
      by: ["assigneeId"],
      where: { organizationId, assigneeId: { not: null } },
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["authorId"],
      where: {
        conversation: { organizationId },
        timestamp: { gte: since },
        authorId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const times = responseTimes(turns as Turn[]);
  const assignedBy = new Map(assigned.map((row) => [row.assigneeId, row._count._all]));
  const repliesBy = new Map(replies.map((row) => [row.authorId, row._count._all]));

  const rows: OperatorRow[] = members
    .map((member) => ({
      userId: member.userId,
      label: member.user.name?.trim() || member.user.email,
      assigned: assignedBy.get(member.userId) ?? 0,
      replies: repliesBy.get(member.userId) ?? 0,
      medianReplyMinutes: median(times.byAuthor.get(member.userId) ?? []),
    }))
    // Сверху те, кто работает: пустые строки коллег внизу не мешают читать.
    .sort((a, b) => b.replies - a.replies || a.label.localeCompare(b.label, "ru"));

  return {
    rows,
    medianReplyMinutes: median(times.all),
    answered: times.all.length,
  };
}
