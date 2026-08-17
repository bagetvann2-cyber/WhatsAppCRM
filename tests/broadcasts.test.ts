import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  applyRecipientStatus,
  countByStatus,
  createBroadcast,
  estimateCost,
  listBroadcasts,
  runBroadcast,
  selectRecipients,
  stopBroadcast,
  valuesForContact,
} from "@/lib/broadcasts";
import { createTag, toggleTag } from "@/lib/contacts";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-CAST";
let organizationId: string;
let templateId: string;

// Отправку подменяем: тесты не ходят в сеть.
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/client", () => ({ sendTemplateMessage: sendMock }));

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

beforeEach(async () => {
  sendMock.mockReset();
  let counter = 0;
  sendMock.mockImplementation(async () => ({ wamid: `wamid.CAST.${++counter}` }));

  // Рассылка не запускается без денег на балансе — это проверяется отдельно
  // в tests/billing.test.ts, а здесь речь про саму отправку.
  await prisma.organization.update({ where: { id: organizationId }, data: { balance: 100000 } });

  await prisma.broadcast.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
  await prisma.messageTemplate.deleteMany({ where: { organizationId } });

  const template = await prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "akciya_osen",
      language: "ru",
      category: "MARKETING",
      bodyText: "Здравствуйте, {{1}}! Скидка 20% до конца недели.",
      examples: ["Айгерим"],
      status: "APPROVED",
    },
  });
  templateId = template.id;

  await prisma.contact.createMany({
    data: [
      { organizationId, waId: "77010000001", name: "Айгерим" },
      { organizationId, waId: "77010000002", name: "Ержан" },
      { organizationId, waId: "77020000003", name: "Дана" },
    ],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("стоимость считается по категории шаблона", () => {
  expect(estimateCost(100, "MARKETING")).toBe(2200);
  expect(estimateCost(100, "UTILITY")).toBe(900);
  expect(estimateCost(0, "MARKETING")).toBe(0);
});

test("пустой сегмент — это все контакты компании", async () => {
  expect(await selectRecipients(organizationId)).toHaveLength(3);
});

test("сегмент фильтрует по имени и по номеру", async () => {
  expect(await selectRecipients(organizationId, { query: "Ержан" })).toHaveLength(1);
  expect(await selectRecipients(organizationId, { query: "7702" })).toHaveLength(1);
  expect(await selectRecipients(organizationId, { query: "нет такого" })).toHaveLength(0);
});

test("сегмент можно сузить меткой", async () => {
  const tag = await createTag(organizationId, "постоянный");
  const contacts = await prisma.contact.findMany({ where: { organizationId } });
  await toggleTag(organizationId, contacts[0].id, tag.id);

  expect(await selectRecipients(organizationId, { tagIds: [tag.id] })).toHaveLength(1);

  const broadcast = await createBroadcast({
    organizationId,
    templateId,
    name: "Только постоянным",
    segmentTagIds: [tag.id],
  });

  expect(await prisma.broadcastRecipient.count({ where: { broadcastId: broadcast.id } })).toBe(1);
});

test("имя контакта подставляется вместо первой переменной", () => {
  expect(valuesForContact(["Айгерим", "16:30"], { name: "Ержан" })).toEqual(["Ержан", "16:30"]);
  expect(valuesForContact(["Айгерим"], { name: null })).toEqual(["Айгерим"]);
  expect(valuesForContact(["Айгерим"], { name: "   " })).toEqual(["Айгерим"]);
  expect(valuesForContact([], { name: "Ержан" })).toEqual([]);
});

test("рассылка уходит с именем каждого получателя", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Именная" });
  await runBroadcast(organizationId, broadcast.id);

  const names = sendMock.mock.calls.map((call) => call[2][0]);
  expect(names).toEqual(["Айгерим", "Ержан", "Дана"]);
});

test("рассылка фиксирует получателей в момент создания", async () => {
  const broadcast = await createBroadcast({
    organizationId,
    templateId,
    name: "Осенняя акция",
  });

  expect(broadcast.status).toBe("DRAFT");

  // Контакт, добавленный после создания, в эту рассылку не попадёт.
  await prisma.contact.create({
    data: { organizationId, waId: "77010000009", name: "Поздний" },
  });

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
  });
  expect(recipients).toHaveLength(3);
});

