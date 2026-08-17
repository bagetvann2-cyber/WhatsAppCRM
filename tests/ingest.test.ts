import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import type { IncomingMessage } from "@/lib/whatsapp/parse";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-INGEST";
const waId = "77019998877";
let organizationId: string;

const base: IncomingMessage = {
  wamid: "wamid.INGEST.1",
  from: waId,
  profileName: "Айбек",
  phoneNumberId,
  type: "text",
  text: "Первое сообщение",
  timestamp: new Date("2026-08-16T09:00:00Z"),
};

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
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

  const stored = await prisma.message.findUnique({ where: { wamid: base.wamid } });
  expect(stored?.text).toBe("Первое сообщение");

  const contact = await prisma.contact.findUnique({
    where: { organizationId_waId: { organizationId, waId } },
  });
  expect(contact?.name).toBe("Айбек");
});

test("сообщение на неизвестный номер не сохраняется", async () => {
  const result = await saveIncomingMessage({ ...base, phoneNumberId: "PNID-ЧУЖОЙ" });

  expect(result).toEqual({ stored: false, reason: "unknown-number" });
  expect(await prisma.message.findUnique({ where: { wamid: base.wamid } })).toBeNull();
});

test("повторная доставка того же wamid не создаёт дубль", async () => {
  await saveIncomingMessage(base);
  const second = await saveIncomingMessage(base);

  expect(second).toMatchObject({ stored: true, created: false });
  expect(await prisma.message.count({ where: { wamid: base.wamid } })).toBe(1);
});

test("второе сообщение попадает в тот же диалог и двигает окно 24 часа", async () => {
  const first = await saveIncomingMessage(base);
  const second = await saveIncomingMessage({
    ...base,
    wamid: "wamid.INGEST.2",
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
    wamid: "wamid.INGEST.OTHER",
    phoneNumberId: "PNID-INGEST-2",
  });

  const contacts = await prisma.contact.findMany({ where: { waId } });
  expect(contacts).toHaveLength(2);
  expect(new Set(contacts.map((c) => c.organizationId))).toEqual(
    new Set([organizationId, other.id]),
  );

  await dropTestOrg("PNID-INGEST-2");
});

test("статус доставки записывается в сообщение", async () => {
  await saveIncomingMessage(base);
  await applyStatusUpdate({
    wamid: base.wamid,
    status: "delivered",
    timestamp: new Date("2026-08-16T09:00:05Z"),
  });

  const stored = await prisma.message.findUnique({ where: { wamid: base.wamid } });
  expect(stored?.status).toBe("delivered");
});

test("статус для неизвестного wamid не бросает ошибку", async () => {
  await expect(
    applyStatusUpdate({ wamid: "wamid.NOPE", status: "read", timestamp: new Date() }),
  ).resolves.toBeUndefined();
});
