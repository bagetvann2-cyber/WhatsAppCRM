import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { POST } from "@/app/api/webhook/route";
import { prisma } from "@/lib/db";

const secret = "post-secret";
const waId = "77015554433";

beforeAll(() => {
  process.env.WHATSAPP_APP_SECRET = secret;
});

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-POST" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-POST" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

function payload(wamid: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "1555", phone_number_id: "PNID-POST" },
              contacts: [{ profile: { name: "Дана" }, wa_id: waId }],
              messages: [
                {
                  from: waId,
                  id: wamid,
                  timestamp: "1755300000",
                  type: "text",
                  text: { body: "Привет" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function request(body: unknown, key = secret): Request {
  const raw = JSON.stringify(body);
  const signature = "sha256=" + crypto.createHmac("sha256", key).update(raw, "utf8").digest("hex");
  return new Request("https://example.com/api/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body: raw,
  });
}

test("сохраняет сообщение и отвечает 200", async () => {
  const response = await POST(request(payload("wamid.POST.1")));
  expect(response.status).toBe(200);

  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.POST.1" } });
  expect(stored?.text).toBe("Привет");
});

test("отклоняет запрос с чужой подписью и ничего не пишет", async () => {
  const response = await POST(request(payload("wamid.POST.2"), "wrong-secret"));
  expect(response.status).toBe(403);

  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.POST.2" } });
  expect(stored).toBeNull();
});

test("повторная доставка возвращает 200 и не создаёт дубль", async () => {
  await POST(request(payload("wamid.POST.3")));
  const second = await POST(request(payload("wamid.POST.3")));

  expect(second.status).toBe(200);
  expect(await prisma.message.count({ where: { wamid: "wamid.POST.3" } })).toBe(1);
});

test("неизвестная структура не роняет обработчик", async () => {
  const response = await POST(request({ object: "whatsapp_business_account", entry: [] }));
  expect(response.status).toBe(200);
});
