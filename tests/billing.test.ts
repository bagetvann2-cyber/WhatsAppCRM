import { afterAll, beforeEach, expect, test, vi } from "vitest";
import {
  balanceLevel,
  canAfford,
  daysLeft,
  extraOperatorsCost,
  periodDiscount,
  subscriptionPrice,
} from "@/lib/billing";
import {
  createSubscriptionInvoice,
  createTopUpInvoice,
  ensurePlans,
  getBalance,
  getSubscription,
  isSubscriptionActive,
  listOperations,
  markInvoicePaid,
  recordOperation,
  startTrial,
} from "@/lib/billing-store";
import { applyRecipientStatus, createBroadcast, runBroadcast } from "@/lib/broadcasts";
import { prisma } from "@/lib/db";
import { saveIncomingMessage } from "@/lib/ingest";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-BILL";
let organizationId: string;
let channelId: string;
let templateId: string;

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/client", () => ({
  sendTemplateMessage: sendMock,
  sendTextMessage: vi.fn(),
}));

const START = { monthlyPrice: 19990, operatorsIncluded: 3, extraOperatorPrice: 5000 };

beforeEach(async () => {
  sendMock.mockReset();
  let counter = 0;
  sendMock.mockImplementation(async () => ({ wamid: `${phoneNumberId}.CAST.${++counter}` }));

  await dropTestOrg(phoneNumberId);
  const testOrg = await createTestOrg(phoneNumberId);
  organizationId = testOrg.id;
  channelId = testOrg.channelId;
  await ensurePlans();

  const template = await prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "akciya_bill",
      language: "ru",
      category: "MARKETING",
      bodyText: "{{1}}, скидка 20%.",
      examples: ["Айгерим"],
      status: "APPROVED",
    },
  });
  templateId = template.id;

  await prisma.contact.createMany({
    data: [
      { organizationId, channelId, externalUserId: "77010001001", name: "Айгерим" },
      { organizationId, channelId, externalUserId: "77010001002", name: "Ержан" },
    ],
  });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("скидка за период считается от всей суммы подписки", () => {
  expect(periodDiscount(1)).toBe(0);
  expect(periodDiscount(6)).toBe(0.1);
  expect(periodDiscount(12)).toBe(0.2);
  expect(periodDiscount(3)).toBe(0);

  const month = subscriptionPrice(START, 1, 3);
  expect(month.total).toBe(19990);

  const year = subscriptionPrice(START, 12, 3);
  expect(year.base).toBe(239880);
  expect(year.discount).toBe(47976);
  expect(year.total).toBe(191904);
});

test("сотрудники сверх тарифа считаются и попадают под скидку", () => {
  expect(extraOperatorsCost(START, 3)).toBe(0);
  expect(extraOperatorsCost(START, 5)).toBe(10000);

  const half = subscriptionPrice(START, 6, 5);
  expect(half.perMonth).toBe(29990);
  expect(half.base).toBe(179940);
  expect(half.total).toBe(161946);
});

test("уровень баланса и остаток дней", () => {
  expect(balanceLevel(0)).toBe("empty");
  expect(balanceLevel(-100)).toBe("empty");
  expect(balanceLevel(500)).toBe("low");
  expect(balanceLevel(50000)).toBe("ok");

  expect(canAfford(1000, 999)).toBe(true);
  expect(canAfford(1000, 1001)).toBe(false);

  const now = new Date("2026-08-18T10:00:00Z");
  expect(daysLeft(new Date("2026-08-25T10:00:00Z"), now)).toBe(7);
  expect(daysLeft(new Date("2026-08-01T10:00:00Z"), now)).toBe(0);
  expect(daysLeft(null, now)).toBeNull();
});

test("пробный период начинается с первого сообщения, а не с регистрации", async () => {
  const before = await getSubscription(organizationId);
  expect(before.status).toBe("TRIAL");
  expect(before.trialEndsAt).toBeNull();
  // Пока номер не подключён, кабинет не ограничен
  expect(isSubscriptionActive(before)).toBe(true);

  await saveIncomingMessage({
    wamid: `${phoneNumberId}.IN.1`,
    from: "77010001001",
    profileName: "Айгерим",
    phoneNumberId,
    type: "text",
    text: "Здравствуйте",
    media: null,
    timestamp: new Date(),
  });

  const after = await getSubscription(organizationId);
  expect(after.trialEndsAt).not.toBeNull();

  // Второе сообщение часы не перезапускает
  const stamp = after.trialEndsAt!.getTime();
  await startTrial(organizationId);
  const again = await getSubscription(organizationId);
  expect(again.trialEndsAt!.getTime()).toBe(stamp);
});

