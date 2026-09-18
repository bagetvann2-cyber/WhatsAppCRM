import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { POST } from "@/app/api/channels/telegram/connect/route";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import type { TelegramCredentials } from "@/lib/telegram/client";
import { createTestOrg, dropTestOrg } from "./helpers";

const currentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ currentUser: currentUserMock }));

const getMeMock = vi.hoisted(() => vi.fn());
const setWebhookMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telegram/client", () => ({ getMe: getMeMock, sendMessage: vi.fn(), setWebhook: setWebhookMock }));

const phoneNumberId = "PNID-TG-CONNECT";
let organizationId: string;

beforeAll(async () => {
  process.env.PUBLIC_BASE_URL = "https://crm.neiroflow.kz";
  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

function signedIn() {
  currentUserMock.mockResolvedValue({
    user: { id: "u1", email: "owner@test.test" },
    organization: { id: organizationId, name: "Тест" },
    role: "OWNER",
  });
}

function request(body: unknown): Request {
  return new Request("https://example.com/api/channels/telegram/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  getMeMock.mockReset();
  setWebhookMock.mockReset();
  currentUserMock.mockReset();
  await prisma.channel.deleteMany({ where: { organizationId, type: "TELEGRAM" } });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("без роли админа/владельца подключить нельзя", async () => {
  currentUserMock.mockResolvedValue({
    user: { id: "u1", email: "op@test.test" },
    organization: { id: organizationId, name: "Тест" },
    role: "OPERATOR",
  });

  const response = await POST(request({ botToken: "123:TOKEN" }));
  expect(response.status).toBe(401);
  expect(getMeMock).not.toHaveBeenCalled();
});

test("проверяет токен, создаёт канал и регистрирует вебхук", async () => {
  signedIn();
  getMeMock.mockResolvedValue({ id: "987654321", username: "test_bot" });
  setWebhookMock.mockResolvedValue(undefined);

  const response = await POST(request({ botToken: "123:TOKEN" }));
  const result = await response.json();

  expect(response.status).toBe(200);
  expect(result.ok).toBe(true);

  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: result.channelId } });
  expect(channel.type).toBe("TELEGRAM");
  expect(channel.connectionMethod).toBe("TG_OWN_BOT");
  expect(channel.status).toBe("ACTIVE");
  expect(channel.externalId).toBe("987654321");
  expect(channel.externalUsername).toBe("@test_bot");

  const creds = decryptJson<TelegramCredentials>(channel.credentialsEncrypted!);
  expect(creds.botToken).toBe("123:TOKEN");

  expect(setWebhookMock).toHaveBeenCalledWith(
    "123:TOKEN",
    `https://crm.neiroflow.kz/api/webhook/telegram/${channel.id}`,
    creds.webhookSecret,
  );
});

test("неверный токен не создаёт канал", async () => {
  signedIn();
  getMeMock.mockRejectedValue(new Error("Unauthorized"));

  const response = await POST(request({ botToken: "bad-token" }));
  expect(response.status).toBe(400);
  expect(await prisma.channel.count({ where: { organizationId, type: "TELEGRAM" } })).toBe(0);
});

test("повторное подключение того же бота отклоняется", async () => {
  signedIn();
  getMeMock.mockResolvedValue({ id: "987654321", username: "test_bot" });
  setWebhookMock.mockResolvedValue(undefined);

  await POST(request({ botToken: "123:TOKEN" }));
  const second = await POST(request({ botToken: "123:TOKEN" }));

  expect(second.status).toBe(409);
  expect(await prisma.channel.count({ where: { organizationId, type: "TELEGRAM" } })).toBe(1);
});

test("сбой регистрации вебхука помечает канал ошибкой", async () => {
  signedIn();
  getMeMock.mockResolvedValue({ id: "111222333", username: "broken_bot" });
  setWebhookMock.mockRejectedValue(new Error("Telegram недоступен"));

  const response = await POST(request({ botToken: "999:TOKEN" }));
  expect(response.status).toBe(502);

  const channel = await prisma.channel.findFirstOrThrow({ where: { externalId: "111222333" } });
  expect(channel.status).toBe("ERROR");
  expect(channel.statusError).toContain("Telegram недоступен");
});
