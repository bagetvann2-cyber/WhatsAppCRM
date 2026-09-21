import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { saveAutomation } from "@/lib/automation-store";
import { saveBot } from "@/lib/ai-bot-store";
import { processInboundMessage, runBotForMessage } from "@/lib/inbound-pipeline";
import { saveIncomingMessage } from "@/lib/ingest";
import type { ProcessMessageJob } from "@/lib/queue";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-PIPE";
const waId = "77019998877";
let organizationId: string;
let channelId: string;

const sendMock = vi.hoisted(() => vi.fn());
const askMock = vi.hoisted(() => vi.fn());
const enqueueBotMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/queue")>()),
  enqueueRunBot: enqueueBotMock,
}));
const typingMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/channels")>()),
  sendChannelText: sendMock,
  sendChannelTyping: typingMock,
}));
// Пауза «печатания» в тестах не нужна: проверяем, что индикатор показан, а не что прошло время.
vi.mock("@/lib/typing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/typing")>()),
  sleep: async () => {},
}));
vi.mock("@/lib/ai-client", () => ({ askBot: askMock }));

beforeEach(async () => {
  sendMock.mockReset();
  askMock.mockReset();
  enqueueBotMock.mockReset();
  typingMock.mockReset();
  let sent = 0;
  sendMock.mockImplementation(async () => ({ externalMessageId: `${phoneNumberId}.OUT.${++sent}` }));

  await dropTestOrg(phoneNumberId);
  const org = await createTestOrg(phoneNumberId);
  organizationId = org.id;
  channelId = org.channelId;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

async function incoming(text: string, wamid: string) {
  const result = await saveIncomingMessage({
    channelType: "WHATSAPP",
    externalMessageId: `${phoneNumberId}.${wamid}`,
    from: waId,
    profileName: "Клиент",
    channelExternalId: phoneNumberId,
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

function job(overrides: Partial<ProcessMessageJob> & Pick<ProcessMessageJob, "messageId" | "conversationId">): ProcessMessageJob {
  return {
    organizationId,
    channelId,
    to: waId,
    text: null,
    hasMedia: false,
    ...overrides,
  };
}

test("отписка отправляет подтверждение и глушит автоответ с ботом", async () => {
  await saveAutomation(organizationId, {
    greetingEnabled: true,
    greetingText: "Здравствуйте!",
    awayEnabled: false,
    awayText: "",
    timezone: "Asia/Almaty",
    schedule: [],
  });

  const { conversationId, messageId } = await incoming("стоп", "wamid.1");
  await processInboundMessage(job({ messageId, conversationId, text: "стоп" }));

  expect(sendMock).toHaveBeenCalledTimes(1);
  expect(sendMock).toHaveBeenCalledWith(
    expect.objectContaining({ to: waId, text: expect.stringContaining("отписаны") }),
  );
  expect(askMock).not.toHaveBeenCalled();

  const contact = await prisma.contact.findFirstOrThrow({ where: { channelId, externalUserId: waId } });
  expect(contact.unsubscribedAt).not.toBeNull();
});

test("автоответ отправляется, ИИ-бот при этом не вызывается", async () => {
  await saveAutomation(organizationId, {
    greetingEnabled: true,
    greetingText: "Здравствуйте! Скоро ответим.",
    awayEnabled: false,
    awayText: "",
    timezone: "Asia/Almaty",
    schedule: [],
  });
  await saveBot(organizationId, {
    enabled: true,
    model: "claude-opus-5",
    companyProfile: "Компания",
    rules: null,
  });

  const { conversationId, messageId } = await incoming("Здравствуйте", "wamid.1");
  await processInboundMessage(job({ messageId, conversationId, text: "Здравствуйте" }));

  expect(sendMock).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Здравствуйте! Скоро ответим." }),
  );
  expect(askMock).not.toHaveBeenCalled();
});

test("без автоответов ИИ-бот отвечает и сохраняет ответ", async () => {
  await saveBot(organizationId, {
    enabled: true,
    model: "claude-opus-5",
    companyProfile: "Стоматология «Улыбка»",
    rules: null,
  });
  askMock.mockResolvedValue({
    answer: "Чем можем помочь?",
    handoff: false,
    handoffReason: null,
    inputTokens: 100,
    cachedTokens: 0,
    outputTokens: 10,
  });

  const { conversationId, messageId } = await incoming("Здравствуйте", "wamid.1");
  await processInboundMessage(job({ messageId, conversationId, text: "Здравствуйте" }));

  // Бот не отвечает сразу, а ставит отложенное задание.
  expect(askMock).not.toHaveBeenCalled();
  expect(enqueueBotMock).toHaveBeenCalledTimes(1);

  await runBotForMessage(enqueueBotMock.mock.calls[0][0]);

  expect(askMock).toHaveBeenCalledTimes(1);
  // «Печатает…» показано один раз и с привязкой к входящему сообщению (нужно WhatsApp).
  expect(typingMock).toHaveBeenCalledTimes(1);
  expect(typingMock).toHaveBeenCalledWith(
    expect.objectContaining({ to: waId, inboundMessageId: `${phoneNumberId}.wamid.1` }),
  );
  const outbound = await prisma.message.findMany({ where: { conversationId, direction: "OUTBOUND" } });
  expect(outbound).toHaveLength(1);
  expect(outbound[0].text).toBe("Чем можем помочь?");
});

test("серия быстрых сообщений: бот отвечает один раз, на последнее задание", async () => {
  await saveBot(organizationId, {
    enabled: true,
    model: "claude-opus-5",
    companyProfile: "Пиццерия",
    rules: null,
  });
  askMock.mockResolvedValue({
    answer: "Какую пиццу записать?",
    handoff: false,
    handoffReason: null,
    inputTokens: 100,
    cachedTokens: 0,
    outputTokens: 10,
  });

  const first = await incoming("привет", "wamid.1");
  const second = await incoming("хочу заказать", "wamid.2");
  const third = await incoming("пиццу", "wamid.3");
  const jobs = [first, second, third].map((m, i) =>
    job({ messageId: m.messageId, conversationId: first.conversationId, text: ["привет", "хочу заказать", "пиццу"][i] }),
  );

  // Задания приходят по очереди, как их достанет воркер.
  for (const j of jobs) await runBotForMessage(j);

  expect(askMock).toHaveBeenCalledTimes(1);
  // Пропущенные задания серии «печатает…» не показывают: индикатор только у того, кто ответит.
  expect(typingMock).toHaveBeenCalledTimes(1);
  const outbound = await prisma.message.findMany({
    where: { conversationId: first.conversationId, direction: "OUTBOUND" },
  });
  expect(outbound).toHaveLength(1);
});
