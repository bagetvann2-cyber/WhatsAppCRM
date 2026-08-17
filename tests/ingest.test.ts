import { afterAll, afterEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import type { IncomingMessage } from "@/lib/whatsapp/parse";

const waId = "77019998877";

const base: IncomingMessage = {
  wamid: "wamid.INGEST.1",
  from: waId,
  profileName: "Айбек",
  phoneNumberId: "PNID-INGEST",
  type: "text",
  text: "Первое сообщение",
  timestamp: new Date("2026-08-16T09:00:00Z"),
};

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-INGEST" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-INGEST" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

test("создаёт контакт, диалог и сообщение", async () => {
  const result = await saveIncomingMessage(base);

  expect(result.created).toBe(true);
  const stored = await prisma.message.findUnique({ where: { wamid: base.wamid } });
  expect(stored?.text).toBe("Первое сообщение");

  const contact = await prisma.contact.findUnique({ where: { waId } });
  expect(contact?.name).toBe("Айбек");
});

test("повторная доставка того же wamid не создаёт дубль", async () => {
  await saveIncomingMessage(base);
  const second = await saveIncomingMessage(base);

  expect(second.created).toBe(false);
  const count = await prisma.message.count({ where: { wamid: base.wamid } });
  expect(count).toBe(1);
});

test("второе сообщение попадает в тот же диалог и двигает окно 24 часа", async () => {
  const first = await saveIncomingMessage(base);
  const second = await saveIncomingMessage({
    ...base,
    wamid: "wamid.INGEST.2",
    text: "Второе сообщение",
    timestamp: new Date("2026-08-16T11:00:00Z"),
  });

  expect(second.conversationId).toBe(first.conversationId);

  const conversation = await prisma.conversation.findUnique({
    where: { id: first.conversationId },
  });
  expect(conversation?.windowExpiresAt?.toISOString()).toBe("2026-08-17T11:00:00.000Z");
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
