import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DEFAULT_SCHEDULE } from "@/lib/automation";
import {
  decideAutoReply,
  getAutomation,
  runAutomation,
  saveAutomation,
  type AutomationSettings,
} from "@/lib/automation-store";
import { saveIncomingMessage } from "@/lib/ingest";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-AUTO";
const waId = "77013334455";
let organizationId: string;

const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: sendMock,
  sendTemplateMessage: vi.fn(),
}));

const workingHours = new Date("2026-08-17T05:00:00Z"); // пн, 10:00 в Алматы
const afterHours = new Date("2026-08-17T18:00:00Z"); // пн, 23:00 в Алматы

const base: AutomationSettings = {
  greetingEnabled: true,
  greetingText: "Здравствуйте! Скоро ответим.",
  awayEnabled: true,
  awayText: "Мы уже не работаем, ответим утром.",
  timezone: "Asia/Almaty",
  schedule: DEFAULT_SCHEDULE,
};

beforeEach(async () => {
  sendMock.mockReset();
  let counter = 0;
  sendMock.mockImplementation(async () => ({ wamid: `wamid.AUTO.${++counter}` }));

  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("по умолчанию автоответы выключены", async () => {
  const settings = await getAutomation(organizationId);

  expect(settings.greetingEnabled).toBe(false);
  expect(settings.awayEnabled).toBe(false);
  expect(settings.timezone).toBe("Asia/Almaty");
  expect(settings.schedule).toHaveLength(7);
});

test("настройки сохраняются и читаются обратно", async () => {
  await saveAutomation(organizationId, { ...base, greetingText: "Привет!" });

  const settings = await getAutomation(organizationId);
  expect(settings.greetingEnabled).toBe(true);
  expect(settings.greetingText).toBe("Привет!");
  expect(settings.awayText).toBe("Мы уже не работаем, ответим утром.");
});

test("пустой текст заменяется значением по умолчанию", async () => {
  await saveAutomation(organizationId, { ...base, greetingText: "   ", awayText: "" });

  const settings = await getAutomation(organizationId);
  expect(settings.greetingText).toContain("Здравствуйте");
  expect(settings.awayText).toContain("не работаем");
});

test("приветствие уходит только на первое сообщение", () => {
  expect(
    decideAutoReply({ settings: base, isFirstMessage: true, awayRepliedAt: null, now: workingHours }),
  ).toEqual({ kind: "greeting", text: base.greetingText });

  expect(
    decideAutoReply({ settings: base, isFirstMessage: false, awayRepliedAt: null, now: workingHours }),
  ).toBeNull();
});

test("вне рабочих часов уходит автоответ, в рабочие — нет", () => {
  const settings = { ...base, greetingEnabled: false };

  expect(
    decideAutoReply({ settings, isFirstMessage: false, awayRepliedAt: null, now: afterHours }),
  ).toEqual({ kind: "away", text: settings.awayText });

  expect(
    decideAutoReply({ settings, isFirstMessage: false, awayRepliedAt: null, now: workingHours }),
  ).toBeNull();
});

test("автоответ не повторяется в тот же вечер, но приходит на следующий", () => {
  const settings = { ...base, greetingEnabled: false };
  const justReplied = new Date(afterHours.getTime() - 30 * 60_000);
  const longAgo = new Date(afterHours.getTime() - 9 * 3600 * 1000);

  expect(
    decideAutoReply({ settings, isFirstMessage: false, awayRepliedAt: justReplied, now: afterHours }),
  ).toBeNull();

  expect(
    decideAutoReply({ settings, isFirstMessage: false, awayRepliedAt: longAgo, now: afterHours }),
  ).toMatchObject({ kind: "away" });
});

test("выключенные автоответы молчат", () => {
  const off = { ...base, greetingEnabled: false, awayEnabled: false };

  expect(
    decideAutoReply({ settings: off, isFirstMessage: true, awayRepliedAt: null, now: afterHours }),
  ).toBeNull();
});

async function incoming(text: string, wamid: string) {
  const result = await saveIncomingMessage({
    // wamid уникален глобально, как у Meta: без префикса файла тесты в
    // параллельном прогоне «съедают» сообщения друг друга дедупликацией.
    wamid: `${phoneNumberId}.${wamid}`,
    from: waId,
    profileName: "Асель",
    phoneNumberId,
    type: "text",
    text,
    media: null,
    timestamp: new Date(),
  });

  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }
  return result;
}

test("на первое обращение робот отвечает и сохраняет ответ в переписке", async () => {
  await saveAutomation(organizationId, base);
  const { conversationId } = await incoming("Здравствуйте", "wamid.IN.1");

  const reply = await runAutomation({
    organizationId,
    conversationId,
    waId,
    now: workingHours,
  });

  expect(reply).toMatchObject({ kind: "greeting" });
  expect(sendMock).toHaveBeenCalledWith(waId, base.greetingText);

  const messages = await prisma.message.findMany({ where: { conversationId } });
  expect(messages).toHaveLength(2);

  const outbound = messages.filter((m) => m.direction === "OUTBOUND");
  expect(outbound).toHaveLength(1);
  expect(outbound[0].text).toBe(base.greetingText);
});

test("на второе сообщение в рабочее время робот молчит", async () => {
  await saveAutomation(organizationId, base);
  const { conversationId } = await incoming("Здравствуйте", "wamid.IN.1");
  await runAutomation({ organizationId, conversationId, waId, now: workingHours });
  sendMock.mockClear();

  await incoming("Ещё вопрос", "wamid.IN.2");
  const reply = await runAutomation({ organizationId, conversationId, waId, now: workingHours });

  expect(reply).toBeNull();
  expect(sendMock).not.toHaveBeenCalled();
});

test("вечером второе сообщение получает автоответ один раз", async () => {
  await saveAutomation(organizationId, { ...base, greetingEnabled: false });
  const { conversationId } = await incoming("Вы работаете?", "wamid.IN.1");

  expect(await runAutomation({ organizationId, conversationId, waId, now: afterHours })).toMatchObject(
    { kind: "away" },
  );

  await incoming("Ау", "wamid.IN.2");
  expect(
    await runAutomation({ organizationId, conversationId, waId, now: afterHours }),
  ).toBeNull();

  expect(sendMock).toHaveBeenCalledTimes(1);
});

test("сбой отправки не роняет приём: входящее остаётся в базе", async () => {
  await saveAutomation(organizationId, base);
  sendMock.mockRejectedValueOnce(new Error("Graph API недоступен"));

  const { conversationId } = await incoming("Здравствуйте", "wamid.IN.1");
  const reply = await runAutomation({ organizationId, conversationId, waId, now: workingHours });

  expect(reply).toBeNull();
  expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
});
