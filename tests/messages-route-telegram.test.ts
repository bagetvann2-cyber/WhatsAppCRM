import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { POST } from "@/app/api/messages/route";
import { encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { mediaMethodFor } from "@/lib/telegram/client";
import { createTestTelegramOrg, dropTestTelegramOrg } from "./helpers";

const botId = "TGBOT-FILES";
const chatId = "555001";
let organizationId: string;
let channelId: string;
let operatorId: string;

const currentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ currentUser: currentUserMock }));

beforeAll(async () => {
  await dropTestTelegramOrg(botId);
  const org = await createTestTelegramOrg(botId);
  organizationId = org.id;
  channelId = org.channelId;
  await prisma.channel.update({
    where: { id: channelId },
    data: { credentialsEncrypted: encryptJson({ botToken: "1:TEST", webhookSecret: "s" }) },
  });

  await prisma.user.deleteMany({ where: { email: "operator@tgfiles.test" } });
  const user = await prisma.user.create({
    data: { email: "operator@tgfiles.test", passwordHash: "x", name: "Оператор" },
  });
  operatorId = user.id;
  await prisma.membership.create({ data: { userId: operatorId, organizationId, role: "OPERATOR" } });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  currentUserMock.mockReset();
  await prisma.message.deleteMany({ where: { conversation: { organizationId } } });
  await prisma.conversation.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await dropTestTelegramOrg(botId);
  await prisma.user.deleteMany({ where: { email: "operator@tgfiles.test" } });
  await prisma.$disconnect();
});

test("метод отправки выбирается по типу файла", () => {
  expect(mediaMethodFor("image/png", 1000).method).toBe("sendPhoto");
  expect(mediaMethodFor("image/jpeg", 1000).method).toBe("sendPhoto");
  // Слишком большая картинка, gif и svg уходят документом — Telegram иначе их испортит или не примет.
  expect(mediaMethodFor("image/png", 11 * 1024 * 1024).method).toBe("sendDocument");
  expect(mediaMethodFor("image/gif", 1000).method).toBe("sendDocument");
  expect(mediaMethodFor("image/svg+xml", 1000).method).toBe("sendDocument");
  expect(mediaMethodFor("video/mp4", 1000).method).toBe("sendVideo");
  expect(mediaMethodFor("video/quicktime", 1000).method).toBe("sendDocument");
  expect(mediaMethodFor("audio/mpeg", 1000).method).toBe("sendAudio");
  expect(mediaMethodFor("audio/ogg", 1000).method).toBe("sendDocument");
  expect(mediaMethodFor("application/pdf", 1000).method).toBe("sendDocument");
});

test("файл уходит в Telegram и сохраняется в переписке с копией", async () => {
  currentUserMock.mockResolvedValue({
    user: { id: operatorId, email: "operator@tgfiles.test" },
    organization: { id: organizationId, name: "Тест" },
    role: "OPERATOR",
  });
  const contact = await prisma.contact.create({
    data: { organizationId, channelId, externalUserId: chatId, name: "Клиент" },
  });
  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId: contact.id, channelId },
  });

  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const form = new FormData();
  form.append("conversationId", conversation.id);
  form.append("caption", "Вот прайс");
  form.append("file", new File([new Uint8Array([137, 80, 78, 71])], "price.png", { type: "image/png" }));

  const response = await POST(new Request("https://example.com/api/messages", { method: "POST", body: form }));

  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot1:TEST/sendPhoto");
  const sent = fetchMock.mock.calls[0][1].body as FormData;
  expect(sent.get("chat_id")).toBe(chatId);
  expect(sent.get("caption")).toBe("Вот прайс");
  expect((sent.get("photo") as File).name).toBe("price.png");

  const stored = await prisma.message.findUniqueOrThrow({
    where: { channelId_externalMessageId: { channelId, externalMessageId: "77" } },
  });
  expect(stored).toMatchObject({ direction: "OUTBOUND", type: "image", text: "Вот прайс", mediaId: null });
  expect(stored.mediaPath).toBeTruthy();
});
