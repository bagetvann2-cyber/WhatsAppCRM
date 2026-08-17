import { afterAll, afterEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/messages/route";
import { prisma } from "@/lib/db";

const waId = "77012223344";

async function seed(windowExpiresAt: Date) {
  const contact = await prisma.contact.create({ data: { waId, name: "Ержан" } });
  return prisma.conversation.create({
    data: { contactId: contact.id, phoneNumberId: "PNID-OUT", windowExpiresAt },
  });
}

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-OUT" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-OUT" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function request(body: unknown): Request {
  return new Request("https://example.com/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("отправляет сообщение и сохраняет его как исходящее", async () => {
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
  const conversation = await seed(new Date(Date.now() - 1000));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(request({ conversationId: conversation.id, text: "Поздно" }));

  expect(response.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("отказывает при пустом тексте", async () => {
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));
  const response = await POST(request({ conversationId: conversation.id, text: "   " }));
  expect(response.status).toBe(400);
});

test("отказывает при неизвестном диалоге", async () => {
  const response = await POST(request({ conversationId: "нет-такого", text: "Привет" }));
  expect(response.status).toBe(400);
});
