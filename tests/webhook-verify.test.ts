import { beforeAll, expect, test } from "vitest";
import { GET } from "@/app/api/webhook/route";

beforeAll(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
});

function get(params: Record<string, string>): Request {
  const url = new URL("https://example.com/api/webhook");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

test("возвращает challenge при верном токене", async () => {
  const response = await GET(
    get({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("12345");
});

test("отвечает 403 при неверном токене", async () => {
  const response = await GET(
    get({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(403);
});

test("отвечает 403 при неверном режиме", async () => {
  const response = await GET(
    get({ "hub.mode": "unsubscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(403);
});
