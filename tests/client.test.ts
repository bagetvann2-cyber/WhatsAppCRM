import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { sendTextMessage } from "@/lib/whatsapp/client";

beforeAll(() => {
  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID-SEND";
  process.env.GRAPH_API_VERSION = "v22.0";
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("шлёт корректный запрос и возвращает wamid", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.SENT" }] }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendTextMessage("77011234567", "Добрый день");

  expect(result.wamid).toBe("wamid.SENT");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v22.0/PNID-SEND/messages");
  expect(init.headers.Authorization).toBe("Bearer test-token");
  expect(JSON.parse(init.body)).toEqual({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "77011234567",
    type: "text",
    text: { preview_url: false, body: "Добрый день" },
  });
});

test("бросает ошибку с текстом от Meta при отказе", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Recipient not in allowed list" } }), {
        status: 400,
      }),
    ),
  );

  await expect(sendTextMessage("77010000000", "Тест")).rejects.toThrow(
    "Recipient not in allowed list",
  );
});
