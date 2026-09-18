import { prisma } from "@/lib/db";
import { canAfford, money } from "@/lib/billing";
import { getBalance, recordOperation } from "@/lib/billing-store";
import { contactWhere, type ContactFilter } from "@/lib/contacts";
import { PRICE_PER_MESSAGE, estimateCost } from "@/lib/pricing";
import { sendTemplateMessage } from "@/lib/whatsapp/client";
import { whatsAppCredentials } from "@/lib/channels/whatsapp";

export { PRICE_PER_MESSAGE, estimateCost } from "@/lib/pricing";

/** Пауза между отправками. Meta режет всплески, ровный поток проходит надёжнее. */
const SEND_INTERVAL_MS = 120;

/** Автостоп: если каждое пятое сообщение падает, дальше слать бессмысленно. */
const FAILURE_THRESHOLD = 0.2;
const FAILURE_MIN_SAMPLE = 10;

/**
 * Кому уйдёт рассылка. Пустой фильтр — всем контактам компании.
 * `marketing` убирает отписавшихся: реклама им запрещена, служебные
 * сообщения по одобренному шаблону — нет.
 */
export async function selectRecipients(
  organizationId: string,
  filter: ContactFilter = {},
  options: { marketing?: boolean } = {},
) {
  return prisma.contact.findMany({
    where: {
      ...contactWhere(organizationId, filter),
      ...(options.marketing ? { unsubscribedAt: null } : {}),
    },
    // id вторым ключом: у контактов из одного импорта createdAt совпадает
    // до миллисекунды, и без него порядок отправки каждый раз разный.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/**
 * Значения переменных для конкретного получателя. {{1}} — имя контакта:
 * это единственная переменная, которую мы знаем про каждого. Остальные
 * берутся из примеров шаблона, одинаковые для всех.
 */
export function valuesForContact(
  examples: string[],
  contact: { name: string | null },
): string[] {
  if (examples.length === 0) {
    return [];
  }

  const first = contact.name?.trim() || examples[0];
  return [first, ...examples.slice(1)];
}

export async function listBroadcasts(organizationId: string) {
  return prisma.broadcast.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      template: true,
      recipients: {
        select: { status: true, contact: { select: { unsubscribedAt: true } } },
      },
    },
  });
}

export type BroadcastListItem = Awaited<ReturnType<typeof listBroadcasts>>[number];

export function countByStatus(recipients: { status: string }[]) {
  const counts = { PENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0, SKIPPED: 0 };
  for (const recipient of recipients) {
    if (recipient.status in counts) {
      counts[recipient.status as keyof typeof counts] += 1;
    }
  }
  return counts;
}

/**
 * Отписки, вызванные рассылкой: получатели, отписавшиеся после её запуска.
 * Главное число отчёта по рекламе — оно показывает, не перегнули ли с частотой.
 */
export function countUnsubscribes(
  recipients: { contact: { unsubscribedAt: Date | null } }[],
  startedAt: Date | null,
): number {
  if (!startedAt) {
    return 0;
  }

  return recipients.filter(
    (recipient) =>
      recipient.contact.unsubscribedAt !== null &&
      recipient.contact.unsubscribedAt.getTime() >= startedAt.getTime(),
  ).length;
}

/**
 * Создаёт рассылку и фиксирует список получателей. Именно фиксирует:
 * если контакты потом изменятся, отчёт останется честным.
 */
export async function createBroadcast(input: {
  organizationId: string;
  templateId: string;
  name: string;
  segmentQuery?: string;
  segmentTagIds?: string[];
}) {
  const template = await prisma.messageTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId },
  });

  if (!template) {
    throw new Error("Шаблон не найден.");
  }
  if (template.status !== "APPROVED") {
    throw new Error("Рассылку можно запускать только по шаблону, одобренному Meta.");
  }

  const tagIds = input.segmentTagIds?.filter(Boolean) ?? [];
  const marketing = template.category === "MARKETING";
  const contacts = await selectRecipients(
    input.organizationId,
    { query: input.segmentQuery, tagIds },
    { marketing },
  );

  if (contacts.length === 0) {
    throw new Error(
      marketing
        ? "В сегменте нет ни одного контакта, которому можно писать: все либо не подходят под фильтр, либо отписались от рассылок."
        : "В сегменте нет ни одного контакта.",
    );
  }

  return prisma.broadcast.create({
    data: {
      organizationId: input.organizationId,
      templateId: template.id,
      name: input.name.trim() || template.name,
      segmentQuery: input.segmentQuery?.trim() || null,
      segmentTagIds: tagIds,
      recipients: {
        create: contacts.map((contact) => ({ contactId: contact.id })),
      },
    },
  });
}

export async function stopBroadcast(
  organizationId: string,
  id: string,
  reason = "Остановлена вручную",
): Promise<void> {
  await prisma.broadcast.updateMany({
    where: { id, organizationId, status: "RUNNING" },
    data: { status: "STOPPED", stoppedReason: reason, finishedAt: new Date() },
  });
}

