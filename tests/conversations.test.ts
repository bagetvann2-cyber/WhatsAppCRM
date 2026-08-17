import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { getConversation, listConversations } from "@/lib/conversations";

const phoneNumberId = "PNID-LIST";
const waIds = ["77011110001", "77011110002"];

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId } });
  await prisma.contact.deleteMany({ where: { waId: { in: waIds } } });
}

async function seed() {
  const aigerim = await prisma.contact.create({ data: { waId: waIds[0], name: "Айгерим" } });
  const yerzhan = await prisma.contact.create({ data: { waId: waIds[1], name: "Ержан" } });

  const older = await prisma.conversation.create({
    data: {
      contactId: yerzhan.id,
      phoneNumberId,
      lastMessageAt: new Date("2026-08-15T10:00:00Z"),
    },
  });
  const newer = await prisma.conversation.create({
    data: {
      contactId: aigerim.id,
      phoneNumberId,
      lastMessageAt: new Date("2026-08-16T10:00:00Z"),
    },
  });

  await prisma.message.create({
    data: {
      wamid: "wamid.LIST.1",
      conversationId: newer.id,
      direction: "INBOUND",
      type: "text",
      text: "Есть места на пломбирование?",
      timestamp: new Date("2026-08-16T10:00:00Z"),
    },
  });
  await prisma.message.create({
    data: {
      wamid: "wamid.LIST.2",
      conversationId: older.id,
      direction: "INBOUND",
      type: "text",
      text: "Спасибо, всё получил",
      timestamp: new Date("2026-08-15T10:00:00Z"),
    },
  });

  return { newer, older };
}

beforeEach(async () => {
  await cleanup();
  await seed();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function listInScope(query?: string) {
  const all = await listConversations(query);
  return all.filter((conversation) => conversation.phoneNumberId === phoneNumberId);
}

test("без запроса возвращает диалоги, свежие сверху", async () => {
  const result = await listInScope();

  expect(result).toHaveLength(2);
  expect(result[0].contact.name).toBe("Айгерим");
  expect(result[1].contact.name).toBe("Ержан");
});

test("отдаёт только последнее сообщение для превью", async () => {
  const result = await listInScope();
  expect(result[0].messages).toHaveLength(1);
  expect(result[0].messages[0].text).toBe("Есть места на пломбирование?");
});

test("находит по имени независимо от регистра", async () => {
  const result = await listInScope("айгерим");
  expect(result).toHaveLength(1);
  expect(result[0].contact.name).toBe("Айгерим");
});

test("находит по части номера", async () => {
  const result = await listInScope("110002");
  expect(result).toHaveLength(1);
  expect(result[0].contact.name).toBe("Ержан");
});

test("находит по тексту переписки", async () => {
  const result = await listInScope("пломбирование");
  expect(result).toHaveLength(1);
  expect(result[0].contact.name).toBe("Айгерим");
});

test("на бессмысленный запрос возвращает пусто, а не всё подряд", async () => {
  const result = await listInScope("зззз");
  expect(result).toHaveLength(0);
});

test("пробелы вокруг запроса не ломают поиск", async () => {
  const result = await listInScope("  Ержан  ");
  expect(result).toHaveLength(1);
});

test("getConversation отдаёт переписку по возрастанию времени", async () => {
  const [newest] = await listInScope();
  const thread = await getConversation(newest.id);

  expect(thread?.contact.name).toBe("Айгерим");
  expect(thread?.messages.map((message) => message.text)).toEqual([
    "Есть места на пломбирование?",
  ]);
});

test("getConversation возвращает null для неизвестного диалога", async () => {
  expect(await getConversation("нет-такого")).toBeNull();
});
