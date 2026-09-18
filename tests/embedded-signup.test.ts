import { afterEach, beforeAll, expect, test, vi } from "vitest";
import {
  exchangeCodeForToken,
  fetchPhoneNumberInfo,
  registerPhoneNumber,
  subscribeWaba,
} from "@/lib/whatsapp/embedded-signup";

beforeAll(() => {
  process.env.GRAPH_API_VERSION = "v22.0";
  process.env.NEXT_PUBLIC_WHATSAPP_APP_ID = "test-app-id";
  process.env.WHATSAPP_APP_SECRET = "test-app-secret";
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("обменивает code на access_token с правильными параметрами", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "TOKEN" })));
  vi.stubGlobal("fetch", fetchMock);

  const result = await exchangeCodeForToken("auth-code-123");

  expect(result).toEqual({ accessToken: "TOKEN" });
  const [url] = fetchMock.mock.calls[0];
  const parsed = new URL(String(url));
  expect(parsed.pathname).toBe("/v22.0/oauth/access_token");
  expect(parsed.searchParams.get("client_id")).toBe("test-app-id");
  expect(parsed.searchParams.get("client_secret")).toBe("test-app-secret");
  expect(parsed.searchParams.get("code")).toBe("auth-code-123");
});

test("бросает ошибку, если Meta не вернула access_token", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}))));
  await expect(exchangeCodeForToken("code")).rejects.toThrow("access_token");
});

test("бросает ошибку с текстом Meta при отказе в обмене токена", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("invalid code", { status: 400 })),
  );
  await expect(exchangeCodeForToken("bad-code")).rejects.toThrow("400");
});

test("регистрирует номер с pin и messaging_product", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
  vi.stubGlobal("fetch", fetchMock);

  await registerPhoneNumber("PNID-1", "TOKEN", "123456");

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v22.0/PNID-1/register");
  expect(init.method).toBe("POST");
  expect(init.headers.authorization).toBe("Bearer TOKEN");
  expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", pin: "123456" });
});

test("подписывает приложение на вебхуки WABA", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
  vi.stubGlobal("fetch", fetchMock);

  await subscribeWaba("WABA-1", "TOKEN");

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v22.0/WABA-1/subscribed_apps");
  expect(init.method).toBe("POST");
});

test("читает статус номера: качество и лимит", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          display_phone_number: "+7 701 123 45 67",
          verified_name: "Стоматология «Улыбка»",
          quality_rating: "GREEN",
          whatsapp_business_manager_messaging_limit: "TIER_250",
        }),
      ),
    ),
  );

  const info = await fetchPhoneNumberInfo("PNID-1", "TOKEN");

  expect(info).toEqual({
    displayPhoneNumber: "+7 701 123 45 67",
    verifiedName: "Стоматология «Улыбка»",
    qualityRating: "GREEN",
    messagingLimit: "TIER_250",
  });
});

test("отсутствующие поля статуса не роняют разбор ответа", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}))));

  const info = await fetchPhoneNumberInfo("PNID-1", "TOKEN");
  expect(info).toEqual({
    displayPhoneNumber: "",
    verifiedName: "",
    qualityRating: "UNKNOWN",
    messagingLimit: "UNKNOWN",
  });
});
