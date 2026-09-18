import { afterEach, expect, test, vi } from "vitest";
import type { Channel } from "@/generated/prisma/client";
import { adapterFor } from "@/lib/channels";
import { encryptJson } from "@/lib/crypto";

function fakeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: "chan1",
    organizationId: "org1",
    type: "TELEGRAM",
    connectionMethod: "TG_OWN_BOT",
    name: "Telegram-бот",
    isActive: true,
    status: "ACTIVE",
    statusError: null,
    connectStep: null,
    externalId: "987654321",
    externalUsername: "@test_bot",
    telegramUserId: null,
    credentialsEncrypted: encryptJson({ botToken: "123:TOKEN", webhookSecret: "secret" }),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("adapterFor возвращает telegram-адаптер по типу канала", async () => {
  const channel = fakeChannel();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }),
    ),
  );

  const result = await adapterFor(channel).sendText({ channel, to: "555", text: "Привет" });
  expect(result).toEqual({ externalMessageId: "7" });
});

test("без сохранённых секретов отправка падает с понятной ошибкой", async () => {
  const channel = fakeChannel({ credentialsEncrypted: null });
  await expect(
    adapterFor(channel).sendText({ channel, to: "555", text: "Привет" }),
  ).rejects.toThrow("не заданы секреты");
});
