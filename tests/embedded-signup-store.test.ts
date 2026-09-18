import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { completeEmbeddedSignup } from "@/lib/channels/embedded-signup-store";
import type { WhatsAppCredentials } from "@/lib/whatsapp/client";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-SIGNUP-ORG";
const newPhoneNumberId = "PNID-SIGNUP-NEW";
let organizationId: string;

const exchangeMock = vi.hoisted(() => vi.fn());
const registerMock = vi.hoisted(() => vi.fn());
const subscribeMock = vi.hoisted(() => vi.fn());
const fetchInfoMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/whatsapp/embedded-signup", () => ({
  exchangeCodeForToken: exchangeMock,
  registerPhoneNumber: registerMock,
  subscribeWaba: subscribeMock,
  fetchPhoneNumberInfo: fetchInfoMock,
}));

beforeEach(async () => {
  exchangeMock.mockReset();
  registerMock.mockReset();
  subscribeMock.mockReset();
  fetchInfoMock.mockReset();

  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.channel.deleteMany({ where: { externalId: newPhoneNumberId } });
  await prisma.$disconnect();
});

test("успешное подключение шифрует credentials и активирует канал", async () => {
  exchangeMock.mockResolvedValue({ accessToken: "TOKEN" });
  registerMock.mockResolvedValue(undefined);
  subscribeMock.mockResolvedValue(undefined);
  fetchInfoMock.mockResolvedValue({
    displayPhoneNumber: "+7 701 000 00 00",
    verifiedName: "Тест",
    qualityRating: "GREEN",
    messagingLimit: "TIER_250",
  });

  const result = await completeEmbeddedSignup({
    organizationId,
    code: "auth-code",
    phoneNumberId: newPhoneNumberId,
    wabaId: "WABA-1",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");

  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: result.channelId } });
  expect(channel.status).toBe("ACTIVE");
  expect(channel.connectionMethod).toBe("WA_EMBEDDED_SIGNUP");
  expect(channel.connectStep).toBeNull();
  expect(channel.externalUsername).toBe("+7 701 000 00 00");

  const creds = decryptJson<WhatsAppCredentials>(channel.credentialsEncrypted!);
  expect(creds.accessToken).toBe("TOKEN");
  expect(creds.phoneNumberId).toBe(newPhoneNumberId);
  expect(creds.wabaId).toBe("WABA-1");
  expect(creds.pin).toMatch(/^\d{6}$/);

  expect(registerMock).toHaveBeenCalledWith(newPhoneNumberId, "TOKEN", creds.pin);
  expect(subscribeMock).toHaveBeenCalledWith("WABA-1", "TOKEN");
});

test("сбой на шаге регистрации номера помечает канал ошибкой с указанием шага", async () => {
  exchangeMock.mockResolvedValue({ accessToken: "TOKEN" });
  registerMock.mockRejectedValue(new Error("Meta отклонила pin"));

  const result = await completeEmbeddedSignup({
    organizationId,
    code: "auth-code",
    phoneNumberId: newPhoneNumberId,
    wabaId: "WABA-1",
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.step).toBe("register_number");
  expect(result.error).toContain("Meta отклонила pin");
  expect(subscribeMock).not.toHaveBeenCalled();

  const channel = await prisma.channel.findFirstOrThrow({ where: { externalId: newPhoneNumberId } });
  expect(channel.status).toBe("ERROR");
  expect(channel.statusError).toContain("Meta отклонила pin");
  expect(channel.credentialsEncrypted).toBeNull();
});

test("повторный вызов после ошибки начинает заново и может завершиться успехом", async () => {
  exchangeMock.mockResolvedValueOnce({ accessToken: "TOKEN" }).mockResolvedValueOnce({ accessToken: "TOKEN" });
  registerMock.mockRejectedValueOnce(new Error("временный сбой")).mockResolvedValueOnce(undefined);
  subscribeMock.mockResolvedValue(undefined);
  fetchInfoMock.mockResolvedValue({
    displayPhoneNumber: "+7 701 000 00 00",
    verifiedName: "Тест",
    qualityRating: "GREEN",
    messagingLimit: "TIER_250",
  });

  const first = await completeEmbeddedSignup({
    organizationId,
    code: "auth-code-1",
    phoneNumberId: newPhoneNumberId,
    wabaId: "WABA-1",
  });
  expect(first.ok).toBe(false);

  const second = await completeEmbeddedSignup({
    organizationId,
    code: "auth-code-2",
    phoneNumberId: newPhoneNumberId,
    wabaId: "WABA-1",
  });
  expect(second.ok).toBe(true);

  const channels = await prisma.channel.findMany({ where: { externalId: newPhoneNumberId } });
  expect(channels).toHaveLength(1);
  expect(channels[0].status).toBe("ACTIVE");
});