test("просроченная подписка перестаёт быть действующей", () => {
  const past = new Date(Date.now() - 3600 * 1000);
  const future = new Date(Date.now() + 3600 * 1000);

  expect(isSubscriptionActive({ status: "TRIAL", trialEndsAt: future, paidUntil: null })).toBe(true);
  expect(isSubscriptionActive({ status: "TRIAL", trialEndsAt: past, paidUntil: null })).toBe(false);
  expect(isSubscriptionActive({ status: "ACTIVE", trialEndsAt: null, paidUntil: future })).toBe(true);
  expect(isSubscriptionActive({ status: "ACTIVE", trialEndsAt: null, paidUntil: past })).toBe(false);
  expect(isSubscriptionActive({ status: "EXPIRED", trialEndsAt: future, paidUntil: future })).toBe(
    false,
  );
});

test("операции меняют баланс и остаются в истории", async () => {
  expect(await getBalance(organizationId)).toBe(0);

  expect(
    await recordOperation({
      organizationId,
      amount: 25000,
      kind: "topup",
      description: "Пополнение",
    }),
  ).toBe(25000);

  expect(
    await recordOperation({
      organizationId,
      amount: -22,
      kind: "message",
      description: "Доставлено сообщение",
    }),
  ).toBe(24978);

  const operations = await listOperations(organizationId);
  expect(operations).toHaveLength(2);
  expect(operations[0].balanceAfter).toBe(24978);
});

test("оплата счёта пополняет баланс, повторная — нет", async () => {
  const invoice = await createTopUpInvoice({ organizationId, amount: 10000, method: "kaspi" });

  await markInvoicePaid(organizationId, invoice.id);
  expect(await getBalance(organizationId)).toBe(10000);

  // Вебхук платёжной системы может прийти дважды — второй раз денег не даём
  await markInvoicePaid(organizationId, invoice.id);
  expect(await getBalance(organizationId)).toBe(10000);
});

test("оплата тарифа включает подписку до нужной даты", async () => {
  const invoice = await createSubscriptionInvoice({
    organizationId,
    planCode: "start",
    months: 6,
    operators: 3,
    method: "bank",
  });

  expect(invoice.amount).toBe(subscriptionPrice(START, 6, 3).total);

  await markInvoicePaid(organizationId, invoice.id);

  const subscription = await getSubscription(organizationId);
  expect(subscription.status).toBe("ACTIVE");
  expect(subscription.plan.code).toBe("start");
  expect(daysLeft(subscription.paidUntil)).toBeGreaterThan(175);
});

test("чужой счёт оплатить нельзя", async () => {
  const stranger = await createTestOrg("PNID-BILL-2");
  const invoice = await createTopUpInvoice({
    organizationId: stranger.id,
    amount: 10000,
    method: "kaspi",
  });

  await markInvoicePaid(organizationId, invoice.id);

  expect(await getBalance(organizationId)).toBe(0);
  expect(await getBalance(stranger.id)).toBe(0);

  await dropTestOrg("PNID-BILL-2");
});

test("рассылка не запускается, когда денег не хватает", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Акция" });

  await expect(runBroadcast(organizationId, broadcast.id)).rejects.toThrow(/баланс/i);
  expect(sendMock).not.toHaveBeenCalled();

  const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: broadcast.id } });
  expect(after.status).toBe("DRAFT");
});

test("деньги списываются за доставленное сообщение, а не за отправленное", async () => {
  await recordOperation({
    organizationId,
    amount: 25000,
    kind: "topup",
    description: "Пополнение",
  });

  const broadcast = await createBroadcast({ organizationId, templateId, name: "Акция" });
  await runBroadcast(organizationId, broadcast.id);

  // Отправлено, но не доставлено — денег не берём
  expect(await getBalance(organizationId)).toBe(25000);

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
  });

  await applyRecipientStatus(recipients[0].wamid!, "delivered");
  expect(await getBalance(organizationId)).toBe(25000 - 22);

  // Повторный вебхук о доставке второй раз не списывает
  await applyRecipientStatus(recipients[0].wamid!, "delivered");
  expect(await getBalance(organizationId)).toBe(25000 - 22);

  // Прочитано — тот же платный факт доставки, повторного списания нет
  await applyRecipientStatus(recipients[0].wamid!, "read");
  expect(await getBalance(organizationId)).toBe(25000 - 22);

  const operations = await listOperations(organizationId);
  expect(operations[0].broadcastId).toBe(broadcast.id);
});