test("по неодобренному шаблону рассылка не создаётся", async () => {
  await prisma.messageTemplate.update({
    where: { id: templateId },
    data: { status: "PENDING" },
  });

  await expect(createBroadcast({ organizationId, templateId, name: "Рано" })).rejects.toThrow(
    /одобренному Meta/i,
  );
});

test("рассылка по пустому сегменту не создаётся", async () => {
  await expect(
    createBroadcast({ organizationId, templateId, name: "Пусто", segmentQuery: "никого" }),
  ).rejects.toThrow(/нет ни одного контакта/i);
});

test("запуск отправляет всем и помечает отправленными", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Акция" });
  await runBroadcast(organizationId, broadcast.id);

  expect(sendMock).toHaveBeenCalledTimes(3);
  expect(sendMock.mock.calls[0][0]).toBe("77010000001");
  expect(sendMock.mock.calls[0][1]).toEqual({ name: "akciya_osen", language: "ru" });

  const after = await prisma.broadcast.findUniqueOrThrow({
    where: { id: broadcast.id },
    include: { recipients: true },
  });

  expect(after.status).toBe("DONE");
  expect(after.finishedAt).not.toBeNull();
  expect(after.recipients.every((r) => r.status === "SENT")).toBe(true);
  expect(after.recipients.every((r) => r.wamid !== null)).toBe(true);
});

test("ошибка отправки помечает получателя, но рассылку не роняет", async () => {
  sendMock.mockReset();
  sendMock
    .mockResolvedValueOnce({ wamid: "wamid.OK.1" })
    .mockRejectedValueOnce(new Error("Recipient not in allowed list"))
    .mockResolvedValueOnce({ wamid: "wamid.OK.2" });

  const broadcast = await createBroadcast({ organizationId, templateId, name: "С ошибкой" });
  await runBroadcast(organizationId, broadcast.id);

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
    orderBy: { id: "asc" },
  });

  const failed = recipients.filter((r) => r.status === "FAILED");
  expect(failed).toHaveLength(1);
  expect(failed[0].error).toContain("allowed list");
  expect(recipients.filter((r) => r.status === "SENT")).toHaveLength(2);
});

test("повторный запуск той же рассылки отклоняется", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Один раз" });
  await runBroadcast(organizationId, broadcast.id);

  await expect(runBroadcast(organizationId, broadcast.id)).rejects.toThrow(/уже запускалась/i);
  expect(sendMock).toHaveBeenCalledTimes(3);
});

test("остановка помечает причину и время", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Стоп" });
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "RUNNING" } });

  await stopBroadcast(organizationId, broadcast.id);

  const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: broadcast.id } });
  expect(after.status).toBe("STOPPED");
  expect(after.stoppedReason).toBe("Остановлена вручную");
  expect(after.finishedAt).not.toBeNull();
});

test("чужую рассылку остановить нельзя", async () => {
  const stranger = await createTestOrg("PNID-CAST-STRANGER", "Чужая");
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Своя" });
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { status: "RUNNING" } });

  await stopBroadcast(stranger.id, broadcast.id);

  const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: broadcast.id } });
  expect(after.status).toBe("RUNNING");

  await dropTestOrg("PNID-CAST-STRANGER");
});

test("статусы доставки из вебхука попадают в отчёт", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Отчёт" });
  await runBroadcast(organizationId, broadcast.id);

  const first = await prisma.broadcastRecipient.findFirstOrThrow({
    where: { broadcastId: broadcast.id },
  });

  await applyRecipientStatus(first.wamid!, "delivered");
  expect(
    (await prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: first.id } })).status,
  ).toBe("DELIVERED");

  await applyRecipientStatus(first.wamid!, "read");
  expect(
    (await prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: first.id } })).status,
  ).toBe("READ");

  // Запоздавший «доставлено» не должен откатить «прочитано»
  await applyRecipientStatus(first.wamid!, "delivered");
  expect(
    (await prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: first.id } })).status,
  ).toBe("READ");
});

test("сводка по статусам считается для отчёта", async () => {
  const broadcast = await createBroadcast({ organizationId, templateId, name: "Сводка" });
  await runBroadcast(organizationId, broadcast.id);

  const [item] = await listBroadcasts(organizationId);
  expect(countByStatus(item.recipients)).toEqual({
    PENDING: 0,
    SENT: 3,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    SKIPPED: 0,
  });
});
