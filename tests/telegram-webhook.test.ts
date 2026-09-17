import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { POST } from "@/app/api/webhook/telegram/[channelId]/route";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { createTestTelegramOrg, dropTestTelegramOrg } from "./helpers";

const botId = "TG-BOT-WEBHOOK";
const secret = "webhook-secret";
let organizationId: string;
let channelId: string;

beforeAll(async () => {
  await dropTestTelegramOrg(botId);
  const testOrg = await createTestTelegramOrg(botId);
  organizationId = testOrg.id;
  channelId = testOrg.channelId;
  await prisma.channel.update({
    where: { id: channelId },
    data: { credentialsEncrypted: encryptJson({ botToken: "123:TOKEN", webhookSecret: secret }) },
  });
});

afterEach(async () => {
  await prisma.message.deleteMany({ where: { conversation: { organizationId } } });
  await prisma.conversation.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await dropTestTelegramOrg(botId);
  await prisma.$disconnect();
});

function update(messageId: number, text: string, chatId = 555) {
  return {
    update_id: messageId,
    message: {
      message_id: messageId,
      from: { id: chatId, first_name: "Дана" },
      chat: { id: chatId, type: "private" },
      date: 1755300000,
      text,
    },
  };
}

function request(body: unknown, secretHeader = secret): Request {
  return new Request(`https://example.com/api/webhook/telegram/${channelId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secretHeader },
    body: JSON.stringify(body),
  });
}

function context() {
  return { params: Promise.resolve({ channelId }) };
}

test("сохраняет сообщение и отвечает 200", async () => {
  const response = await POST(request(update(1, "Привет")), context());
  expect(response.status).toBe(200);

  const stored = await prisma.message.findUnique({
    where: { channelId_externalMessageId: { channelId, externalMessageId: "1" } },
  });
  expect(stored?.text).toBe("Привет");
});

test("отклоняет запрос с чужим секретом и ничего не пишет", async () => {
  const response = await POST(request(update(2, "Чужой"), "wrong-secret"), context());
  expect(response.status).toBe(403);

  const stored = await prisma.message.findUnique({
    where: { channelId_externalMessageId: { channelId, externalMessageId: "2" } },
  });
  expect(stored).toBeNull();
});

test("на неизвестный channelId в пути отвечает 404", async () => {
  const response = await POST(request(update(3, "Куда-то")), { params: Promise.resolve({ channelId: "нет-такого" }) });
  expect(response.status).toBe(404);
});

test("повторная доставка возвращает 200 и не создаёт дубль", async () => {
  await POST(request(update(4, "Ещё раз")), context());
  const second = await POST(request(update(4, "Ещё раз")), context());

  expect(second.status).toBe(200);
  expect(await prisma.message.count({ where: { channelId, externalMessageId: "4" } })).toBe(1);
});
