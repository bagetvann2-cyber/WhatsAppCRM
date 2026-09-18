import { afterEach, expect, test, vi } from "vitest";
import { getMe, sendMessage, setWebhook } from "@/lib/telegram/client";

const botToken = "123:TEST-TOKEN";

afterEach(() => {
  vi.restoreAllMocks();
});

test("getMe возвращает id и username бота", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { id: 987654321, username: "test_bot" } }), {
        status: 200,
      }),
    ),
  );

  const result = await getMe(botToken);
  expect(result).toEqual({ id: "987654321", username: "test_bot" });
});

test("sendMessage шлёт корректный запрос и возвращает messageId", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendMessage(botToken, "555", "Добрый день");

  expect(result).toEqual({ messageId: "42" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`https://api.telegram.org/bot${botToken}/sendMessage`);
  expect(JSON.parse(init.body)).toEqual({ chat_id: "555", text: "Добрый день" });
});

test("бросает ошибку с текстом Telegram при отказе", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 }),
    ),
  );

  await expect(sendMessage(botToken, "555", "Тест")).rejects.toThrow("Unauthorized");
});

test("setWebhook отправляет url и секрет", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await setWebhook(botToken, "https://example.com/hook", "shh");

  const [, init] = fetchMock.mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({ url: "https://example.com/hook", secret_token: "shh" });
});
