import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { applyStatusUpdate, saveIncomingMessage, type ChannelIncomingMessage } from "@/lib/ingest";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-INGEST";
const waId = "77019998877";
let organizationId: string;
let channelId: string;

const base: ChannelIncomingMessage = {
  channelType: "WHATSAPP",
  channelExternalId: phoneNumberId,
  externalMessageId: "wamid.INGEST.1",
  from: waId,
  profileName: "Айбек",
  type: "text",
  text: "Первое сообщение",
  media: null,
  timestamp: new Date("2026-08-16T09:00:00Z"),
};

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  const testOrg = await createTestOrg(phoneNumberId);
  organizationId = testOrg.id;
  channelId = testOrg.channelId;
});

afterEach(async () => {
  await prisma.message.deleteMany({ where: { conversation: { organizationId } } });
  await prisma.conversation.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("создаёт контакт, диалог и сообщение в нужной компании", async () => {
  const result = await saveIncomingMessage(base);

  expect(result).toMatchObject({ stored: true, created: true, organizationId });

  const stored = await prisma.message.findUnique({
    where: { channelId_externalMessageId: { channelId, externalMessageId: base.externalMessageId } },
  });
  expect(stored?.text).toBe("Первое сообщение");

  const contact = await prisma.contact.findUnique({
    where: { channelId_externalUserId: { channelId, externalUserId: waId } },
  });
  expect(contact?.name).toBe("Айбек");
});

test("сообщение на неизвестный номер не сохраняется", async () => {
  const result = await saveIncomingMessage({ ...base, channelExternalId: "PNID-ЧУЖОЙ" });

  expect(result).toEqual({ stored: false, reason: "unknown-number" });
  expect(
    await prisma.message.findUnique({
      where: { channelId_externalMessageId: { channelId, externalMessageId: base.externalMessageId } },
    }),
  ).toBeNull();
});

test("повторная доставка того же externalMessageId не создаёт дубль", async () => {
  await saveIncomingMessage(base);
  const second = await saveIncomingMessage(base);

  expect(second).toMatchObject({ stored: true, created: false });
  expect(
    await prisma.message.count({ where: { channelId, externalMessageId: base.externalMessageId } }),
  ).toBe(1);
});

test("второе сообщение попадает в тот же диалог и двигает окно 24 часа", async () => {
  const first = await saveIncomingMessage(base);
  const second = await saveIncomingMessage({
    ...base,
    externalMessageId: "wamid.INGEST.2",
    text: "Второе сообщение",
    timestamp: new Date("2026-08-16T11:00:00Z"),
  });

  if (!first.stored || !second.stored) {
    throw new Error("сообщения должны сохраниться");
  }
  expect(second.conversationId).toBe(first.conversationId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: first.conversationId },
  });
  expect(conversation?.windowExpiresAt?.toISOString()).toBe("2026-08-17T11:00:00.000Z");
});

test("одинаковый номер клиента в разных компаниях — разные контакты", async () => {
  const other = await createTestOrg("PNID-INGEST-2", "Вторая компания");

  await saveIncomingMessage(base);
  await saveIncomingMessage({
    ...base,
    externalMessageId: "wamid.INGEST.OTHER",
    channelExternalId: "PNID-INGEST-2",
  });

  const contacts = await prisma.contact.findMany({ where: { externalUserId: waId } });
  expect(contacts).toHaveLength(2);
  expect(new Set(contacts.map((c) => c.organizationId))).toEqual(
    new Set([organizationId, other.id]),
  );

  await dropTestOrg("PNID-INGEST-2");
});

test("статус доставки записывается в сообщение", async () => {
  await saveIncomingMessage(base);
  await applyStatusUpdate({
    externalMessageId: base.externalMessageId,
    status: "delivered",
    timestamp: new Date("2026-08-16T09:00:05Z"),
  });

  const stored = await prisma.message.findUnique({
    where: { channelId_externalMessageId: { channelId, externalMessageId: base.externalMessageId } },
  });
  expect(stored?.status).toBe("delivered");
});

test("статус для неизвестного externalMessageId не бросает ошибку", async () => {
  await expect(
    applyStatusUpdate({ externalMessageId: "wamid.NOPE", status: "read", timestamp: new Date() }),
  ).resolves.toBeUndefined();
});
