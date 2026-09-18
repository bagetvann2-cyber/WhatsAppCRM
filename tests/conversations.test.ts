import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { getConversation, listConversations } from "@/lib/conversations";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-LIST";
const otherPhoneNumberId = "PNID-LIST-OTHER";
let organizationId: string;
let otherOrganizationId: string;

async function seed() {
  await dropTestOrg(phoneNumberId);
  await dropTestOrg(otherPhoneNumberId);

  const org = await createTestOrg(phoneNumberId, "Клиника");
  const otherOrg = await createTestOrg(otherPhoneNumberId, "Салон");
  organizationId = org.id;
  otherOrganizationId = otherOrg.id;

  const aigerim = await prisma.contact.create({
    data: { organizationId, channelId: org.channelId, externalUserId: "77011110001", name: "Айгерим" },
  });
  const yerzhan = await prisma.contact.create({
    data: { organizationId, channelId: org.channelId, externalUserId: "77011110002", name: "Ержан" },
  });

  const older = await prisma.conversation.create({
    data: {
      organizationId,
      contactId: yerzhan.id,
      channelId: org.channelId,
      lastMessageAt: new Date("2026-08-15T10:00:00Z"),
    },
  });
  const newer = await prisma.conversation.create({
    data: {
      organizationId,
      contactId: aigerim.id,
      channelId: org.channelId,
      lastMessageAt: new Date("2026-08-16T10:00:00Z"),
    },
  });

  await prisma.message.createMany({
    data: [
      {
        externalMessageId: "wamid.LIST.1",
        channelId: org.channelId,
        conversationId: newer.id,
        direction: "INBOUND",
        type: "text",
        text: "Есть места на пломбирование?",
        timestamp: new Date("2026-08-16T10:00:00Z"),
      },
      {
        externalMessageId: "wamid.LIST.2",
        channelId: org.channelId,
        conversationId: older.id,
        direction: "INBOUND",
        type: "text",
        text: "Спасибо, всё получил",
        timestamp: new Date("2026-08-15T10:00:00Z"),
      },
    ],
  });

  // Чужая компания с похожими данными — она не должна попадать в выдачу.
  const stranger = await prisma.contact.create({
    data: {
      organizationId: otherOrganizationId,
      channelId: otherOrg.channelId,
      externalUserId: "77011110001",
      name: "Айгерим",
    },
  });
  const strangerConversation = await prisma.conversation.create({
    data: {
      organizationId: otherOrganizationId,
      contactId: stranger.id,
      channelId: otherOrg.channelId,
      lastMessageAt: new Date("2026-08-17T10:00:00Z"),
    },
  });
  await prisma.message.create({
    data: {
      externalMessageId: "wamid.LIST.STRANGER",
      channelId: otherOrg.channelId,
      conversationId: strangerConversation.id,
      direction: "INBOUND",
      type: "text",
      text: "Есть места на пломбирование?",
      timestamp: new Date("2026-08-17T10:00:00Z"),
    },
  });

  return { newer, strangerConversation };
}

let fixtures: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  fixtures = await seed();
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await dropTestOrg(otherPhoneNumberId);
  await prisma.$disconnect();
});

test("без запроса возвращает диалоги компании, свежие сверху", async () => {
  const result = await listConversations(organizationId);

  expect(result).toHaveLength(2);
  expect(result[0].contact.name).toBe("Айгерим");
  expect(result[1].contact.name).toBe("Ержан");
});

test("диалоги чужой компании в выдачу не попадают", async () => {
  const mine = await listConversations(organizationId);
  expect(mine.map((c) => c.organizationId)).toEqual([organizationId, organizationId]);

  const theirs = await listConversations(otherOrganizationId);
  expect(theirs).toHaveLength(1);
});

test("поиск не достаёт чужую переписку с тем же текстом", async () => {
  const result = await listConversations(organizationId, "пломбирование");

  expect(result).toHaveLength(1);
  expect(result[0].organizationId).toBe(organizationId);
});

test("отдаёт только последнее сообщение для превью", async () => {
  const result = await listConversations(organizationId);
  expect(result[0].messages).toHaveLength(1);
  expect(result[0].messages[0].text).toBe("Есть места на пломбирование?");
});

test("находит по имени независимо от регистра", async () => {
  const result = await listConversations(organizationId, "айгерим");
  expect(result).toHaveLength(1);
  expect(result[0].contact.name).toBe("Айгерим");
});

test("находит по части номера", async () => {
  const result = await listConversations(organizationId, "110002");
  expect(result).toHaveLength(1);
  expect(result[0].contact.name).toBe("Ержан");
});

test("на бессмысленный запрос возвращает пусто, а не всё подряд", async () => {
  expect(await listConversations(organizationId, "зззз")).toHaveLength(0);
});

test("пробелы вокруг запроса не ломают поиск", async () => {
  expect(await listConversations(organizationId, "  Ержан  ")).toHaveLength(1);
});

test("getConversation отдаёт переписку по возрастанию времени", async () => {
  const thread = await getConversation(organizationId, fixtures.newer.id);

  expect(thread?.contact.name).toBe("Айгерим");
  expect(thread?.messages.map((m) => m.text)).toEqual(["Есть места на пломбирование?"]);
});

test("чужой диалог не открывается даже по прямому id", async () => {
  expect(await getConversation(organizationId, fixtures.strangerConversation.id)).toBeNull();
  expect(await getConversation(organizationId, "нет-такого")).toBeNull();
});
