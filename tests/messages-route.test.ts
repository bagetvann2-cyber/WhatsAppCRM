import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { POST } from "@/app/api/messages/route";
import { prisma } from "@/lib/db";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-OUT";
const waId = "77012223344";
let organizationId: string;

// Роут спрашивает, кто пришёл. В тестах подменяем ответ, чтобы не поднимать куки и HTTP.
const currentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ currentUser: currentUserMock }));

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

async function seed(windowExpiresAt: Date) {
  const contact = await prisma.contact.create({
    data: { organizationId, waId, name: "Ержан" },
  });
  return prisma.conversation.create({
    data: { organizationId, contactId: contact.id, phoneNumberId, windowExpiresAt },
  });
}

function signedIn() {
  currentUserMock.mockResolvedValue({
    user: { id: "u1", email: "operator@test.kz" },
    organization: { id: organizationId, name: "Тест" },
    role: "OPERATOR",
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  currentUserMock.mockReset();
  await prisma.message.deleteMany({ where: { conversation: { organizationId } } });
  await prisma.conversation.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

function request(body: unknown): Request {
  return new Request("https://example.com/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("без входа в кабинет отправка запрещена", async () => {
  currentUserMock.mockResolvedValue(null);
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));

  const response = await POST(request({ conversationId: conversation.id, text: "Привет" }));

  expect(response.status).toBe(401);
});

test("в чужой диалог написать нельзя", async () => {
  const stranger = await createTestOrg("PNID-OUT-STRANGER", "Чужая компания");
  const strangerContact = await prisma.contact.create({
    data: { organizationId: stranger.id, waId: "77010000777" },
  });
  const strangerConversation = await prisma.conversation.create({
    data: {
      organizationId: stranger.id,
      contactId: strangerContact.id,
      phoneNumberId: "PNID-OUT-STRANGER",
      windowExpiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  signedIn();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    request({ conversationId: strangerConversation.id, text: "Чужому клиенту" }),
  );

  expect(response.status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();

  await dropTestOrg("PNID-OUT-STRANGER");
});

test("отправляет сообщение и сохраняет его как исходящее", async () => {
  signedIn();
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.OUT.1" }] }), { status: 200 }),
      ),
  );

  const response = await POST(request({ conversationId: conversation.id, text: "Готово" }));

  expect(response.status).toBe(200);
  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.OUT.1" } });
  expect(stored?.direction).toBe("OUTBOUND");
  expect(stored?.text).toBe("Готово");
});

test("отказывает при истёкшем окне 24 часа", async () => {
  signedIn();
  const conversation = await seed(new Date(Date.now() - 1000));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(request({ conversationId: conversation.id, text: "Поздно" }));

  expect(response.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("отказывает при пустом тексте", async () => {
  signedIn();
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));
  const response = await POST(request({ conversationId: conversation.id, text: "   " }));
  expect(response.status).toBe(400);
});

test("отказывает при неизвестном диалоге", async () => {
  signedIn();
  const response = await POST(request({ conversationId: "нет-такого", text: "Привет" }));
  expect(response.status).toBe(400);
});