/**
 * Рассылает сообщения по очереди с паузой между отправками.
 * Работает в том же процессе: для боевой нагрузки очередь выносится
 * в отдельный воркер, но поведение и статусы остаются теми же.
 */
export async function runBroadcast(organizationId: string, id: string): Promise<void> {
  const broadcast = await prisma.broadcast.findFirst({
    where: { id, organizationId },
    include: { template: true },
  });

  if (!broadcast) {
    throw new Error("Рассылка не найдена.");
  }
  if (broadcast.status !== "DRAFT") {
    throw new Error("Эта рассылка уже запускалась.");
  }

  const channel = await prisma.channel.findFirst({ where: { organizationId, type: "WHATSAPP" } });
  if (!channel) {
    throw new Error("У компании нет подключённого канала WhatsApp.");
  }
  const creds = whatsAppCredentials(channel);

  // Проверяем деньги до первой отправки: рассылка, оборвавшаяся на середине,
  // это половина клиентов с обрывком акции и объяснение по телефону остальным.
  const recipientCount = await prisma.broadcastRecipient.count({
    where: { broadcastId: broadcast.id, status: "PENDING" },
  });
  const cost = estimateCost(recipientCount, broadcast.template.category);
  const balance = await getBalance(organizationId);

  if (!canAfford(balance, cost)) {
    throw new Error(
      `На балансе ${money(balance)}, а рассылка стоит примерно ${money(cost)}. Пополните баланс — деньги спишутся только за доставленные сообщения.`,
    );
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const pending = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id, status: "PENDING" },
    include: { contact: true },
  });

  let sent = 0;
  let failed = 0;

  for (const recipient of pending) {
    // Останов мог прийти извне, пока шла отправка предыдущего.
    const current = await prisma.broadcast.findUnique({
      where: { id: broadcast.id },
      select: { status: true },
    });
    if (current?.status !== "RUNNING") {
      return;
    }

    // Отписаться могли уже после создания рассылки: список получателей
    // зафиксирован, а запрет — нет. Пропуск не считается сбоем.
    if (broadcast.template.category === "MARKETING" && recipient.contact.unsubscribedAt) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "SKIPPED", error: "Контакт отписался от рассылок" },
      });
      continue;
    }

    try {
      const { wamid } = await sendTemplateMessage(
        creds,
        recipient.contact.externalUserId,
        { name: broadcast.template.name, language: broadcast.template.language },
        valuesForContact(broadcast.template.examples, recipient.contact),
      );

      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", wamid, sentAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Не удалось отправить",
        },
      });
      failed += 1;
    }

    const processed = sent + failed;
    if (processed >= FAILURE_MIN_SAMPLE && failed / processed > FAILURE_THRESHOLD) {
      await stopBroadcast(
        organizationId,
        broadcast.id,
        `Автостоп: не доставлено ${failed} из ${processed}. Проверьте шаблон и номер, прежде чем продолжать.`,
      );
      return;
    }

    if (SEND_INTERVAL_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));
    }
  }

  await prisma.broadcast.updateMany({
    where: { id: broadcast.id, status: "RUNNING" },
    data: { status: "DONE", finishedAt: new Date() },
  });
}

/** Статусы доставки из вебхука относятся и к рассылкам: связь по wamid. */
export async function applyRecipientStatus(wamid: string, status: string): Promise<void> {
  const mapped =
    status === "delivered" ? "DELIVERED" : status === "read" ? "READ" : status === "failed" ? "FAILED" : null;

  if (!mapped) {
    return;
  }

  // Прочитано не понижаем обратно до доставлено: статусы приходят вразнобой.
  const updated = await prisma.broadcastRecipient.updateMany({
    where: {
      wamid,
      ...(mapped === "DELIVERED" ? { status: { in: ["PENDING", "SENT"] } } : {}),
    },
    data: { status: mapped },
  });

  // Meta берёт деньги за доставленное сообщение, а не за отправленное —
  // списываем ровно в этот момент и ровно один раз: повторный вебхук
  // с тем же статусом уже никого не переведёт из SENT в DELIVERED.
  if (mapped === "DELIVERED" && updated.count > 0) {
    await chargeForDelivered(wamid);
  }
}

async function chargeForDelivered(wamid: string): Promise<void> {
  const recipient = await prisma.broadcastRecipient.findFirst({
    where: { wamid },
    include: { broadcast: { include: { template: true } } },
  });

  if (!recipient) {
    return;
  }

  const price = PRICE_PER_MESSAGE[recipient.broadcast.template.category];

  await recordOperation({
    organizationId: recipient.broadcast.organizationId,
    amount: -price,
    kind: "message",
    description: `Доставлено сообщение рассылки «${recipient.broadcast.name}»`,
    broadcastId: recipient.broadcastId,
  });
}
