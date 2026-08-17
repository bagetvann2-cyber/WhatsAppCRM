import { prisma } from "@/lib/db";
import { subscriptionPrice, type Period } from "@/lib/billing";

/**
 * Подписка, баланс и счета. Оплата пока не подключена: счёт создаётся
 * и ждёт денег. Kaspi и безналичный расчёт встанут на это же место —
 * им останется только пометить счёт оплаченным.
 */

/** Тарифы по умолчанию — из раздела 9 ТЗ. Цифры заказчик меняет в базе. */
const DEFAULT_PLANS = [
  {
    code: "trial",
    name: "Пробный",
    monthlyPrice: 0,
    operatorsIncluded: 3,
    extraOperatorPrice: 0,
    numbersIncluded: 1,
    integrations: false,
    trialDays: 7,
    sortOrder: 0,
    features: ["Полный доступ на 7 дней", "1 номер", "До 3 операторов"],
  },
  {
    code: "start",
    name: "Старт",
    monthlyPrice: 19990,
    operatorsIncluded: 3,
    extraOperatorPrice: 5000,
    numbersIncluded: 1,
    integrations: false,
    trialDays: 0,
    sortOrder: 1,
    features: [
      "1 номер WhatsApp",
      "До 3 операторов",
      "Инбокс, контакты, шаблоны, рассылки",
      "API и исходящие вебхуки",
    ],
  },
  {
    code: "business",
    name: "Бизнес",
    monthlyPrice: 29990,
    operatorsIncluded: 10,
    extraOperatorPrice: 5000,
    numbersIncluded: 3,
    integrations: true,
    trialDays: 0,
    sortOrder: 2,
    features: [
      "Всё из «Старта»",
      "Интеграции с CRM",
      "Автоответы и ИИ-помощник",
      "До 10 операторов",
    ],
  },
];

/** Создаёт тарифы, если их ещё нет. Существующие цены не трогает. */
export async function ensurePlans() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: plan,
    });
  }

  return prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
}

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  return plans.length > 0 ? plans : ensurePlans();
}

export async function getSubscription(organizationId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });

  if (existing) {
    return existing;
  }

  // Кабинет без подписки — это кабинет до первого живого сообщения.
  // Заводим его на пробном, но часы включатся только с подключением номера.
  const plans = await listPlans();
  const trial = plans.find((plan) => plan.code === "trial") ?? plans[0];

  return prisma.subscription.create({
    data: { organizationId, planId: trial.id, status: "TRIAL" },
    include: { plan: true },
  });
}

/**
 * Запускает пробный период. Вызывается при первом живом сообщении, а не при
 * регистрации: клиент не сжигает бесплатные дни, пока разбирается с Meta.
 * Повторный вызов ничего не меняет — часы уже идут.
 */
export async function startTrial(organizationId: string): Promise<void> {
  const subscription = await getSubscription(organizationId);

  if (subscription.status !== "TRIAL" || subscription.trialEndsAt) {
    return;
  }

  const days = subscription.plan.trialDays || 7;

  await prisma.subscription.update({
    where: { organizationId },
    data: { trialEndsAt: new Date(Date.now() + days * 24 * 3600 * 1000) },
  });
}

/** Подписка действует? Просроченная не запрещает переписку, только рассылки. */
export function isSubscriptionActive(
  subscription: { status: string; trialEndsAt: Date | null; paidUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (subscription.status === "ACTIVE") {
    return (subscription.paidUntil?.getTime() ?? 0) > now.getTime();
  }
  if (subscription.status === "TRIAL") {
    // Пробный без даты — номер ещё не подключён, ограничивать нечего.
    return subscription.trialEndsAt === null || subscription.trialEndsAt.getTime() > now.getTime();
  }
  return false;
}

export type OperationKind = "topup" | "message" | "subscription" | "correction";

/**
 * Движение по балансу одной транзакцией: баланс и запись в истории меняются
 * вместе, иначе после сбоя нельзя понять, где правда.
 */
export async function recordOperation(input: {
  organizationId: string;
  amount: number;
  kind: OperationKind;
  description: string;
  broadcastId?: string;
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: input.organizationId },
      data: { balance: { increment: input.amount } },
      select: { balance: true },
    });

    await tx.balanceOperation.create({
      data: {
        organizationId: input.organizationId,
        amount: input.amount,
        kind: input.kind,
        description: input.description,
        broadcastId: input.broadcastId ?? null,
        balanceAfter: organization.balance,
      },
    });

    return organization.balance;
  });
}

