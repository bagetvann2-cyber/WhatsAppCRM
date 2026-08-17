import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { countUnsubscribes, createBroadcast, runBroadcast, selectRecipients } from "@/lib/broadcasts";
import { prisma } from "@/lib/db";
import { saveIncomingMessage } from "@/lib/ingest";
import {
  countUnsubscribed,
  handleUnsubscribeMessage,
  isUnsubscribeRequest,
  setUnsubscribed,
} from "@/lib/unsubscribe";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-UNSUB";
let organizationId: string;
let marketingId: string;
let utilityId: string;

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/client", () => ({
  sendTemplateMessage: sendMock,
  sendTextMessage: vi.fn(),
}));

beforeEach(async () => {
  sendMock.mockReset();
  let counter = 0;
  sendMock.mockImplementation(async () => ({ wamid: `${phoneNumberId}.CAST.${++counter}` }));

  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
  // Здесь проверяется отписка, а не баланс: денег даём с запасом.
  await prisma.organization.update({ where: { id: organizationId }, data: { balance: 100000 } });

  const [marketing, utility] = await Promise.all([
    prisma.messageTemplate.create({
      data: {
        organizationId,
        name: "akciya",
        language: "ru",
        category: "MARKETING",
        bodyText: "{{1}}, скидка 20% до конца недели.",
        examples: ["Айгерим"],
        status: "APPROVED",
      },
    }),
    prisma.messageTemplate.create({
      data: {
        organizationId,
        name: "zapis",
        language: "ru",
        category: "UTILITY",
        bodyText: "{{1}}, вы записаны на приём.",
        examples: ["Айгерим"],
        status: "APPROVED",
      },
    }),
  ]);

  marketingId = marketing.id;
  utilityId = utility.id;

  await prisma.contact.create({ data: { organizationId, waId: "77010000011", name: "Айгерим" } });
  await prisma.contact.create({
    data: {
      organizationId,
      waId: "77010000012",
      name: "Ержан",
      unsubscribedAt: new Date(),
      unsubscribeSource: "написал сам",
    },
  });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("отпиской считается сообщение целиком, а не слово внутри", () => {
  expect(isUnsubscribeRequest("стоп")).toBe(true);
  expect(isUnsubscribeRequest("  СТОП!  ")).toBe(true);
  expect(isUnsubscribeRequest("Отписаться")).toBe(true);
  expect(isUnsubscribeRequest("stop promotions")).toBe(true);
  expect(isUnsubscribeRequest("тоқта")).toBe(true);

  // Вопрос о цене отпиской быть не должен
  expect(isUnsubscribeRequest("стоп, а сколько стоит?")).toBe(false);
  expect(isUnsubscribeRequest("сколько стоит чистка")).toBe(false);
  expect(isUnsubscribeRequest(null)).toBe(false);
});

test("сообщение «стоп» отписывает контакт", async () => {
  const result = await saveIncomingMessage({
    wamid: `${phoneNumberId}.IN.1`,
    from: "77010000013",
    profileName: "Дана",
    phoneNumberId,
    type: "text",
    text: "Стоп",
    media: null,
    timestamp: new Date(),
  });

  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }

  expect(
    await handleUnsubscribeMessage({
      organizationId,
      conversationId: result.conversationId,
      text: "Стоп",
    }),
  ).toBe(true);

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { organizationId_waId: { organizationId, waId: "77010000013" } },
  });
  expect(contact.unsubscribedAt).not.toBeNull();
  expect(contact.unsubscribeSource).toBe("написал сам");
});

test("обычное сообщение отпиской не считается", async () => {
  const result = await saveIncomingMessage({
    wamid: `${phoneNumberId}.IN.2`,
    from: "77010000011",
    profileName: "Айгерим",
    phoneNumberId,
    type: "text",
    text: "Сколько стоит чистка?",
    media: null,
    timestamp: new Date(),
  });

  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }

  expect(
    await handleUnsubscribeMessage({
      organizationId,
      conversationId: result.conversationId,
      text: "Сколько стоит чистка?",
    }),
  ).toBe(false);
});

test("реклама отписавшимся не уходит, а служебное сообщение — уходит", async () => {
  const forMarketing = await selectRecipients(organizationId, {}, { marketing: true });
  const forUtility = await selectRecipients(organizationId, {}, { marketing: false });

  expect(forMarketing.map((c) => c.waId)).toEqual(["77010000011"]);
  expect(forUtility).toHaveLength(2);
});

test("рекламная рассылка не берёт отписавшихся в получатели", async () => {
  const broadcast = await createBroadcast({
    organizationId,
    templateId: marketingId,
    name: "Акция",
  });

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
    include: { contact: true },
  });

  expect(recipients).toHaveLength(1);
  expect(recipients[0].contact.waId).toBe("77010000011");
});

test("служебная рассылка уходит и отписавшимся", async () => {
  const broadcast = await createBroadcast({
    organizationId,
    templateId: utilityId,
    name: "Напоминание о записи",
  });

  await runBroadcast(organizationId, broadcast.id);
  expect(sendMock).toHaveBeenCalledTimes(2);
});

test("отписка между созданием и запуском пропускает получателя без ошибки", async () => {
  const broadcast = await createBroadcast({
    organizationId,
    templateId: marketingId,
    name: "Акция",
  });

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { organizationId_waId: { organizationId, waId: "77010000011" } },
  });

  await setUnsubscribed({
    organizationId,
    contactId: contact.id,
    unsubscribed: true,
    source: "написал сам",
  });

  await runBroadcast(organizationId, broadcast.id);

  const recipients = await prisma.broadcastRecipient.findMany({
    where: { broadcastId: broadcast.id },
  });

  expect(sendMock).not.toHaveBeenCalled();
  expect(recipients[0].status).toBe("SKIPPED");
  // Пропуск не ошибка: рассылка должна завершиться нормально
  const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: broadcast.id } });
  expect(after.status).toBe("DONE");
});

test("оператор возвращает контакт в рассылки", async () => {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { organizationId_waId: { organizationId, waId: "77010000012" } },
  });

  expect(await countUnsubscribed(organizationId)).toBe(1);

  await setUnsubscribed({
    organizationId,
    contactId: contact.id,
    unsubscribed: false,
    source: "оператор",
  });

  const after = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  expect(after.unsubscribedAt).toBeNull();
  expect(after.unsubscribeSource).toBeNull();
  expect(await countUnsubscribed(organizationId)).toBe(0);
});

test("чужой контакт отписать нельзя", async () => {
  const stranger = await createTestOrg("PNID-UNSUB-2");
  const foreign = await prisma.contact.create({
    data: { organizationId: stranger.id, waId: "77010000099" },
  });

  expect(
    await setUnsubscribed({
      organizationId,
      contactId: foreign.id,
      unsubscribed: true,
      source: "оператор",
    }),
  ).toBe(false);

  const after = await prisma.contact.findUniqueOrThrow({ where: { id: foreign.id } });
  expect(after.unsubscribedAt).toBeNull();

  await dropTestOrg("PNID-UNSUB-2");
});

test("в отчёт идут отписки после запуска рассылки, а не все подряд", () => {
  const started = new Date("2026-08-18T10:00:00Z");

  expect(
    countUnsubscribes(
      [
        { contact: { unsubscribedAt: new Date("2026-08-18T10:05:00Z") } },
        { contact: { unsubscribedAt: new Date("2026-08-01T09:00:00Z") } },
        { contact: { unsubscribedAt: null } },
      ],
      started,
    ),
  ).toBe(1);

  expect(countUnsubscribes([{ contact: { unsubscribedAt: new Date() } }], null)).toBe(0);
});
