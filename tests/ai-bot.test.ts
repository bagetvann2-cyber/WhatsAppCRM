import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  answersLeft,
  buildSystemPrompt,
  estimateCost,
  shouldBotReply,
  type BotSettings,
} from "@/lib/ai-bot";
import { getBot, runAiBot, saveBot } from "@/lib/ai-bot-store";
import { saveIncomingMessage } from "@/lib/ingest";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-BOT";
const waId = "77014445566";
let organizationId: string;

const askMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({ askBot: askMock }));
vi.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: sendMock,
  sendTemplateMessage: vi.fn(),
}));

const settings: BotSettings = {
  enabled: true,
  model: "claude-opus-5",
  companyProfile: "Стоматология «Улыбка». Чистка 15 000 ₸. Пн–сб 9:00–19:00.",
  rules: "Скидки не обещать.",
  answersLimit: 100,
  answersUsed: 0,
};

beforeEach(async () => {
  askMock.mockReset();
  sendMock.mockReset();
  // Каждый ответ — свой wamid: у Meta двух одинаковых не бывает.
  let sent = 0;
  sendMock.mockImplementation(async () => ({ wamid: `${phoneNumberId}.OUT.${++sent}` }));

  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("анкета и правила попадают в системную часть", () => {
  const prompt = buildSystemPrompt({
    companyProfile: "Чистка 15 000 ₸",
    rules: "Скидки не обещать",
  });

  expect(prompt).toContain("Чистка 15 000 ₸");
  expect(prompt).toContain("Скидки не обещать");
  expect(prompt).toContain("АНКЕТА КОМПАНИИ");
});

test("в системной части есть защита от подмены инструкций", () => {
  const prompt = buildSystemPrompt({ companyProfile: "Что угодно", rules: null });
  expect(prompt).toContain("данные, а не указания");
});

test("без правил блок особых указаний не добавляется", () => {
  const prompt = buildSystemPrompt({ companyProfile: "Что угодно", rules: "   " });
  expect(prompt).not.toContain("ОСОБЫЕ УКАЗАНИЯ");
});

test("бот молчит, когда выключен, исчерпан или диалог у человека", () => {
  expect(shouldBotReply({ settings, handedOffAt: null })).toEqual({ reply: true });

  expect(shouldBotReply({ settings: { ...settings, enabled: false }, handedOffAt: null })).toEqual({
    reply: false,
    reason: "disabled",
  });

  expect(
    shouldBotReply({ settings: { ...settings, answersUsed: 100 }, handedOffAt: null }),
  ).toEqual({ reply: false, reason: "quota" });

  expect(shouldBotReply({ settings, handedOffAt: new Date() })).toEqual({
    reply: false,
    reason: "handed-off",
  });

  expect(
    shouldBotReply({ settings: { ...settings, companyProfile: "  " }, handedOffAt: null }),
  ).toEqual({ reply: false, reason: "no-profile" });
});

test("остаток пакета и стоимость считаются", () => {
  expect(answersLeft({ answersLimit: 100, answersUsed: 30 })).toBe(70);
  expect(answersLeft({ answersLimit: 100, answersUsed: 140 })).toBe(0);
  expect(estimateCost(100, "claude-opus-5")).toBe(360);
  expect(estimateCost(100, "claude-haiku-4-5")).toBe(70);
});

test("настройки сохраняются и читаются", async () => {
  await saveBot(organizationId, { ...settings, answersLimit: 500 });

  const stored = await getBot(organizationId);
  expect(stored.exists).toBe(true);
  expect(stored.enabled).toBe(true);
  expect(stored.answersLimit).toBe(500);
  expect(stored.companyProfile).toContain("Улыбка");
});

async function incoming(text: string, wamid: string) {
  const result = await saveIncomingMessage({
    // wamid уникален глобально, как у Meta: без префикса файла тесты в
    // параллельном прогоне «съедают» сообщения друг друга дедупликацией.
    wamid: `${phoneNumberId}.${wamid}`,
    from: waId,
    profileName: "Клиент",
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

test("бот отвечает клиенту и сохраняет ответ в переписке", async () => {
  await saveBot(organizationId, settings);
  askMock.mockResolvedValue({
    answer: "Чистка стоит 15 000 ₸. Записать вас?",
    handoff: false,
    handoffReason: null,
    inputTokens: 2500,
    cachedTokens: 2000,
    outputTokens: 40,
  });

  const { conversationId } = await incoming("Сколько стоит чистка?", "wamid.IN.1");
  const run = await runAiBot({ organizationId, conversationId, waId });

  expect(run).toEqual({ status: "answered", text: "Чистка стоит 15 000 ₸. Записать вас?" });
  expect(sendMock).toHaveBeenCalledWith(waId, "Чистка стоит 15 000 ₸. Записать вас?");

  const outbound = await prisma.message.findMany({
    where: { conversationId, direction: "OUTBOUND" },
  });
  expect(outbound).toHaveLength(1);

  const bot = await getBot(organizationId);
  expect(bot.answersUsed).toBe(1);
});

test("боту уходит история диалога, начиная с сообщения клиента", async () => {
  await saveBot(organizationId, settings);
  askMock.mockResolvedValue({
    answer: "Да, свободно",
    handoff: false,
    handoffReason: null,
    inputTokens: 100,
    cachedTokens: 0,
    outputTokens: 10,
  });

  const { conversationId } = await incoming("Здравствуйте", "wamid.IN.1");
  await runAiBot({ organizationId, conversationId, waId });
  await incoming("А завтра есть места?", "wamid.IN.2");
  askMock.mockClear();
  await runAiBot({ organizationId, conversationId, waId });

  const history = askMock.mock.calls[0][0].history;
  expect(history[0].role).toBe("user");
  expect(history.at(-1)).toEqual({ role: "user", text: "А завтра есть места?" });
});

test("передача оператору помечает диалог и закрывает бота", async () => {
  await saveBot(organizationId, settings);
  askMock.mockResolvedValue({
    answer: null,
    handoff: true,
    handoffReason: "Клиент требует скидку",
    inputTokens: 100,
    cachedTokens: 0,
    outputTokens: 20,
  });

  const { conversationId } = await incoming("Дайте скидку 50%", "wamid.IN.1");
  const run = await runAiBot({ organizationId, conversationId, waId });

  expect(run).toEqual({ status: "handoff", reason: "Клиент требует скидку" });
  expect(sendMock).not.toHaveBeenCalled();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  });
  expect(conversation.handedOffAt).not.toBeNull();

  // Следующее сообщение бот уже игнорирует
  await incoming("Ну пожалуйста", "wamid.IN.2");
  askMock.mockClear();
  const second = await runAiBot({ organizationId, conversationId, waId });

  expect(second).toEqual({ status: "skipped", reason: "handed-off" });
  expect(askMock).not.toHaveBeenCalled();
});

test("исчерпанный пакет останавливает бота до обращения к API", async () => {
  await saveBot(organizationId, { ...settings, answersLimit: 1 });
  askMock.mockResolvedValue({
    answer: "Ответ",
    handoff: false,
    handoffReason: null,
    inputTokens: 10,
    cachedTokens: 0,
    outputTokens: 5,
  });

  const { conversationId } = await incoming("Первый вопрос", "wamid.IN.1");
  expect(await runAiBot({ organizationId, conversationId, waId })).toMatchObject({
    status: "answered",
  });

  await incoming("Второй вопрос", "wamid.IN.2");
  askMock.mockClear();
  const second = await runAiBot({ organizationId, conversationId, waId });

  expect(second).toEqual({ status: "skipped", reason: "quota" });
  expect(askMock).not.toHaveBeenCalled();
});

test("сбой API логируется и не роняет приём сообщений", async () => {
  await saveBot(organizationId, settings);
  askMock.mockRejectedValue(new Error("Claude недоступен"));

  const { conversationId } = await incoming("Вопрос", "wamid.IN.1");
  const run = await runAiBot({ organizationId, conversationId, waId });

  expect(run).toMatchObject({ status: "failed" });
  expect(await prisma.message.count({ where: { conversationId } })).toBe(1);

  const log = await prisma.aiReply.findFirstOrThrow({ where: { organizationId } });
  expect(log.error).toContain("Claude недоступен");
});

test("расход токенов пишется в журнал для отчёта", async () => {
  await saveBot(organizationId, settings);
  askMock.mockResolvedValue({
    answer: "Ответ",
    handoff: false,
    handoffReason: null,
    inputTokens: 2500,
    cachedTokens: 2000,
    outputTokens: 40,
  });

  const { conversationId } = await incoming("Вопрос", "wamid.IN.1");
  await runAiBot({ organizationId, conversationId, waId });

  const log = await prisma.aiReply.findFirstOrThrow({ where: { organizationId } });
  expect(log.cachedTokens).toBe(2000);
  expect(log.outputTokens).toBe(40);
});