export async function listOperations(organizationId: string, take = 30) {
  return prisma.balanceOperation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function getBalance(organizationId: string): Promise<number> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { balance: true },
  });

  return organization?.balance ?? 0;
}

/** Номер счёта: год и порядковый номер в нём — так его называют в банке. */
async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count({
    where: { number: { startsWith: `${year}-` } },
  });

  return `${year}-${String(count + 1).padStart(4, "0")}`;
}

export type InvoiceMethod = "kaspi" | "bank";

export async function createTopUpInvoice(input: {
  organizationId: string;
  amount: number;
  method: InvoiceMethod;
}) {
  if (input.amount <= 0) {
    throw new Error("Сумма пополнения должна быть больше нуля.");
  }

  return prisma.invoice.create({
    data: {
      organizationId: input.organizationId,
      number: await nextInvoiceNumber(),
      kind: "topup",
      amount: input.amount,
      description: `Пополнение баланса на сообщения`,
      method: input.method,
    },
  });
}

export async function createSubscriptionInvoice(input: {
  organizationId: string;
  planCode: string;
  months: Period;
  operators: number;
  method: InvoiceMethod;
}) {
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.active) {
    throw new Error("Тариф не найден.");
  }

  const price = subscriptionPrice(plan, input.months, input.operators);

  return prisma.invoice.create({
    data: {
      organizationId: input.organizationId,
      number: await nextInvoiceNumber(),
      kind: "subscription",
      amount: price.total,
      description: `Тариф «${plan.name}», ${input.months} мес.`,
      method: input.method,
      planCode: plan.code,
      periodMonths: input.months,
    },
  });
}

export async function listInvoices(organizationId: string, take = 20) {
  return prisma.invoice.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Проводит оплату счёта. Пока это делается вручную: Kaspi и банк вызовут
 * ровно эту функцию, когда деньги дойдут, — остальной код не изменится.
 */
export async function markInvoicePaid(organizationId: string, invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId, status: "PENDING" },
  });

  if (!invoice) {
    return;
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  if (invoice.kind === "topup") {
    await recordOperation({
      organizationId,
      amount: invoice.amount,
      kind: "topup",
      description: `Пополнение по счёту №${invoice.number}`,
    });
    return;
  }

  if (invoice.kind === "subscription" && invoice.planCode && invoice.periodMonths) {
    const plan = await prisma.plan.findUnique({ where: { code: invoice.planCode } });
    if (!plan) {
      return;
    }

    const current = await getSubscription(organizationId);
    // Оплата продлевает от текущей даты окончания, если она ещё не прошла:
    // клиент, заплативший заранее, не должен терять оплаченные дни.
    const from =
      current.paidUntil && current.paidUntil.getTime() > Date.now() ? current.paidUntil : new Date();
    const paidUntil = new Date(from);
    paidUntil.setMonth(paidUntil.getMonth() + invoice.periodMonths);

    await prisma.subscription.update({
      where: { organizationId },
      data: {
        planId: plan.id,
        status: "ACTIVE",
        periodMonths: invoice.periodMonths,
        paidUntil,
      },
    });
  }
}

export async function cancelInvoice(organizationId: string, invoiceId: string): Promise<void> {
  await prisma.invoice.updateMany({
    where: { id: invoiceId, organizationId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}
