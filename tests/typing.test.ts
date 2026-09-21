import { afterEach, expect, test, vi } from "vitest";
import type { Channel } from "@/generated/prisma/client";
import { sendTypingAction } from "@/lib/telegram/client";
import { sendTypingIndicator } from "@/lib/whatsapp/client";

const channelsMock = vi.hoisted(() => ({ sendChannelTyping: vi.fn() }));
vi.mock("@/lib/channels", () => channelsMock);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  channelsMock.sendChannelTyping.mockReset();
});

test("пауза печатания растёт с длиной ответа, но в пределах от 1 до 5 секунд", async () => {
  const { humanTypingMs } = await import("@/lib/typing");
  expect(humanTypingMs("Да")).toBe(1000);
  expect(humanTypingMs("x".repeat(100))).toBe(3000);
  expect(humanTypingMs("x".repeat(1000))).toBe(5000);
});

test("Telegram: sendChatAction typing в нужный чат", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await sendTypingAction("123:TOKEN", "555");

  expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:TOKEN/sendChatAction");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ chat_id: "555", action: "typing" });
});

test("WhatsApp: индикатор привязан к входящему сообщению", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  await sendTypingIndicator({ accessToken: "tok", phoneNumberId: "PN1" }, "wamid.IN1");

  expect(fetchMock.mock.calls[0][0]).toContain("/PN1/messages");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.IN1",
    typing_indicator: { type: "text" },
  });
});

test("в Telegram «печатает…» обновляется каждые 4 секунды до stop, в WhatsApp — один раз", async () => {
  vi.useFakeTimers();
  const { startTyping } = await import("@/lib/typing");
  const input = { to: "555", inboundMessageId: "m1" };

  const tg = startTyping({ ...input, channel: { type: "TELEGRAM" } as Channel });
  expect(channelsMock.sendChannelTyping).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(8500);
  expect(channelsMock.sendChannelTyping).toHaveBeenCalledTimes(3);
  tg.stop();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(channelsMock.sendChannelTyping).toHaveBeenCalledTimes(3);

  channelsMock.sendChannelTyping.mockClear();
  const wa = startTyping({ ...input, channel: { type: "WHATSAPP" } as Channel });
  await vi.advanceTimersByTimeAsync(20_000);
  expect(channelsMock.sendChannelTyping).toHaveBeenCalledTimes(1);
  wa.stop();
});
